import {Server} from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
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

io.on("connection", async (socket) => {
    const user = socket.user;

    console.log(`${user.displayName} connected to socket ${socket.id}` );

    onlineUsers.set(user._id, socket.id);

    io.emit("online-users", Array.from(onlineUsers.keys()));

    const conversationIds = await getUserConversationsForSocketIO(user._id);
    conversationIds.forEach((id) =>{
        socket.join(id);
    });

    socket.on("disconnect", () => {
        onlineUsers.delete(user._id);
        io.emit("online-users", Array.from(onlineUsers.keys()));
        console.log(`Socket Disconnected: ${socket.id}`);
    });
})

export { io, app, server };