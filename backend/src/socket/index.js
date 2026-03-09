import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import { searchUserByEmailAndPhone } from "../controllers/userController.js";
import Conversation from "../models/conversationModel.js";
import { registerCallHandlers, handleCallDisconnect } from "./callHandler.js";

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

// Track active calls: callerId -> { callerId, receiverId, callId, conversationId, status }
const activeCalls = new Map();

function getReceiverSocketId(userId) {
    return onlineUsers.get(userId);
}

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

    // Search user
    socket.on("search-user", (payload) => searchUserByEmailAndPhone(socket, payload));

    // Typing indicators
    socket.on("typing", ({ conversationId }) => {
        socket.to(conversationId).emit("user-typing", { conversationId, userId: user._id.toString() });
    });

    socket.on("stop-typing", ({ conversationId }) => {
        socket.to(conversationId).emit("user-stopped-typing", { conversationId, userId: user._id.toString() });
    });

    // Call handlers (tách riêng)
    registerCallHandlers(socket, user, activeCalls, onlineUsers, io, getReceiverSocketId);

    // Disconnect
    socket.on("disconnect", async () => {
        const userId = user._id.toString();

        // Xử lý cuộc gọi đang active (lưu DB + thông báo đối phương)
        await handleCallDisconnect(userId, activeCalls, io, getReceiverSocketId);

        onlineUsers.delete(userId);
        io.emit("online-users", Array.from(onlineUsers.keys()));
        console.log(`Socket Disconnected: ${socket.id}`);
    });
});

export { io, app, server, getReceiverSocketId };