import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import { searchUserByEmailAndPhone } from "../controllers/userController.js";
import Conversation from "../models/conversationModel.js";

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

// Track active calls: callerId -> { callerId, receiverId, status: "calling" | "in-call" }
const activeCalls = new Map();

io.on("connection", async (socket) => {
    const user = socket.user;

    console.log(`${user.displayName} connected to socket ${socket.id}`);

    onlineUsers.set(user._id.toString(), socket.id);

    io.emit("online-users", Array.from(onlineUsers.keys()));

    const conversationIds = await getUserConversationsForSocketIO(user._id);
    conversationIds.forEach((id) => {
        socket.join(id);
    });

    socket.on("join-conversation", async ({ conversationId }) => {
        const conversation = await Conversation.findById(conversationId);
        if (conversation && conversation.participants.some(p => p.userId.toString() === user._id.toString())) {
            socket.join(conversationId);
            console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
        }
    });

    socket.on("search-user", (payload) => searchUserByEmailAndPhone(socket, payload));

    socket.on("typing", ({ conversationId }) => {
        socket.to(conversationId).emit("user-typing", { conversationId, userId: user._id.toString() });
    });

    socket.on("stop-typing", ({ conversationId }) => {
        socket.to(conversationId).emit("user-stopped-typing", { conversationId, userId: user._id.toString() });
    });

    // CALL 

    // A gọi B — gửi WebRTC offer
    socket.on("call-offer", ({ toUserId, offer, callType }) => {
        const callerId = user._id.toString();
        const receiverId = toUserId.toString();

        // Kiểm tra B có online không
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (!receiverSocketId) {
            socket.emit("call-failed", { reason: "offline" });
            return;
        }

        // Kiểm tra B có đang trong cuộc gọi khác không
        const isReceiverBusy = [...activeCalls.values()].some(
            (call) => call.receiverId === receiverId || call.callerId === receiverId
        );
        if (isReceiverBusy) {
            socket.emit("call-failed", { reason: "busy" });
            return;
        }

        // Đăng ký cuộc gọi đang chờ
        activeCalls.set(callerId, { callerId, receiverId, status: "calling" });

        io.to(receiverSocketId).emit("incoming-call", {
            from: {
                _id: user._id,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
            },
            offer,
            callType, // "voice" | "video"
        });

        console.log(`${user.displayName} is calling ${receiverId} [${callType}]`);
    });

    // B chấp nhận — gửi WebRTC answer về A
    socket.on("call-answer", ({ toUserId, answer }) => {
        const callerId = toUserId.toString();
        const receiverId = user._id.toString();

        const callerSocketId = getReceiverSocketId(callerId);
        if (!callerSocketId) return;

        // Cập nhật trạng thái thành in-call
        if (activeCalls.has(callerId)) {
            activeCalls.set(callerId, { callerId, receiverId, status: "in-call" });
        }

        io.to(callerSocketId).emit("call-answered", { answer });

        console.log(`${user.displayName} accepted call from ${callerId}`);
    });

    // Trao đổi ICE candidates (chạy song song cả 2 chiều)
    socket.on("ice-candidate", ({ toUserId, candidate }) => {
        const receiverSocketId = getReceiverSocketId(toUserId.toString());
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("ice-candidate", { candidate });
        }
    });

    // B từ chối cuộc gọi
    socket.on("call-rejected", ({ toUserId }) => {
        const callerId = toUserId.toString();

        activeCalls.delete(callerId);

        const callerSocketId = getReceiverSocketId(callerId);
        if (callerSocketId) {
            io.to(callerSocketId).emit("call-rejected", {
                by: {
                    _id: user._id,
                    displayName: user.displayName,
                }
            });
        }

        console.log(`${user.displayName} rejected call from ${callerId}`);
    });

    // Một trong hai bên kết thúc cuộc gọi
    socket.on("call-ended", ({ toUserId }) => {
        const myId = user._id.toString();
        const otherId = toUserId.toString();

        // Xóa khỏi activeCalls (thử cả 2 chiều vì không biết ai là caller)
        activeCalls.delete(myId);
        activeCalls.delete(otherId);

        const otherSocketId = getReceiverSocketId(otherId);
        if (otherSocketId) {
            io.to(otherSocketId).emit("call-ended");
        }

        console.log(`Call ended between ${myId} and ${otherId}`);
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────

    socket.on("disconnect", () => {
        const userId = user._id.toString();

        // Tìm cuộc gọi mà người dùng này đang tham gia (là người gọi hoặc người nhận)
        let foundCallerId = null;
        let otherId = null;

        for (const [callerId, call] of activeCalls.entries()) {
            if (call.callerId === userId) {
                foundCallerId = callerId;
                otherId = call.receiverId;
                break;
            } else if (call.receiverId === userId) {
                foundCallerId = callerId;
                otherId = call.callerId;
                break;
            }
        }

        if (foundCallerId) {
            const otherSocketId = getReceiverSocketId(otherId);
            if (otherSocketId) {
                io.to(otherSocketId).emit("call-ended");
            }
            activeCalls.delete(foundCallerId);
            console.log(`Call auto-ended: ${userId} disconnected`);
        }

        onlineUsers.delete(userId);
        io.emit("online-users", Array.from(onlineUsers.keys()));
        console.log(`Socket Disconnected: ${socket.id}`);
    });
})

function getReceiverSocketId(userId) {
    return onlineUsers.get(userId);
}

export { io, app, server, getReceiverSocketId };