import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware, validateSocketSession } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import Conversation from "../models/conversationModel.js";
import BlockUser from "../models/blockUserModel.js";
import Friend from "../models/friendModel.js";
import { registerCallHandlers, handleCallDisconnect, emitPendingDirectCallsForUser } from "./callHandler.js";
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

const USER_ROOM_PREFIX = "user:";
const SESSION_ROOM_PREFIX = "session:";

// Track active direct calls by sorted user pair.
const activeCalls = new Map();

function getUserRoom(userId) {
    return `${USER_ROOM_PREFIX}${userId.toString()}`;
}

function getSessionRoom(sessionId) {
    return `${SESSION_ROOM_PREFIX}${sessionId.toString()}`;
}

function getOnlineUserIds() {
    const onlineUserIds = [];
    for (const [roomName, sockets] of io.sockets.adapter.rooms) {
        if (roomName.startsWith(USER_ROOM_PREFIX) && sockets.size > 0) {
            onlineUserIds.push(roomName.slice(USER_ROOM_PREFIX.length));
        }
    }
    return onlineUserIds;
}

function isUserOnline(userId) {
    const roomSockets = io.sockets.adapter.rooms.get(getUserRoom(userId));
    return Boolean(roomSockets && roomSockets.size > 0);
}

async function emitOnlineUsers() {
    try {
        const allOnlineIds = getOnlineUserIds();
        const sockets = Array.from(io.sockets.sockets.values());
        
        const userSocketsMap = new Map();
        sockets.forEach(s => {
            const uid = s.user?._id?.toString();
            if (uid) {
                if (!userSocketsMap.has(uid)) userSocketsMap.set(uid, []);
                userSocketsMap.get(uid).push(s);
            }
        });

        await Promise.all(Array.from(userSocketsMap.entries()).map(async ([userId, clientSockets]) => {
            try {
                const blocks = await BlockUser.find({
                    $or: [
                        { from: userId },
                        { to: userId }
                    ]
                }).lean();

                const blockedIds = new Set(blocks.map(b => 
                    b.from.toString() === userId ? b.to.toString() : b.from.toString()
                ));

                const filteredIds = allOnlineIds.filter(id => !blockedIds.has(id));
                
                clientSockets.forEach(s => s.emit("online-users", filteredIds));
            } catch (err) {
                console.error(`Error filtering online users for ${userId}:`, err);
            }
        }));
    } catch (err) {
        console.error("Critical error in emitOnlineUsers:", err);
    }
}

function getReceiverSocketId(userId) {
    return isUserOnline(userId) ? getUserRoom(userId) : null;
}

function emitToUser(userId, event, data) {
    const room = getUserRoom(userId);
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (!roomSockets || roomSockets.size === 0) return false;
    io.to(room).emit(event, data);
    return true;
}

function joinUserSocketsToRoom(userId, roomName) {
    if (!isUserOnline(userId)) return false;
    io.in(getUserRoom(userId)).socketsJoin(roomName.toString());
    return true;
}

function leaveUserSocketsFromRoom(userId, roomName) {
    if (!isUserOnline(userId)) return false;
    io.in(getUserRoom(userId)).socketsLeave(roomName.toString());
    return true;
}

function disconnectSocketRoom(roomName, reason = "session-revoked") {
    const roomSockets = io.sockets.adapter.rooms.get(roomName);
    if (!roomSockets || roomSockets.size === 0) return 0;

    let disconnectedCount = 0;
    for (const socketId of Array.from(roomSockets)) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (!targetSocket) continue;

        targetSocket.emit("session-revoked", { reason });
        targetSocket.disconnect(true);
        disconnectedCount += 1;
    }

    return disconnectedCount;
}

function disconnectSessionSockets(sessionId, reason = "session-revoked") {
    if (!sessionId) return 0;
    return disconnectSocketRoom(getSessionRoom(sessionId), reason);
}

function disconnectUserSockets(userId, reason = "session-revoked") {
    if (!userId) return 0;
    return disconnectSocketRoom(getUserRoom(userId), reason);
}

configureSocketGateway({
    io,
    getReceiverSocketId,
    emitToUser,
    isUserOnline,
    joinUserSocketsToRoom,
    leaveUserSocketsFromRoom,
});

