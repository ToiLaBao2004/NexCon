import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware, validateSocketSession } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import Conversation from "../models/conversationModel.js";
import BlockUser from "../models/blockUserModel.js";
import Friend from "../models/friendModel.js";
import { registerCallHandlers, handleCallDisconnect, emitPendingDirectCallsForUser, declineDirectCallFromPush } from "./callHandler.js";
import { registerGroupCallHandlers, handleGroupCallDisconnect, emitPendingGroupCallsForUser, declineGroupCallFromPush } from "./groupCallHandler.js";
import { configureSocketGateway } from "./socketGateway.js";
import Message from "../models/messageModel.js";
import { buildUnexpiredMessageFilter } from "../utils/disappearingMessages.js";
import { buildPresencePayloadForViewer, touchUserActivity } from "../services/userStatusService.js";
import { configureSocketIoRedisAdapter } from "../config/socketIoRedisAdapter.js";
import {
    getOnlineUserIdsFromRedis,
    getOnlineUserIdsForUsersFromRedis,
    isUserOnlineInRedis,
    refreshSocketPresence,
    registerSocketPresence,
    removeSocketPresence,
} from "../services/socketPresenceService.js";

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true,
    }
});

const socketRedisAdapterReady = configureSocketIoRedisAdapter(io).catch((error) => {
    console.error("[Socket.IO] Redis adapter setup failed:", error.message);
    return false;
});

io.use(socketAuthMiddleware);

const USER_ROOM_PREFIX = "user:";
const SESSION_ROOM_PREFIX = "session:";
const PRESENCE_FLUSH_DELAY_MS = Number(process.env.PRESENCE_FLUSH_DELAY_MS || 2000);

let presenceFlushTimer = null;
let presenceFlushInProgress = false;
let pendingPresenceBroadcast = false;
let pendingPresenceFlush = false;

function getUserRoom(userId) {
    return `${USER_ROOM_PREFIX}${userId.toString()}`;
}

function getSessionRoom(sessionId) {
    return `${SESSION_ROOM_PREFIX}${sessionId.toString()}`;
}

async function getOnlineUserIds() {
    return getOnlineUserIdsFromRedis();
}

async function getOnlineUserIdsForUsers(userIds = []) {
    return getOnlineUserIdsForUsersFromRedis(userIds);
}

async function isUserOnline(userId) {
    return isUserOnlineInRedis(userId);
}

async function emitOnlineUsersNow({ broadcast = false } = {}) {
    try {
        const allOnlineIds = await getOnlineUserIds();
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
                const payload = await buildPresencePayloadForViewer(userId, {
                    socketOnlineUserIds: allOnlineIds,
                });

                clientSockets.forEach(s => s.emit("online-users", payload));
            } catch (err) {
                console.error(`Error filtering online users for ${userId}:`, err);
            }
        }));

        if (broadcast) {
            try {
                io.serverSideEmit("presence-changed");
            } catch (error) {
                console.warn("[Socket.IO] Cannot broadcast presence update:", error.message);
            }
        }
    } catch (err) {
        console.error("Critical error in emitOnlineUsers:", err);
    }
}

function schedulePresenceFlush() {
    if (presenceFlushTimer || presenceFlushInProgress) {
        pendingPresenceFlush = true;
        return;
    }

    presenceFlushTimer = setTimeout(async () => {
        presenceFlushTimer = null;
        presenceFlushInProgress = true;

        const shouldBroadcast = pendingPresenceBroadcast;
        pendingPresenceBroadcast = false;
        pendingPresenceFlush = false;

        try {
            await emitOnlineUsersNow({ broadcast: shouldBroadcast });
        } finally {
            presenceFlushInProgress = false;
            if (pendingPresenceFlush || pendingPresenceBroadcast) {
                schedulePresenceFlush();
            }
        }
    }, PRESENCE_FLUSH_DELAY_MS);

    presenceFlushTimer.unref?.();
}

async function emitOnlineUsers({ broadcast = false, immediate = false } = {}) {
    if (immediate) {
        return emitOnlineUsersNow({ broadcast });
    }

    pendingPresenceBroadcast = pendingPresenceBroadcast || broadcast;
    pendingPresenceFlush = true;
    schedulePresenceFlush();
    return true;
}

function getReceiverSocketId(userId) {
    return userId ? getUserRoom(userId) : null;
}

async function handlePushCallAction(payload, action) {
    if (action !== 'decline') return false;

    if (payload?.type === 'direct-call') {
        return declineDirectCallFromPush(io, getReceiverSocketId, payload);
    }

    if (payload?.type === 'group-call') {
        return declineGroupCallFromPush(io, payload);
    }

    return false;
}

