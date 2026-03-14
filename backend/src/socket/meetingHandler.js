import { AccessToken } from 'livekit-server-sdk';
import { meetingHosts } from '../controllers/livekitController.js';

const API_KEY    = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

// roomName -> Map<requestId, { socketId, identity, metadata, userId }>
const pendingRequests = new Map();

async function generateToken(roomName, identity, metadata = '') {
    const token = new AccessToken(API_KEY, API_SECRET, {
        identity,
        name: identity,
        ttl: '6h',
        metadata,
    });
    token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });
    return token.toJwt();
}

export function registerMeetingHandlers(socket, user, onlineUsers, io) {
    // Non-host requests to join
    socket.on('meeting:join-request', ({ roomName, identity, metadata }) => {
        const hostUserId = meetingHosts.get(roomName);
        if (!hostUserId) {
            socket.emit('meeting:join-denied', { roomName, reason: 'Phòng không tồn tại' });
            return;
        }

        const hostSocketId = onlineUsers.get(hostUserId);
        if (!hostSocketId) {
            socket.emit('meeting:join-denied', { roomName, reason: 'Host hiện không online' });
            return;
        }

        const requestId = `${user._id}-${Date.now()}`;
        if (!pendingRequests.has(roomName)) {
            pendingRequests.set(roomName, new Map());
        }
        pendingRequests.get(roomName).set(requestId, {
            socketId: socket.id,
            identity,
            metadata: metadata ?? '',
            userId: user._id.toString(),
        });

        io.to(hostSocketId).emit('meeting:new-request', {
            requestId,
            identity,
            metadata,
            roomName,
        });
    });

    // Host approves a request
    socket.on('meeting:approve', async ({ roomName, requestId }) => {
        const hostUserId = meetingHosts.get(roomName);
        if (!hostUserId || hostUserId !== user._id.toString()) return;

        const requests = pendingRequests.get(roomName);
        const request = requests?.get(requestId);
        if (!request) return;

        requests.delete(requestId);

        const token = await generateToken(roomName, request.identity, request.metadata);
        io.to(request.socketId).emit('meeting:join-approved', { token, roomName });
    });

    // Host denies a request
    socket.on('meeting:deny', ({ roomName, requestId }) => {
        const hostUserId = meetingHosts.get(roomName);
        if (!hostUserId || hostUserId !== user._id.toString()) return;

        const requests = pendingRequests.get(roomName);
        const request = requests?.get(requestId);
        if (!request) return;

        requests.delete(requestId);
        io.to(request.socketId).emit('meeting:join-denied', {
            roomName,
            reason: 'Host đã từ chối yêu cầu tham gia',
        });
    });

    // Host explicitly leaves (clean up resource)
    socket.on('meeting:host-leave', ({ roomName }) => {
        const hostUserId = meetingHosts.get(roomName);
        if (!hostUserId || hostUserId !== user._id.toString()) return;
        cleanupRoom(roomName, io, 'Host đã rời cuộc họp');
    });
}

export function handleMeetingDisconnect(userId, io) {
    // If disconnected user was a host, clean up their rooms
    for (const [roomName, hostUserId] of meetingHosts) {
        if (hostUserId === userId) {
            cleanupRoom(roomName, io, 'Host đã ngắt kết nối');
        }
    }
    // Remove any pending requests FROM this disconnected user
    for (const requests of pendingRequests.values()) {
        for (const [reqId, req] of requests) {
            if (req.userId === userId) {
                requests.delete(reqId);
            }
        }
    }
}

function cleanupRoom(roomName, io, reason) {
    const requests = pendingRequests.get(roomName);
    if (requests) {
        for (const req of requests.values()) {
            io.to(req.socketId).emit('meeting:join-denied', { roomName, reason });
        }
        pendingRequests.delete(roomName);
    }
    meetingHosts.delete(roomName);
}
