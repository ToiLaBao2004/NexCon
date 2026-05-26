import { AccessToken } from 'livekit-server-sdk';
import Meeting from '../models/meetingModel.js';
import BlockUser from '../models/blockUserModel.js';
import Conversation from '../models/conversationModel.js';
import { getSocketGateway } from '../socket/socketGateway.js';
import {
    removeMeetingWaitingTimeout,
    removeMeetingWaitingTimeoutsForRoom,
    scheduleMeetingWaitingTimeout,
} from '../config/realtimeTimeoutQueue.js';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

const ROOM_CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz';
const MEETING_CODE_REGEX = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
export const MAX_MEETING_PARTICIPANTS = 100;
export const MAX_MEETING_WAITING_USERS = 100;

export function normalizeRoomName(roomName) {
    return String(roomName || '').trim().toLowerCase();
}

const toDisplayName = (user) => {
    if (!user) return 'Người dùng';
    return user.displayName || user.fullName || 'Người dùng';
};

const toAvatar = (user) => {
    if (!user) return null;
    return user.avatarUrl || user.avatar || null;
};

const toMetadata = (user) => JSON.stringify({
    displayName: toDisplayName(user),
    avatarUrl: toAvatar(user),
});

const toMeetingHostPayload = (host) => {
    if (!host || typeof host !== 'object') {
        return host;
    }

    const hostId = host._id?.toString?.() || host._id || host.id || '';
    const displayName = toDisplayName(host);
    const avatarUrl = toAvatar(host);

    return {
        _id: hostId,
        fullName: displayName,
        avatar: avatarUrl,
        displayName,
        avatarUrl,
    };
};

const serializeMeeting = (meeting) => {
    const plain = meeting?.toObject ? meeting.toObject() : meeting;
    if (!plain) return plain;

    return {
        ...plain,
        hostId: toMeetingHostPayload(plain.hostId),
    };
};

const emitToUserById = async (targetUserId, event, payload) => {
    const { emitToUser } = getSocketGateway();
    if (!emitToUser || !targetUserId) {
        return false;
    }

    return emitToUser(String(targetUserId), event, payload);
};

const toWaitingRoomPayload = (users = []) => users.map((userDoc) => ({
    userId: userDoc?._id?.toString?.() || '',
    displayName: toDisplayName(userDoc),
    avatarUrl: toAvatar(userDoc),
    joinedAt: new Date().toISOString(),
}));

export async function emitWaitingRoomUpdate(roomName, hostId) {
    const meeting = await Meeting.findOne({ roomName })
        .populate('waitingRoom', 'displayName fullName avatarUrl avatar');

    if (!meeting) {
        return;
    }

    await emitToUserById(meeting.hostId?.toString?.() || hostId, 'waiting-room-update', {
        roomName,
        waitingRoom: toWaitingRoomPayload(meeting.waitingRoom),
    });
}