async function emitToUser(userId, event, data) {
    const room = getUserRoom(userId);
    const online = await isUserOnline(userId);
    io.to(room).emit(event, data);
    return online;
}

async function emitMessageDeliveredUpdate({ messageId, conversationId, deliveredUserId, senderId }) {
    const payload = {
        messageId: messageId.toString(),
        conversationId: conversationId.toString(),
        deliveredUserId: deliveredUserId.toString(),
    };

    await emitToUser(deliveredUserId, "message-delivered-sync", payload);

    if (senderId) {
        await emitToUser(senderId, "message-delivered-ack", payload);
    }
}

async function markDeliveredForMessage({ messageId, conversationId, deliveredUserId }) {
    const msg = await Message.findOneAndUpdate(
        {
            _id: messageId,
            conversationId,
            senderId: { $ne: deliveredUserId },
            deliveredTo: { $ne: deliveredUserId },
            isExpired: { $ne: true },
            $and: [buildUnexpiredMessageFilter()],
        },
        { $addToSet: { deliveredTo: deliveredUserId } },
        { new: true, select: 'senderId conversationId' }
    );

    if (!msg) return null;

    await Conversation.updateOne(
        {
            _id: msg.conversationId,
            'lastMessage._id': msg._id,
        },
        { $addToSet: { 'lastMessage.deliveredTo': deliveredUserId } }
    );

    return msg;
}

async function syncPendingDirectMessageDeliveries(userId) {
    const batchSize = 200;
    const maxBatches = 10;

    try {
        const directConversations = await Conversation.find({
            type: 'direct',
            'participants.userId': userId,
        }).select('_id').lean();

        const conversationIds = directConversations.map((conversation) => conversation._id);
        if (conversationIds.length === 0) return;

        for (let batch = 0; batch < maxBatches; batch += 1) {
            const pendingMessages = await Message.find({
                conversationId: { $in: conversationIds },
                senderId: { $ne: userId },
                deliveredTo: { $ne: userId },
                isExpired: { $ne: true },
                $and: [buildUnexpiredMessageFilter()],
            })
                .select('_id conversationId senderId')
                .sort({ createdAt: 1 })
                .limit(batchSize)
                .lean();

            if (pendingMessages.length === 0) return;

            const messageIds = pendingMessages.map((message) => message._id);

            await Message.updateMany(
                { _id: { $in: messageIds }, deliveredTo: { $ne: userId } },
                { $addToSet: { deliveredTo: userId } }
            );
            await Conversation.updateMany(
                { 'lastMessage._id': { $in: messageIds } },
                { $addToSet: { 'lastMessage.deliveredTo': userId } }
            );

            await Promise.all(pendingMessages.map((message) => emitMessageDeliveredUpdate({
                messageId: message._id,
                conversationId: message.conversationId,
                deliveredUserId: userId,
                senderId: message.senderId,
            })));

            if (pendingMessages.length < batchSize) return;
        }
    } catch (error) {
        console.error("Error syncing pending message deliveries:", error);
    }
}

function joinUserSocketsToRoom(userId, roomName) {
    io.in(getUserRoom(userId)).socketsJoin(roomName.toString());
    return true;
}

function leaveUserSocketsFromRoom(userId, roomName) {
    io.in(getUserRoom(userId)).socketsLeave(roomName.toString());
    return true;
}

async function disconnectSocketRoom(roomName, reason = "session-revoked") {
    try {
        const sockets = await io.in(roomName).fetchSockets();
        io.to(roomName).emit("session-revoked", { reason });
        io.in(roomName).disconnectSockets(true);
        return sockets.length;
    } catch (error) {
        console.error(`Error disconnecting socket room ${roomName}:`, error.message);
        io.to(roomName).emit("session-revoked", { reason });
        io.in(roomName).disconnectSockets(true);
        return 0;
    }
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
    getOnlineUserIdsForUsers,
    joinUserSocketsToRoom,
    leaveUserSocketsFromRoom,
});

