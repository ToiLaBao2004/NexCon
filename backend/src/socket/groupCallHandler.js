import { AccessToken } from 'livekit-server-sdk';
import Conversation from '../models/conversationModel.js';
import Meeting from '../models/meetingModel.js';
import User from '../models/userModel.js';
import { persistCallSystemMessage } from '../utils/callSystemMessageHelper.js';
import {
    clearWaitingTimeout,
    emitWaitingRoomUpdate,
    generateParticipantToken,
    normalizeRoomName,
    waitingTimeouts,
} from '../controllers/meetingController.js';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

// conversationId -> GroupCallInfo
const activeGroupCalls = new Map();

function buildSessionId(prefix = 'group-call') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function generateToken(roomName, identity, displayName, metadata) {
    const token = new AccessToken(API_KEY, API_SECRET, {
        identity,
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

function participantsArray(groupCall) {
    return Array.from(groupCall.participants.values());
}

function groupCallDevicePayload(groupCall) {
    return {
        conversationId: groupCall.conversationId,
        callId: groupCall.callId,
        participants: participantsArray(groupCall),
    };
}

function emitToOtherUserDevices(socket, userId, event, payload) {
    socket.to(`user:${userId.toString()}`).emit(event, payload);
}

function countJoined(groupCall) {
    let n = 0;
    for (const participant of groupCall.participants.values()) {
        if (participant.status === 'joined') n++;
    }
    return n;
}

function toFinalParticipantStatus(participant, endedAtIso) {
    if (participant.status === 'ringing') {
        return { ...participant, status: 'missed' };
    }
    if (participant.status === 'joined') {
        return {
            ...participant,
            status: 'left',
            leftAt: participant.leftAt || endedAtIso,
        };
    }
    return participant;
}

async function endGroupCall(conversationId, io) {
    const groupCall = activeGroupCalls.get(conversationId);
    if (!groupCall) return;

    const now = new Date();
    const endedAtIso = now.toISOString();
    const durationSec = groupCall.startedAt
        ? Math.max(0, Math.round((now.getTime() - groupCall.startedAt.getTime()) / 1000))
        : 0;

    try {
        const finalizedParticipants = participantsArray(groupCall)
            .map((participant) => toFinalParticipantStatus(participant, endedAtIso))
            .map((participant) => ({
                userId: {
                    _id: participant.userId,
                    displayName: participant.displayName,
                    avatarUrl: participant.avatarUrl ?? null,
                },
                status: participant.status,
                joinedAt: participant.joinedAt,
                leftAt: participant.leftAt,
            }));

        await persistCallSystemMessage(io, {
            conversationId,
            callId: groupCall.callId,
            mode: 'group',
            callType: groupCall.callType,
            overallStatus: 'ended',
            duration: durationSec,
            startedAt: groupCall.startedAt,
            endedAt: now,
            initiator: groupCall.initiator,
            participants: finalizedParticipants,
        });
    } catch (error) {
        console.error('[GroupCall] endGroupCall DB error:', error);
    }

    io.to(conversationId).emit('group-call:ended', {
        conversationId,
        callId: groupCall.callId,
        duration: durationSec,
        endedAt: endedAtIso,
    });

    if (groupCall.ringTimeout) clearTimeout(groupCall.ringTimeout);
    activeGroupCalls.delete(conversationId);
}

async function checkAutoEnd(conversationId, io) {
    const groupCall = activeGroupCalls.get(conversationId);
    if (!groupCall) return;

    const joined = countJoined(groupCall);

    // Không còn ai trong call
    if (joined === 0) {
        await endGroupCall(conversationId, io);
        return;
    }

    // Chỉ còn 1 người joined và không còn ai đang ringing
    let ringing = 0;
    for (const participant of groupCall.participants.values()) {
        if (participant.status === 'ringing') ringing++;
    }

    if (joined < 2 && ringing === 0) {
        await endGroupCall(conversationId, io);
    }
}

function registerGroupCallHandlers(socket, user, io, getReceiverSocketId) {
    const userId = user._id.toString();

    // START
    socket.on('group-call:start', async ({ conversationId, callType }) => {
        try {
            // Validate conversation
            const conversation = await Conversation.findById(conversationId)
                .populate('participants.userId', '_id displayName avatarUrl');
            if (!conversation || conversation.type !== 'group') {
                return socket.emit('group-call:error', { reason: 'not-a-group' });
            }
            if (conversation.disbanded === true) {
                return socket.emit('group-call:error', { reason: 'group-disbanded', message: 'Không thể gọi vì nhóm đã bị giải tán' });
            }
            const isMember = conversation.participants.some(
                (participant) => participant.userId._id.toString() === userId
            );
            if (!isMember) {
                return socket.emit('group-call:error', { reason: 'not-a-member' });
            }

            // Already active?
            if (activeGroupCalls.has(conversationId)) {
                return socket.emit('group-call:error', { reason: 'already-active' });
            }

            const startedAt = new Date();
            const callId = buildSessionId('group-call');

            // Build in-memory participants map
            const participantsMap = new Map();
            for (const participant of conversation.participants) {
                const pid = participant.userId._id.toString();
                participantsMap.set(pid, {
                    userId: pid,
                    displayName: participant.userId.displayName,
                    avatarUrl: participant.userId.avatarUrl || null,
                    status: pid === userId ? 'joined' : 'ringing',
                    joinedAt: pid === userId ? startedAt.toISOString() : null,
                    leftAt: null,
                });
            }

            // Ring timeout (30s)
            const ringTimeout = setTimeout(async () => {
                const session = activeGroupCalls.get(conversationId);
                if (!session) return;

                let changed = false;
                for (const participant of session.participants.values()) {
                    if (participant.status === 'ringing') {
                        participant.status = 'no-answer';
                        changed = true;
                    }
                }

                if (changed) {
                    io.to(conversationId).emit('group-call:user-declined', {
                        conversationId,
                        userId: null,
                        participants: participantsArray(session),
                    });
                    await checkAutoEnd(conversationId, io);
                }
            }, 30_000);

            const initiatorInfo = {
                _id: userId,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl || null,
            };

            const groupCallInfo = {
                callId,
                conversationId,
                initiatorId: userId,
                initiator: initiatorInfo,
                callType,
                startedAt,
                participants: participantsMap,
                participantSockets: new Map([[userId, socket.id]]),
                ringTimeout,
            };
            activeGroupCalls.set(conversationId, groupCallInfo);

            // Generate token for initiator
            const metadata = JSON.stringify({
                displayName: user.displayName,
                avatarUrl: user.avatarUrl || null,
            });
            const token = await generateToken(conversationId, userId, user.displayName, metadata);

            const groupName = conversation.group?.name || 'Nhóm';

            // Emit to initiator
            socket.emit('group-call:started', {
                conversationId,
                callId,
                callType,
                token,
                initiator: initiatorInfo,
                groupName,
                participants: participantsArray(groupCallInfo),
            });

            // Emit to rest of group
            socket.to(conversationId).except(`user:${userId}`).emit('group-call:incoming', {
                conversationId,
                callId,
                callType,
                initiator: initiatorInfo,
                groupName,
                participants: participantsArray(groupCallInfo),
            });

            console.log(`[GroupCall] ${user.displayName} started group call in ${conversationId}`);
        } catch (error) {
            console.error('[GroupCall] start error:', error);
            socket.emit('group-call:error', { reason: 'server-error' });
        }
    });

    // JOIN
    socket.on('group-call:join', async ({ conversationId }) => {
        try {
            const groupCall = activeGroupCalls.get(conversationId);
            if (!groupCall) {
                return socket.emit('group-call:error', { reason: 'call-not-found' });
            }

            // Check if user is in the participant map (member of group)
            if (!groupCall.participants.has(userId)) {
                return socket.emit('group-call:error', { reason: 'not-a-member' });
            }

            const participant = groupCall.participants.get(userId);
            const activeSocketId = groupCall.participantSockets?.get(userId);
            if (participant.status === 'joined' && activeSocketId && activeSocketId !== socket.id) {
                socket.emit('group-call:answered-on-other-device', groupCallDevicePayload(groupCall));
                return;
            }

            if (!groupCall.participantSockets) {
                groupCall.participantSockets = new Map();
            }

            const previousState = {
                status: participant.status,
                joinedAt: participant.joinedAt,
                leftAt: participant.leftAt,
                socketId: activeSocketId,
            };
            const shouldNotifyJoined = participant.status !== 'joined';

            participant.status = 'joined';
            participant.joinedAt = previousState.status === 'joined' && previousState.joinedAt
                ? previousState.joinedAt
                : new Date().toISOString();
            participant.leftAt = null;
            groupCall.participantSockets.set(userId, socket.id);

            let token;
            try {
                const metadata = JSON.stringify({
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl || null,
                });
                token = await generateToken(conversationId, userId, user.displayName, metadata);
            } catch (error) {
                if (groupCall.participantSockets?.get(userId) === socket.id) {
                    participant.status = previousState.status;
                    participant.joinedAt = previousState.joinedAt;
                    participant.leftAt = previousState.leftAt;
                    if (previousState.socketId) {
                        groupCall.participantSockets.set(userId, previousState.socketId);
                    } else {
                        groupCall.participantSockets.delete(userId);
                    }
                }
                throw error;
            }

            // Send token to this user
            socket.emit('group-call:token', { conversationId, token });
            emitToOtherUserDevices(
                socket,
                userId,
                'group-call:answered-on-other-device',
                groupCallDevicePayload(groupCall)
            );

            // Notify room
            if (shouldNotifyJoined) {
                io.to(conversationId).emit('group-call:user-joined', {
                    conversationId,
                    user: {
                        _id: userId,
                        displayName: user.displayName,
                        avatarUrl: user.avatarUrl || null,
                    },
                    participants: participantsArray(groupCall),
                });
            }

            console.log(`[GroupCall] ${user.displayName} joined group call in ${conversationId}`);
        } catch (error) {
            console.error('[GroupCall] join error:', error);
            socket.emit('group-call:error', { reason: 'server-error' });
        }
    });

    // DECLINE
    socket.on('group-call:decline', async ({ conversationId }) => {
        try {
            const groupCall = activeGroupCalls.get(conversationId);
            if (!groupCall) return;

            const participant = groupCall.participants.get(userId);
            if (!participant) return;

            const activeSocketId = groupCall.participantSockets?.get(userId);
            if (participant.status === 'joined' && activeSocketId && activeSocketId !== socket.id) {
                socket.emit('group-call:answered-on-other-device', groupCallDevicePayload(groupCall));
                return;
            }

            if (participant.status === 'declined') {
                socket.emit('group-call:declined-on-other-device', groupCallDevicePayload(groupCall));
                return;
            }

            participant.status = 'declined';
            groupCall.participantSockets?.delete(userId);

            emitToOtherUserDevices(
                socket,
                userId,
                'group-call:declined-on-other-device',
                groupCallDevicePayload(groupCall)
            );

            io.to(conversationId).emit('group-call:user-declined', {
                conversationId,
                userId,
                participants: participantsArray(groupCall),
            });

            await checkAutoEnd(conversationId, io);
        } catch (error) {
            console.error('[GroupCall] decline error:', error);
        }
    });

    // LEAVE
    socket.on('group-call:leave', async ({ conversationId }) => {
        try {
            const groupCall = activeGroupCalls.get(conversationId);
            if (!groupCall) return;

            const participant = groupCall.participants.get(userId);
            if (!participant) return;

            const activeSocketId = groupCall.participantSockets?.get(userId);
            if (participant.status === 'joined' && activeSocketId && activeSocketId !== socket.id) {
                socket.emit('group-call:answered-on-other-device', groupCallDevicePayload(groupCall));
                return;
            }

            participant.status = 'left';
            participant.leftAt = new Date().toISOString();
            groupCall.participantSockets?.delete(userId);

            io.to(conversationId).emit('group-call:user-left', {
                conversationId,
                userId,
                participants: participantsArray(groupCall),
            });

            await checkAutoEnd(conversationId, io);

            console.log(`[GroupCall] ${user.displayName} left group call in ${conversationId}`);
        } catch (error) {
            console.error('[GroupCall] leave error:', error);
        }
    });

    // STATUS
    socket.on('group-call:status', ({ conversationId }) => {
        const groupCall = activeGroupCalls.get(conversationId);
        if (groupCall) {
            const participant = groupCall.participants.get(userId);
            const activeSocketId = groupCall.participantSockets?.get(userId) || null;
            socket.emit('group-call:status-response', {
                conversationId,
                active: true,
                callId: groupCall.callId,
                callType: groupCall.callType,
                initiatorId: groupCall.initiatorId,
                participants: participantsArray(groupCall),
                startedAt: groupCall.startedAt?.toISOString() ?? null,
                myStatus: participant?.status ?? null,
                joinedByCurrentUser: participant?.status === 'joined',
                joinedByCurrentDevice: Boolean(activeSocketId && activeSocketId === socket.id),
            });
        } else {
            socket.emit('group-call:status-response', {
                conversationId,
                active: false,
            });
        }
    });

    socket.on('admit-participant', async ({ roomName, targetUserId, userId: payloadUserId }) => {
        try {
            const normalizedRoomName = normalizeRoomName(roomName);
            const waiterUserId = String(targetUserId || payloadUserId || '').trim();
            if (!normalizedRoomName || !waiterUserId) {
                return;
            }

            const meeting = await Meeting.findOne({ roomName: normalizedRoomName });
            if (!meeting || meeting.hostId.toString() !== userId) {
                return;
            }

            const key = `${normalizedRoomName}:${waiterUserId}`;
            if (waitingTimeouts.has(key)) {
                clearWaitingTimeout(normalizedRoomName, waiterUserId);
            }

            const alreadyParticipant = meeting.participants.some(
                (participant) => participant.userId.toString() === waiterUserId
            );

            const update = {
                $pull: { waitingRoom: waiterUserId },
            };

            if (!alreadyParticipant) {
                update.$push = {
                    participants: {
                        userId: waiterUserId,
                        joinedAt: new Date(),
                    },
                };
            }

            await Meeting.findByIdAndUpdate(meeting._id, update);

            const targetUser = await User.findById(waiterUserId).select('displayName avatarUrl');
            const token = await generateParticipantToken(normalizedRoomName, waiterUserId, targetUser);

            const targetSocketId = getReceiverSocketId(waiterUserId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('participant-admitted', {
                    roomName: normalizedRoomName,
                    token,
                    isHost: false,
                });
            }

            await emitWaitingRoomUpdate(normalizedRoomName, userId);
        } catch (error) {
            console.error('[Meet] admit-participant error:', error);
        }
    });

    socket.on('reject-participant', async ({ roomName, targetUserId, userId: payloadUserId }) => {
        try {
            const normalizedRoomName = normalizeRoomName(roomName);
            const waiterUserId = String(targetUserId || payloadUserId || '').trim();
            if (!normalizedRoomName || !waiterUserId) {
                return;
            }

            const meeting = await Meeting.findOne({ roomName: normalizedRoomName });
            if (!meeting || meeting.hostId.toString() !== userId) {
                return;
            }

            const key = `${normalizedRoomName}:${waiterUserId}`;
            if (waitingTimeouts.has(key)) {
                clearWaitingTimeout(normalizedRoomName, waiterUserId);
            }

            await Meeting.findByIdAndUpdate(meeting._id, {
                $pull: { waitingRoom: waiterUserId },
            });

            const targetSocketId = getReceiverSocketId(waiterUserId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('participant-rejected', {
                    roomName: normalizedRoomName,
                    reason: 'host-rejected',
                });
            }

            await emitWaitingRoomUpdate(normalizedRoomName, userId);
        } catch (error) {
            console.error('[Meet] reject-participant error:', error);
        }
    });

    socket.on('admit-all-participants', async ({ roomName }) => {
        try {
            const normalizedRoomName = normalizeRoomName(roomName);
            if (!normalizedRoomName) {
                return;
            }

            const meeting = await Meeting.findOne({ roomName: normalizedRoomName });
            if (!meeting || meeting.hostId.toString() !== userId) {
                return;
            }

            const toAdmit = meeting.waitingRoom.map((item) => item.toString());
            const now = new Date();

            const users = await User.find({ _id: { $in: toAdmit } }).select('_id displayName avatarUrl');
            const userMap = new Map(users.map((item) => [item._id.toString(), item]));

            for (const waiterUserId of toAdmit) {
                const key = `${normalizedRoomName}:${waiterUserId}`;
                if (waitingTimeouts.has(key)) {
                    clearWaitingTimeout(normalizedRoomName, waiterUserId);
                }
            }

            const existingParticipantSet = new Set(
                meeting.participants.map((participant) => participant.userId.toString())
            );
            const participantsToInsert = toAdmit
                .filter((targetId) => !existingParticipantSet.has(targetId))
                .map((targetId) => ({ userId: targetId, joinedAt: now }));

            const update = {
                $set: { waitingRoom: [] },
            };

            if (participantsToInsert.length > 0) {
                update.$push = {
                    participants: {
                        $each: participantsToInsert,
                    },
                };
            }

            await Meeting.findByIdAndUpdate(meeting._id, update);

            for (const targetId of toAdmit) {
                const token = await generateParticipantToken(normalizedRoomName, targetId, userMap.get(targetId));
                const targetSocketId = getReceiverSocketId(targetId);
                if (!targetSocketId) {
                    continue;
                }

                io.to(targetSocketId).emit('participant-admitted', {
                    roomName: normalizedRoomName,
                    token,
                    isHost: false,
                });
            }

            await emitWaitingRoomUpdate(normalizedRoomName, userId);
        } catch (error) {
            console.error('[Meet] admit-all-participants error:', error);
        }
    });

    socket.on('cancel-waiting', async ({ roomName }) => {
        try {
            const normalizedRoomName = normalizeRoomName(roomName);
            if (!normalizedRoomName) {
                return;
            }

            const key = `${normalizedRoomName}:${userId}`;
            if (waitingTimeouts.has(key)) {
                clearWaitingTimeout(normalizedRoomName, userId);
            }

            const meeting = await Meeting.findOneAndUpdate(
                { roomName: normalizedRoomName },
                { $pull: { waitingRoom: userId } },
                { new: true }
            );

            if (!meeting) {
                return;
            }

            await emitWaitingRoomUpdate(normalizedRoomName, meeting.hostId.toString());
        } catch (error) {
            console.error('[Meet] cancel-waiting error:', error);
        }
    });
}

// Disconnect handler
async function handleGroupCallDisconnect(userId, socketId, io) {
    for (const [conversationId, groupCall] of activeGroupCalls) {
        const participant = groupCall.participants.get(userId);
        const participantSocketId = groupCall.participantSockets?.get(userId);
        const isActiveCallSocket = participantSocketId ? participantSocketId === socketId : true;

        if (participant && participant.status === 'joined' && isActiveCallSocket) {
            participant.status = 'left';
            participant.leftAt = new Date().toISOString();
            groupCall.participantSockets?.delete(userId);

            io.to(conversationId).emit('group-call:user-left', {
                conversationId,
                userId,
                participants: participantsArray(groupCall),
            });

            await checkAutoEnd(conversationId, io);
        }
    }
}

export { registerGroupCallHandlers, handleGroupCallDisconnect };
