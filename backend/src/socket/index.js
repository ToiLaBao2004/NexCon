import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import Conversation from "../models/conversationModel.js";
import { registerCallHandlers, handleCallDisconnect } from "./callHandler.js";
import { registerGroupCallHandlers, handleGroupCallDisconnect } from "./groupCallHandler.js";
import { configureSocketGateway } from "./socketGateway.js";
import Message from "../models/messageModel.js";
import redis, { isRedisReady } from "../config/redis.js";

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true,
    }
});

io.use(socketAuthMiddleware);

const onlineUsers = new Map();

// Xóa danh sách online cũ trên Redis khi Server khởi động (đề phòng server sập trước đó)
if (isRedisReady) {
    redis.del("online_users").catch(console.error);
}

// Track active calls: callerId -> direct call session (roomName, participants, status, callType)
const activeCalls = new Map();

function getReceiverSocketId(userId) {
    return onlineUsers.get(userId);
}

function emitToUser(userId, event, data) {
    const room = `user:${userId.toString()}`;
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (!roomSockets || roomSockets.size === 0) return false;
    io.to(room).emit(event, data);
    return true;
}

configureSocketGateway(io, getReceiverSocketId);

io.on("connection", async (socket) => {
    const user = socket.user;
    const userId = user._id.toString();

    console.log(`${user.displayName} connected to socket ${socket.id}`);

    socket.join(`user:${userId}`);

    // 1. Vẫn giữ Local Map để phục vụ gửi tin nhắn trực tiếp qua Socket
    onlineUsers.set(userId, socket.id);

    // 2. Logic Redis: Quản lý trạng thái Online/Offline chuyên nghiệp (Presence System)
    if (isRedisReady) {
        try {
            // Tăng bộ đếm số thiết bị đang kết nối của user này (Multi-device)
            await redis.incr(`user:connections:${userId}`);

            // Đánh dấu online với TTL 120s
            await redis.set(`user:online:${userId}`, 'true', { EX: 120 });
            await redis.sAdd("online_users", userId);

            // Gửi danh sách online mới nhất cho tất cả client
            const allOnlineUsers = await redis.sMembers("online_users");
            io.emit("online-users", allOnlineUsers);
        } catch (err) {
            console.error("Lỗi cập nhật Redis Presence:", err);
        }
    }

    // 3. Heartbeat: Gia hạn (refresh) trạng thái online mỗi 60s
    // Đảm bảo không bị treo trạng thái online (user đã mất kết nối nhưng hệ thống vẫn hiện online) kể cả khi client tắt trình duyệt hoặc rớt mạng đột ngột
    const heartbeatInterval = setInterval(async () => {
        if (!isRedisReady) return;
        try {
            await redis.expire(`user:online:${userId}`, 120);
            await redis.expire(`user:connections:${userId}`, 120);
        } catch (err) {
            console.error("Lỗi gia hạn Redis Presence:", err);
        }
    }, 60000);

    // Join tất cả conversation rooms
    const conversationIds = await getUserConversationsForSocketIO(user._id);
    conversationIds.forEach((id) => {
        socket.join(id);
    });

    // Join conversation theo yêu cầu
    socket.on("join-conversation", async ({ conversationId }) => {
        const conversation = await Conversation.findById(conversationId);
        if (conversation && conversation.participants.some(p => p.userId.toString() === user._id.toString())) {
            socket.join(conversationId);
            console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
        }
    });

    // Typing indicators
    socket.on("typing", ({ conversationId }) => {
        socket.to(conversationId).emit("user-typing", { conversationId, userId: user._id.toString() });
    });

    socket.on("stop-typing", ({ conversationId }) => {
        socket.to(conversationId).emit("user-stopped-typing", { conversationId, userId: user._id.toString() });
    });

    socket.on("message-delivered", async ({ messageId, conversationId }) => {
        try {
            const userId = user._id.toString();
            const msg = await Message.findByIdAndUpdate(
                messageId,
                { $addToSet: { deliveredTo: userId } },
                { new: true, select: 'senderId' }
            );
            if (msg) {
                const senderSocketId = getReceiverSocketId(msg.senderId.toString());
                if (senderSocketId) {
                    io.to(senderSocketId).emit("message-delivered-ack", { messageId, conversationId });
                }
            }
        } catch (err) {
            console.error("Error handling message-delivered:", err);
        }
    });

    // Call handlers (tách riêng)
    registerCallHandlers(socket, user, activeCalls, onlineUsers, io, getReceiverSocketId);

    // Group call handlers
    registerGroupCallHandlers(socket, user, onlineUsers, io, getReceiverSocketId);

    // Disconnect
    socket.on("disconnect", async () => {
        const userId = user._id.toString();

        // Ngừng gia hạn heartbeat
        clearInterval(heartbeatInterval);

        // Xử lý cuộc gọi đang active (lưu DB + thông báo đối phương)
        await handleCallDisconnect(userId, activeCalls, io, getReceiverSocketId);

        // Xử lý group call đang active
        await handleGroupCallDisconnect(userId, io);

        // Xóa khỏi Local Map
        onlineUsers.delete(userId);

        // Cập nhật Redis Presence
        if (isRedisReady) {
            try {
                const connectionsLeft = await redis.decr(`user:connections:${userId}`);

                // Nếu <= 0 nghĩa là user đã đóng TẤT CẢ các tab/thiết bị
                if (connectionsLeft <= 0) {
                    await redis.del(`user:connections:${userId}`);
                    await redis.del(`user:online:${userId}`);
                    await redis.sRem("online_users", userId);

                    // Báo cho mọi người là user này đã thực sự Offline
                    const allOnlineUsers = await redis.sMembers("online_users");
                    io.emit("online-users", allOnlineUsers);
                }
            } catch (err) {
                console.error("Lỗi xóa Redis Presence khi disconnect:", err);
            }
        }

        console.log(`Socket Disconnected: ${socket.id}`);
    });
});

export { io, app, server, getReceiverSocketId, emitToUser };