io.on("presence-changed", () => {
    emitOnlineUsers().catch((error) => {
        console.error("Error handling remote presence update:", error);
    });
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
    registerSocketPresence({ socketId: socket.id, userId, sessionId })
        .then(async () => {
            if (!socket.connected) {
                await removeSocketPresence(socket.id, userId);
                return false;
            }
            return emitOnlineUsers({ broadcast: true });
        })
        .catch((error) => {
            console.error("Error registering socket presence:", error);
        });
    socket.data.presenceInterval = setInterval(() => {
        refreshSocketPresence(socket.id, userId).catch((error) => {
            console.error("Error refreshing socket presence:", error);
        });
    }, 45_000);
    socket.data.presenceInterval.unref?.();
    void touchUserActivity(userId).catch((error) => {
        console.error("Error touching user activity:", error);
    });

    let lastActivityTouchAt = Date.now();
    socket.use(async (_packet, next) => {
        try {
            const isSessionValid = await validateSocketSession(socket);
            if (!isSessionValid) {
                socket.emit("session-revoked", { reason: "session-expired-or-revoked" });
                socket.disconnect(true);
                return next(new Error("Unauthorized - Session expired or revoked"));
            }

            const now = Date.now();
            if (now - lastActivityTouchAt > 60_000) {
                lastActivityTouchAt = now;
                void touchUserActivity(userId).catch((error) => {
                    console.error("Error touching user activity:", error);
                });
            }

            return next();
        } catch (error) {
            console.error("Error validating socket session:", error);
            socket.emit("session-revoked", { reason: "session-validation-failed" });
            socket.disconnect(true);
            return next(new Error("Unauthorized - Session validation failed"));
        }
    });

    // Join conversation rooms in the background so Socket.IO connect can finish fast.
    setImmediate(async () => {
        try {
            const conversationIds = await getUserConversationsForSocketIO(user._id);
            conversationIds.forEach((id) => {
                if (!socket.rooms.has(id)) {
                    socket.join(id);
                }
            });
        } catch (error) {
            console.error("Error joining conversation rooms on connect:", error);
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
    const handleTypingEvent = async (event, data = {}) => {
        try {
            const conversationId = data?.conversationId?.toString?.() || data?.conversationId;
            if (!conversationId) return;

            const conversation = await Conversation.findById(conversationId).select("type participants").lean();
            if (!conversation) return;

            const myId = user._id.toString();
            const isParticipant = conversation.participants.some(p => p.userId.toString() === myId);
            if (!isParticipant) return;

            if (conversation.type === "direct") {
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

            socket.to(conversationId).emit(event, { conversationId, userId: myId });
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

            const msg = await markDeliveredForMessage({
                messageId,
                conversationId: conversation._id,
                deliveredUserId: userId,
            });
            if (msg) {
                await emitMessageDeliveredUpdate({
                    messageId,
                    conversationId: conversation._id,
                    deliveredUserId: userId,
                    senderId: msg.senderId,
                });
            }
        } catch (err) {
            console.error("Error handling message-delivered:", err);
        }
    });

    // Call handlers (tách riêng)
    registerCallHandlers(socket, user, io, getReceiverSocketId);

    // Group call handlers
    registerGroupCallHandlers(socket, user, io, getReceiverSocketId);

    setImmediate(async () => {
        await Promise.allSettled([
            syncPendingDirectMessageDeliveries(userId),
            emitPendingDirectCallsForUser(socket, userId, io, getReceiverSocketId),
            emitPendingGroupCallsForUser(socket, userId),
        ]);
    });

    socket.on("disconnecting", () => {
        const conversationRooms = Array.from(socket.rooms)
            .filter((roomName) => (
                roomName !== socket.id
                && roomName !== getUserRoom(userId)
                && roomName !== getSessionRoom(sessionId)
            ));
        conversationRooms.forEach((conversationId) => {
            io.to(conversationId).except(socket.id).emit("user-stopped-typing", {
                conversationId,
                userId,
            });
        });
    });

    // Disconnect
    socket.on("disconnect", async () => {
        const userId = user._id.toString();
        if (socket.data.presenceInterval) {
            clearInterval(socket.data.presenceInterval);
        }

        await removeSocketPresence(socket.id, userId);
        void touchUserActivity(userId).catch((error) => {
            console.error("Error touching user activity on disconnect:", error);
        });
        void emitOnlineUsers({ broadcast: true });

        // Xử lý cuộc gọi đang active (lưu DB + thông báo đối phương)
        await handleCallDisconnect(userId, socket.id, io, getReceiverSocketId);

        // Xử lý group call đang active
        await handleGroupCallDisconnect(userId, socket.id, io);

        console.log(`Socket Disconnected: ${socket.id}`);
    });
});

export {
    io,
    app,
    server,
    socketRedisAdapterReady,
    getReceiverSocketId,
    emitToUser,
    isUserOnline,
    getOnlineUserIdsForUsers,
    joinUserSocketsToRoom,
    leaveUserSocketsFromRoom,
    disconnectSessionSockets,
    disconnectUserSockets,
    emitOnlineUsers,
    handlePushCallAction,
};