async function buildToken({ roomName, userId, displayName, metadata }) {
    const token = new AccessToken(API_KEY, API_SECRET, {
        identity: String(userId),
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

    const jwt = await token.toJwt();
    return String(jwt);
}

function pickChar() {
    return ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
}

function makeSegment(length) {
    return Array.from({ length }, () => pickChar()).join('');
}

export function generateRoomCode() {
    return `${makeSegment(3)}-${makeSegment(4)}-${makeSegment(3)}`;
}

export async function generateHostToken(roomName, userId, user = null) {
    const token = await buildToken({
        roomName,
        userId,
        displayName: toDisplayName(user),
        metadata: toMetadata(user),
    });
    return token;
}

export async function generateParticipantToken(roomName, userId, user = null) {
    const token = await buildToken({
        roomName,
        userId,
        displayName: toDisplayName(user),
        metadata: toMetadata(user),
    });
    return token;
}

export function clearWaitingTimeout(roomName, userId) {
    return removeMeetingWaitingTimeout(roomName, userId);
}

export async function processMeetingWaitingTimeout({ roomName, userId, meetingId }) {
    const meeting = await Meeting.findByIdAndUpdate(
        meetingId,
        { $pull: { waitingRoom: userId } },
        { new: true }
    ).populate('waitingRoom', 'displayName fullName avatarUrl avatar');

    await emitToUserById(userId, 'participant-rejected', {
        roomName,
        reason: 'timeout',
    });

    if (meeting) {
        await emitToUserById(meeting.hostId?.toString?.(), 'waiting-room-update', {
            roomName,
            waitingRoom: toWaitingRoomPayload(meeting.waitingRoom),
        });
    }
}

export async function scheduleWaitingTimeout(roomName, userId, meetingId) {
    await clearWaitingTimeout(roomName, userId);
    return scheduleMeetingWaitingTimeout(roomName, userId, meetingId, 5 * 60 * 1000);
}

export function clearWaitingTimeoutsForRoom(roomName) {
    return removeMeetingWaitingTimeoutsForRoom(roomName);
}

async function createUniqueRoomName(maxAttempts = 6) {
    for (let i = 0; i < maxAttempts; i += 1) {
        const roomName = generateRoomCode();
        const exists = await Meeting.exists({ roomName });
        if (!exists) {
            return roomName;
        }
    }

    throw new Error('Không thể tạo mã phòng họp, vui lòng thử lại.');
}

export async function createMeeting(req, res) {
    try {
        const userId = req.user._id;
        const { scheduledAt, requireApproval = true, conversationId } = req.body;

        const roomName = await createUniqueRoomName();
        const isImmediate = !scheduledAt;

        if (conversationId) {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found.' });
            }
            const isMember = conversation.participants.some(
                (participant) => participant.userId.toString() === userId.toString()
            );
            if (!isMember) {
                return res.status(403).json({ message: 'You are not a participant in this conversation.' });
            }
            if (conversation.type === 'group' && conversation.disbanded) {
                return res.status(403).json({ message: 'Không thể tạo cuộc họp trong nhóm đã giải tán.' });
            }
        }

        const parsedSchedule = scheduledAt ? new Date(scheduledAt) : null;
        if (parsedSchedule && Number.isNaN(parsedSchedule.getTime())) {
            return res.status(400).json({ message: 'scheduledAt không hợp lệ' });
        }

        const now = new Date();

        const meeting = await Meeting.create({
            roomName,
            hostId: userId,
            ...(conversationId ? { conversationId } : {}),
            requireApproval: Boolean(requireApproval),
            status: 'active',
            ...(isImmediate ? { startedAt: now } : {}),
            ...(parsedSchedule ? { scheduledAt: parsedSchedule } : {}),
            participants: isImmediate ? [{ userId, joinedAt: now }] : [],
        });

        if (isImmediate) {
            const token = await generateHostToken(roomName, userId.toString(), req.user);
            return res.status(201).json({ meeting: serializeMeeting(meeting), token });
        }

        return res.status(201).json({ meeting: serializeMeeting(meeting) });
    } catch (error) {
        console.error('createMeeting error:', error);
        return res.status(500).json({ message: 'Không thể tạo cuộc họp' });
    }
}

export async function joinMeeting(req, res) {
    try {
        const userId = req.user._id.toString();
        const { roomName: rawRoomName } = req.params;
        const { requestApproval = false } = req.body;
        const roomName = normalizeRoomName(rawRoomName);

        if (!MEETING_CODE_REGEX.test(roomName)) {
            return res.status(400).json({ message: 'Mã cuộc họp không hợp lệ.' });
        }

        let meeting = await Meeting.findOne({ roomName });
        if (!meeting) {
            return res.status(404).json({ message: 'Không tìm thấy phòng họp' });
        }

        if (meeting.conversationId) {
            const { default: Conversation } = await import('../models/conversationModel.js');
            const conversation = await Conversation.findById(meeting.conversationId);
            if (conversation && conversation.type === 'group' && conversation.disbanded) {
                return res.status(403).json({ message: 'Cuộc họp này thuộc về một nhóm đã bị giải tán.' });
            }
        }

        if (meeting.status === 'ended') {
            return res.status(410).json({ message: 'Cuộc họp đã kết thúc' });
        }

        const hostId = meeting.hostId.toString();

        // Check block relationship between requester and host
        if (hostId !== userId) {
            const blockExists = await BlockUser.findOne({
                $or: [
                    { from: hostId, to: userId },
                    { from: userId, to: hostId }
                ]
            });
            if (blockExists) {
                return res.status(403).json({ message: 'Bạn không thể tham gia cuộc họp của người dùng này.' });
            }
        }

        const isHost = hostId === userId;
        const alreadyIn = meeting.participants.some((participant) => participant.userId.toString() === userId);

        if (isHost || alreadyIn) {
            if (meeting.status === 'scheduled') {
                meeting = await Meeting.findByIdAndUpdate(
                    meeting._id,
                    { status: 'active', startedAt: new Date() },
                    { new: true }
                );
            }

            const token = isHost
                ? await generateHostToken(roomName, userId, req.user)
                : await generateParticipantToken(roomName, userId, req.user);

            let waitingRoom = [];
            if (isHost) {
                const populated = await Meeting.findById(meeting._id)
                    .populate('waitingRoom', 'displayName fullName avatarUrl avatar');
                waitingRoom = toWaitingRoomPayload(populated?.waitingRoom || []);
            }

            return res.json({
                token,
                meetingId: meeting._id,
                isHost,
                waitingRoom,
            });
        }

        if (!meeting.requireApproval) {
            if (meeting.participants.length >= MAX_MEETING_PARTICIPANTS) {
                return res.status(409).json({ message: 'Phòng họp đã đạt giới hạn người tham gia.' });
            }

            await Meeting.findByIdAndUpdate(meeting._id, {
                $push: {
                    participants: {
                        userId,
                        joinedAt: new Date(),
                    },
                },
            });

            const token = await generateParticipantToken(roomName, userId, req.user);
            return res.json({ token, meetingId: meeting._id, isHost: false });
        }

        const isWaiting = meeting.waitingRoom.some((id) => id.toString() === userId);
        if (isWaiting) {
            return res.json({ status: 'waiting' });
        }

        if (!requestApproval) {
            return res.json({ status: 'needs_approval', isHost: false });
        }

        if (meeting.waitingRoom.length >= MAX_MEETING_WAITING_USERS) {
            return res.status(429).json({ message: 'Phòng chờ đã đạt giới hạn.' });
        }

        await Meeting.findByIdAndUpdate(meeting._id, {
            $addToSet: { waitingRoom: userId },
        });

        await scheduleWaitingTimeout(roomName, userId, meeting._id);

        const updatedMeeting = await Meeting.findOne({ roomName })
            .populate('waitingRoom', 'displayName fullName avatarUrl avatar');

        await emitToUserById(hostId, 'waiting-room-update', {
            roomName,
            waitingRoom: toWaitingRoomPayload(updatedMeeting?.waitingRoom || []),
        });

        return res.json({ status: 'waiting' });
    } catch (error) {
        console.error('joinMeeting error:', error);
        return res.status(500).json({ message: 'Không thể tham gia phòng họp' });
    }
}

export async function getMeeting(req, res) {
    try {
        const roomName = normalizeRoomName(req.params.roomName);
        if (!MEETING_CODE_REGEX.test(roomName)) {
            return res.status(400).json({ message: 'Mã cuộc họp không hợp lệ.' });
        }

        const meeting = await Meeting.findOne({ roomName })
            .populate('hostId', 'displayName fullName avatarUrl avatar');

        if (!meeting) {
            return res.status(404).json({ message: 'Không tìm thấy' });
        }

        return res.json({ meeting: serializeMeeting(meeting) });
    } catch (error) {
        console.error('getMeeting error:', error);
        return res.status(500).json({ message: 'Không thể lấy thông tin phòng họp' });
    }
}

export async function endMeeting(req, res) {
    try {
        const userId = req.user._id.toString();
        const roomName = normalizeRoomName(req.params.roomName);

        if (!MEETING_CODE_REGEX.test(roomName)) {
            return res.status(400).json({ message: 'Mã cuộc họp không hợp lệ.' });
        }

        const meeting = await Meeting.findOne({ roomName, hostId: userId });
        if (!meeting) {
            return res.status(403).json({ message: 'Không có quyền kết thúc phòng này' });
        }

        const waitingUserIds = meeting.waitingRoom.map((id) => id.toString());

        meeting.status = 'ended';
        meeting.endedAt = new Date();
        meeting.waitingRoom = [];
        await meeting.save();

        await clearWaitingTimeoutsForRoom(roomName);

        await emitToUserById(userId, 'meeting-ended', { roomName });

        for (const participant of meeting.participants) {
            await emitToUserById(participant.userId?.toString?.(), 'meeting-ended', { roomName });
        }

        for (const waitingUserId of waitingUserIds) {
            await emitToUserById(waitingUserId, 'participant-rejected', {
                roomName,
                reason: 'meeting-ended',
            });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('endMeeting error:', error);
        return res.status(500).json({ message: 'Không thể kết thúc cuộc họp' });
    }
}


export async function getMeetingByRoomName(roomName) {
    const normalized = normalizeRoomName(roomName);
    if (!MEETING_CODE_REGEX.test(normalized)) {
        return null;
    }

    return Meeting.findOne({ roomName: normalized });
}
