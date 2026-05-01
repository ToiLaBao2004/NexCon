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

// Track active calls: callerId -> direct call session (roomName, participants, status, callType)
const activeCalls = new Map();

function getReceiverSocketId(userId) {
    return onlineUsers.get(userId);
}

function emitToUser(userId, event, data) {
    const socketId = onlineUsers.get(userId.toString());
    if (!socketId) {
        return false;
    }

    io.to(socketId).emit(event, data);
    return true;
}

configureSocketGateway(io, getReceiverSocketId);

io.on("connection", async (socket) => {
    const user = socket.user;

    console.log(`${user.displayName} connected to socket ${socket.id}`);

    onlineUsers.set(user._id.toString(), socket.id);

    io.emit("online-users", Array.from(onlineUsers.keys()));

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

        // Xử lý cuộc gọi đang active (lưu DB + thông báo đối phương)
        await handleCallDisconnect(userId, activeCalls, io, getReceiverSocketId);

        // Xử lý group call đang active
        await handleGroupCallDisconnect(userId, io);

        onlineUsers.delete(userId);
        io.emit("online-users", Array.from(onlineUsers.keys()));
        console.log(`Socket Disconnected: ${socket.id}`);
    });
});

export { io, app, server, getReceiverSocketId, emitToUser };