io.on("connection", async (socket) => {
    const user = socket.user;
    const userId = user._id.toString();
    const sessionId = socket.sessionId?.toString();

    console.log(`${user.displayName} connected to socket ${socket.id}`);

    socket.join(getUserRoom(userId));
    if (sessionId) {
        socket.join(getSessionRoom(sessionId));
    }
    await emitOnlineUsers();

    socket.use(async (_packet, next) => {
        try {
            const isSessionValid = await validateSocketSession(socket);
            if (!isSessionValid) {
                socket.emit("session-revoked", { reason: "session-expired-or-revoked" });
                socket.disconnect(true);
                return next(new Error("Unauthorized - Session expired or revoked"));
            }

            return next();
        } catch (error) {
            console.error("Error validating socket session:", error);
            socket.emit("session-revoked", { reason: "session-validation-failed" });
            socket.disconnect(true);
            return next(new Error("Unauthorized - Session validation failed"));
        }
    });

    // Join tất cả conversation rooms
    const conversationIds = await getUserConversationsForSocketIO(user._id);
    conversationIds.forEach((id) => {
        if (!socket.rooms.has(id)) {
            socket.join(id);
        }
    });

    // Join conversation theo yêu cầu
    socket.on("join-conversation", async ({ conversationId }) => {
        if (socket.rooms.has(conversationId)) return;
        const conversation = await Conversation.findById(conversationId);
        if (conversation && conversation.participants.some(p => p.userId.toString() === user._id.toString())) {
            socket.join(conversationId);
            console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
        }
    });

    // Typing indicators
    const handleTypingEvent = async (event, { conversationId }) => {
        try {
            const conversation = await Conversation.findById(conversationId).select("type participants").lean();
            if (!conversation) return;

            if (conversation.type === "direct") {
                const myId = user._id.toString();
                const otherParticipant = conversation.participants.find(p => p.userId.toString() !== myId);
                if (otherParticipant) {
                    const [blockExists, friendExists] = await Promise.all([
                        BlockUser.findOne({
                            $or: [
                                { from: myId, to: otherParticipant.userId },
                                { from: otherParticipant.userId, to: myId }
                            ]
                        }).lean(),
                        Friend.findOne({
                            $or: [
                                { userA: myId, userB: otherParticipant.userId },
                                { userA: otherParticipant.userId, userB: myId }
                            ]
                        }).lean()
                    ]);

                    if (blockExists || !friendExists) return;
                }
            }
            socket.to(conversationId).emit(event, { conversationId, userId: user._id.toString() });
        } catch (error) {
            console.error(`Error handling ${event}:`, error);
        }
    };

    socket.on("typing", (data) => handleTypingEvent("user-typing", data));
    socket.on("stop-typing", (data) => handleTypingEvent("user-stopped-typing", data));

    socket.on("message-delivered", async ({ messageId, conversationId }) => {
        try {
            const userId = user._id.toString();
            if (!messageId || !conversationId) {
                return;
            }

            const conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': userId,
            }).select('_id');

            if (!conversation) {
                console.warn(`Rejected message-delivered from non-member ${userId} for conversation ${conversationId}`);
                return;
            }

            const msg = await Message.findOneAndUpdate(
                {
                    _id: messageId,
                    conversationId: conversation._id,
                    senderId: { $ne: userId },
                    deliveredTo: { $ne: userId },
                },
                { $addToSet: { deliveredTo: userId } },
                { new: true, select: 'senderId' }
            );
            if (msg) {
                emitToUser(userId, "message-delivered-sync", {
                    messageId,
                    conversationId,
                    deliveredUserId: userId,
                });

                const senderSocketId = getReceiverSocketId(msg.senderId.toString());
                if (senderSocketId) {
                    io.to(senderSocketId).emit("message-delivered-ack", {
                        messageId,
                        conversationId,
                        deliveredUserId: userId,
                    });
                }
            }
        } catch (err) {
            console.error("Error handling message-delivered:", err);
        }
    });

    // Call handlers (tách riêng)
    registerCallHandlers(socket, user, activeCalls, io, getReceiverSocketId);

    // Group call handlers
    registerGroupCallHandlers(socket, user, io, getReceiverSocketId, activeCalls);

    emitPendingDirectCallsForUser(socket, userId, activeCalls, io, getReceiverSocketId);

    // Disconnect
    socket.on("disconnect", async () => {
        const userId = user._id.toString();
        await emitOnlineUsers();

        // Xử lý cuộc gọi đang active (lưu DB + thông báo đối phương)
        await handleCallDisconnect(userId, socket.id, activeCalls, io, getReceiverSocketId);

        // Xử lý group call đang active
        await handleGroupCallDisconnect(userId, socket.id, io);

        console.log(`Socket Disconnected: ${socket.id}`);
    });
});

export {
    io,
    app,
    server,
    getReceiverSocketId,
    emitToUser,
    isUserOnline,
    joinUserSocketsToRoom,
    leaveUserSocketsFromRoom,
    disconnectSessionSockets,
    disconnectUserSockets,
    emitOnlineUsers,
};
