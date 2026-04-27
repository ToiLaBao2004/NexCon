import { AccessToken } from 'livekit-server-sdk';
import { getSocketGateway } from '../socket/socketGateway.js';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
// Đảm bảo người dùng nhập mã cuộc họp đúng dạng xxx-xxxx-xxx và 
// quy định mỗi cuộc họp chỉ tồn tại tối đa 12 giờ.
const MEETING_CODE_REGEX = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/;
const MEETING_TTL_MS = 12 * 60 * 60 * 1000;

// roomName -> {
//   hostId,
//   createdAt,
//   participants: Map<userId, { userId, displayName, avatarUrl, joinedAt, metadata }>,
//   waitingRoom: Array<{ userId, displayName, avatarUrl, metadata, joinedAt, timeoutId }>
// }
const meetingRegistry = new Map();

function normalizeRoomName(roomName) {
    return String(roomName || '').trim().toLowerCase();
}

function serializeWaitingRoom(waitingRoom = []) {
    return waitingRoom.map(({ timeoutId: _timeoutId, ...rest }) => rest);
}

function emitWaitingRoomUpdateToHost(roomName, room) {
    const { io, getReceiverSocketId } = getSocketGateway();
    if (!io || !getReceiverSocketId || !room?.hostId) {
        return;
    }

    const hostSocketId = getReceiverSocketId(room.hostId);
    if (!hostSocketId) {
        return;
    }

    io.to(hostSocketId).emit('waiting-room-update', {
        roomName,
        waitingRoom: serializeWaitingRoom(room.waitingRoom),
    });
}

function scheduleWaitingTimeout(roomName, userId) {
    return setTimeout(() => {
        const room = meetingRegistry.get(roomName);
        if (!room) return;

        const idx = room.waitingRoom.findIndex((waiter) => waiter.userId === userId);
        if (idx === -1) return;

        room.waitingRoom.splice(idx, 1);

        const { io, getReceiverSocketId } = getSocketGateway();
        if (io && getReceiverSocketId) {
            const targetSocketId = getReceiverSocketId(userId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('participant-rejected', {
                    roomName,
                    reason: 'timeout',
                });
            }
        }

        emitWaitingRoomUpdateToHost(roomName, room);
    }, 5 * 60 * 1000);
}

export function getMeetingSession(roomName) {
    return meetingRegistry.get(normalizeRoomName(roomName));
}

export { meetingRegistry, serializeWaitingRoom };

function cleanupMeetingRegistry() {
    const now = Date.now();
    for (const [roomName, room] of meetingRegistry.entries()) {
        if (now - room.createdAt > MEETING_TTL_MS) {
            for (const waiter of room.waitingRoom || []) {
                if (waiter.timeoutId) {
                    clearTimeout(waiter.timeoutId);
                }
            }
            meetingRegistry.delete(roomName);
        }
    }
}

async function buildToken({ roomName, userId, displayName, metadata }) {
    const token = new AccessToken(API_KEY, API_SECRET, {
        identity: userId,
        name: displayName,
        ttl: '6h',
        metadata: metadata ?? '',
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

export const getLivekitRoomInfo = async (req, res) => {
    try {
        cleanupMeetingRegistry();

        const normalizedRoomName = normalizeRoomName(req.query.roomName);
        const userId = req.user?._id?.toString();
        if (!normalizedRoomName || !MEETING_CODE_REGEX.test(normalizedRoomName)) {
            return res.status(400).json({ message: 'Mã cuộc họp không hợp lệ.' });
        }

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const room = meetingRegistry.get(normalizedRoomName);
        if (!room) {
            return res.status(404).json({ message: 'Phòng họp không tồn tại hoặc chưa bắt đầu.' });
        }

        return res.json({
            roomName: normalizedRoomName,
            canRejoin: room.participants.has(userId),
        });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

export const getLivekitToken = async (req, res) => {
    try {
        cleanupMeetingRegistry();

        const { roomName, metadata, mode } = req.body;
        const normalizedRoomName = normalizeRoomName(roomName);
        const userId = req.user?._id?.toString();
        const displayName = req.user?.displayName || userId;
        const avatarUrl = req.user?.avatarUrl ?? null;
        const metadataValue = metadata ?? '';

        if (!normalizedRoomName || !MEETING_CODE_REGEX.test(normalizedRoomName)) {
            return res.status(400).json({ message: 'Mã cuộc họp không hợp lệ.' });
        }

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        let room = meetingRegistry.get(normalizedRoomName);

        if (mode === 'create') {
            if (room && room.hostId !== userId) {
                return res.status(409).json({ message: 'Mã cuộc họp đã tồn tại. Vui lòng tạo mã khác.' });
            }

            if (!room) {
                room = {
                    hostId: userId,
                    participants: new Map(),
                    waitingRoom: [],
                    createdAt: Date.now(),
                };
                meetingRegistry.set(normalizedRoomName, room);
            }

            room.participants.set(userId, {
                userId,
                displayName,
                avatarUrl,
                joinedAt: new Date().toISOString(),
                metadata: metadataValue,
            });
        } else if (mode === 'join') {
            if (!room) {
                return res.status(404).json({ message: 'Phòng họp không tồn tại hoặc chưa được tạo.' });
            }

            const alreadyJoined = room.participants.has(userId);
            const isHost = room.hostId === userId;

            if (!alreadyJoined && !isHost) {
                const waitingIdx = room.waitingRoom.findIndex((waiter) => waiter.userId === userId);
                if (waitingIdx === -1) {
                    room.waitingRoom.push({
                        userId,
                        displayName,
                        avatarUrl,
                        metadata: metadataValue,
                        joinedAt: new Date().toISOString(),
                    });

                    const timeoutId = scheduleWaitingTimeout(normalizedRoomName, userId);
                    room.waitingRoom[room.waitingRoom.length - 1].timeoutId = timeoutId;

                    emitWaitingRoomUpdateToHost(normalizedRoomName, room);
                }

                return res.json({
                    status: 'waiting',
                    message: 'Yêu cầu tham gia đã được gửi. Vui lòng chờ chủ phòng duyệt.',
                });
            }

            room.participants.set(userId, {
                userId,
                displayName,
                avatarUrl,
                joinedAt: new Date().toISOString(),
                metadata: metadataValue,
            });
        } else {
            return res.status(400).json({ message: 'Yêu cầu không hợp lệ: thiếu mode create/join.' });
        }

        const jwt = await buildToken({
            roomName: normalizedRoomName,
            userId,
            displayName,
            metadata: metadataValue,
        });
        res.json({
            token: jwt,
            isHost: room.hostId === userId,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
