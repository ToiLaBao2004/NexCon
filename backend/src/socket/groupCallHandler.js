import { AccessToken } from 'livekit-server-sdk';
import Conversation from '../models/conversationModel.js';
import Meeting from '../models/meetingModel.js';
import User from '../models/userModel.js';
import { persistCallSystemMessage } from '../utils/callSystemMessageHelper.js';
import { LOCKED_USER_DISPLAY_NAME } from '../utils/lockedUser.js';
import { sendFCMToUser } from '../services/fcmService.js';
import { isMuted } from '../utils/isMuted.js';
import { createCallActionToken, getCallActionUrl } from '../utils/callActionToken.js';
import { hasUserDirectCall as hasUserDirectCallState } from '../services/directCallStateService.js';
import {
    acquireGroupCallFinalizeLock,
    deleteGroupCall,
    getGroupCall,
    hasGroupCall,
    hasUserActiveGroupCall as hasUserActiveGroupCallState,
    listGroupCalls,
    listPendingGroupCallsForUser,
    releaseGroupCallStart as releaseGroupCallStartState,
    reserveGroupCallStart as reserveGroupCallStartState,
    saveGroupCall,
} from '../services/groupCallStateService.js';
import { removeGroupCallRingTimeout, scheduleGroupCallRingTimeout } from '../config/realtimeTimeoutQueue.js';
import {
    clearWaitingTimeout,
    emitWaitingRoomUpdate,
    generateParticipantToken,
    MAX_MEETING_PARTICIPANTS,
    normalizeRoomName,
} from '../controllers/meetingController.js';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

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
    return Object.values(groupCall.participants || {});
}

function groupCallDevicePayload(groupCall) {
    return {
        conversationId: groupCall.conversationId,
        callId: groupCall.callId,
        participants: participantsArray(groupCall),
    };
}

function buildGroupIncomingPayload(groupCall) {
    return {
        conversationId: groupCall.conversationId,
        callId: groupCall.callId,
        callType: groupCall.callType,
        initiator: groupCall.initiator,
        groupName: groupCall.groupName || 'Nhóm',
        participants: participantsArray(groupCall),
    };
}

function emitToOtherUserDevices(socket, userId, event, payload) {
    socket.to(`user:${userId.toString()}`).emit(event, payload);
}

async function sendOfflineGroupCallPushes({ conversation, groupCallInfo, groupName }) {
    const callLabel = groupCallInfo.callType === 'video' ? 'cuộc gọi video nhóm' : 'cuộc gọi thoại nhóm';

    await Promise.all((conversation.participants || []).map(async (participant) => {
        const participantUser = participant.userId;
        const participantId = participantUser?._id?.toString?.() || participantUser?.toString?.();
        if (!participantId) return;
        if (participantId === groupCallInfo.initiatorId) return;

        const callParticipant = groupCallInfo.participants?.[participantId];
        if (!callParticipant || callParticipant.isLocked || callParticipant.status !== 'ringing') return;
        if (isMuted(participant.mute, 'meetings')) return;

        await sendFCMToUser(participantId, {
            title: groupName || 'Cuộc gọi nhóm',
            body: `${groupCallInfo.initiator.displayName || 'Thành viên'} đang bắt đầu ${callLabel}`,
            dataOnly: true,
            data: {
                type: 'group-call',
                callType: groupCallInfo.callType,
                callId: groupCallInfo.callId,
                conversationId: groupCallInfo.conversationId,
                initiatorId: groupCallInfo.initiatorId,
                initiatorName: groupCallInfo.initiator.displayName || 'Thành viên',
                groupName: groupName || 'Nhóm',
                callActionToken: createCallActionToken({
                    type: 'group-call',
                    userId: participantId,
                    conversationId: groupCallInfo.conversationId,
                    callId: groupCallInfo.callId,
                }),
                callActionUrl: getCallActionUrl(),
                url: `/chat?conversationId=${groupCallInfo.conversationId}`,
            },
        });
    }));
}

function countJoined(groupCall) {
    let n = 0;
    for (const participant of participantsArray(groupCall)) {
        if (participant.status === 'joined') n++;
    }
    return n;
}

function normalizeUserId(value) {
    return value?.toString?.() || String(value);
}

function hasUserDirectCall(userId) {
    return hasUserDirectCallState(userId);
}

function reserveGroupCallStart(userId) {
    return reserveGroupCallStartState(userId);
}

function releaseGroupCallStart(userId) {
    return releaseGroupCallStartState(userId);
}

function hasUserActiveGroupCall(userId) {
    return hasUserActiveGroupCallState(userId);
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

async function endGroupCall(conversationId, io, { removeRingTimeout = true } = {}) {
    const groupCall = await getGroupCall(conversationId);
    if (!groupCall) return;

    const now = new Date();
    const endedAtIso = now.toISOString();
    const startedAtDate = groupCall.startedAt ? new Date(groupCall.startedAt) : null;
    const durationSec = startedAtDate && Number.isFinite(startedAtDate.getTime())
        ? Math.max(0, Math.round((now.getTime() - startedAtDate.getTime()) / 1000))
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

        if (await acquireGroupCallFinalizeLock(conversationId, groupCall.callId)) {
            await persistCallSystemMessage(io, {
                conversationId,
                callId: groupCall.callId,
                mode: 'group',
                callType: groupCall.callType,
                overallStatus: 'ended',
                duration: durationSec,
                startedAt: startedAtDate,
                endedAt: now,
                initiator: groupCall.initiator,
                participants: finalizedParticipants,
            });
        }
    } catch (error) {
        console.error('[GroupCall] endGroupCall DB error:', error);
    }

    io.to(conversationId).emit('group-call:ended', {
        conversationId,
        callId: groupCall.callId,
        duration: durationSec,
        endedAt: endedAtIso,
    });

    if (removeRingTimeout) {
        await removeGroupCallRingTimeout(conversationId, groupCall.callId);
    }
    await deleteGroupCall(conversationId);
}

async function checkAutoEnd(conversationId, io, options = {}) {
    const groupCall = await getGroupCall(conversationId);
    if (!groupCall) return;

    const joined = countJoined(groupCall);

    // Không còn ai trong call
    if (joined === 0) {
        await endGroupCall(conversationId, io, options);
        return;
    }

    // Chỉ còn 1 người joined và không còn ai đang ringing
    let ringing = 0;
    for (const participant of participantsArray(groupCall)) {
        if (participant.status === 'ringing') ringing++;
    }

    if (joined < 2 && ringing === 0) {
        await endGroupCall(conversationId, io, options);
    }
}

async function processGroupCallRingTimeout(io, conversationId, callId) {
    const session = await getGroupCall(conversationId);
    if (!session || (callId && session.callId !== callId)) return false;

    let changed = false;
    for (const participant of participantsArray(session)) {
        if (participant.status === 'ringing') {
            participant.status = 'no-answer';
            changed = true;
        }
    }

    if (!changed) return false;

    await saveGroupCall(session);
    io.to(conversationId).emit('group-call:user-declined', {
        conversationId,
        userId: null,
        participants: participantsArray(session),
    });
    await checkAutoEnd(conversationId, io, { removeRingTimeout: false });
    return true;
}

function registerGroupCallHandlers(socket, user, io, getReceiverSocketId) {
    const userId = user._id.toString();

    // START
    socket.on('group-call:start', async ({ conversationId, callType }) => {
        const reservationError = await reserveGroupCallStart(userId);
        if (reservationError) {
            return socket.emit('group-call:error', { reason: reservationError });
        }

        try {
            // Validate conversation
            const conversation = await Conversation.findById(conversationId)
                .populate('participants.userId', '_id displayName avatarUrl lock');
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
            if (await hasGroupCall(conversationId)) {
                return socket.emit('group-call:error', { reason: 'already-active' });
            }

            if (await hasUserDirectCall(userId) || await hasUserActiveGroupCall(userId)) {
                return socket.emit('group-call:error', { reason: 'already-in-call' });
            }

            const callId = buildSessionId('group-call');

            const participantsMap = {};
            for (const participant of conversation.participants) {
                const pid = participant.userId._id.toString();
                const isLocked = Boolean(participant.userId.lock?.isLocked);
                participantsMap[pid] = {
                    userId: pid,
                    displayName: isLocked ? LOCKED_USER_DISPLAY_NAME : participant.userId.displayName,
                    avatarUrl: isLocked ? null : (participant.userId.avatarUrl || null),
                    isLocked,
                    status: isLocked ? 'locked' : (pid === userId ? 'joined' : 'ringing'),
                    joinedAt: pid === userId ? new Date().toISOString() : null,
                    leftAt: null,
                };
            }

            const initiatorInfo = {
                _id: userId,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl || null,
            };
            const groupName = conversation.group?.name || 'Nhóm';

            const groupCallInfo = {
                callId,
                conversationId,
                initiatorId: userId,
                initiator: initiatorInfo,
                groupName,
                callType,
                startedAt: null,
                participants: participantsMap,
                participantSockets: { [userId]: socket.id },
            };
            await saveGroupCall(groupCallInfo);
            await scheduleGroupCallRingTimeout(conversationId, callId, 30_000);

            // Generate token for initiator
            const metadata = JSON.stringify({
                displayName: user.displayName,
                avatarUrl: user.avatarUrl || null,
            });
            const token = await generateToken(conversationId, userId, user.displayName, metadata);

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
            socket.to(conversationId).except(`user:${userId}`).emit(
                'group-call:incoming',
                buildGroupIncomingPayload(groupCallInfo)
            );

            await sendOfflineGroupCallPushes({
                conversation,
                groupCallInfo,
                groupName,
            });

            console.log(`[GroupCall] ${user.displayName} started group call in ${conversationId}`);
        } catch (error) {
            console.error('[GroupCall] start error:', error);
            socket.emit('group-call:error', { reason: 'server-error' });
        } finally {
            await releaseGroupCallStart(userId);
        }
    });

    // JOIN
    socket.on('group-call:join', async ({ conversationId }) => {
        try {
            const groupCall = await getGroupCall(conversationId);
            if (!groupCall) {
                return socket.emit('group-call:error', { reason: 'call-not-found' });
            }

            // Check if user is in the participant map (member of group)
            if (!groupCall.participants?.[userId]) {
                return socket.emit('group-call:error', { reason: 'not-a-member' });
            }

            const participant = groupCall.participants[userId];
            const activeSocketId = groupCall.participantSockets?.[userId];
            if (participant.status === 'joined' && activeSocketId && activeSocketId !== socket.id) {
                socket.emit('group-call:answered-on-other-device', groupCallDevicePayload(groupCall));
                return;
            }

            if (!groupCall.participantSockets) {
                groupCall.participantSockets = {};
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
            groupCall.participantSockets[userId] = socket.id;

            if (!groupCall.startedAt && userId !== groupCall.initiatorId) {
                groupCall.startedAt = new Date().toISOString();
            }

            let token;
            try {
                const metadata = JSON.stringify({
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl || null,
                });
                token = await generateToken(conversationId, userId, user.displayName, metadata);
            } catch (error) {
                if (groupCall.participantSockets?.[userId] === socket.id) {
                    participant.status = previousState.status;
                    participant.joinedAt = previousState.joinedAt;
                    participant.leftAt = previousState.leftAt;
                    if (previousState.socketId) {
                        groupCall.participantSockets[userId] = previousState.socketId;
                    } else {
                        delete groupCall.participantSockets[userId];
                    }
                }
                throw error;
            }

            await saveGroupCall(groupCall);

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
            const groupCall = await getGroupCall(conversationId);
            if (!groupCall) return;

            const participant = groupCall.participants?.[userId];
            if (!participant) return;

            const activeSocketId = groupCall.participantSockets?.[userId];
            if (participant.status === 'joined' && activeSocketId && activeSocketId !== socket.id) {
                socket.emit('group-call:answered-on-other-device', groupCallDevicePayload(groupCall));
                return;
            }

            if (participant.status === 'declined') {
                socket.emit('group-call:declined-on-other-device', groupCallDevicePayload(groupCall));
                return;
            }

            participant.status = 'declined';
            if (groupCall.participantSockets) delete groupCall.participantSockets[userId];
            await saveGroupCall(groupCall);

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
            const groupCall = await getGroupCall(conversationId);
            if (!groupCall) return;

            const participant = groupCall.participants?.[userId];
            if (!participant) return;

            const activeSocketId = groupCall.participantSockets?.[userId];
            if (participant.status === 'joined' && activeSocketId && activeSocketId !== socket.id) {
                socket.emit('group-call:answered-on-other-device', groupCallDevicePayload(groupCall));
                return;
            }

            participant.status = 'left';
            participant.leftAt = new Date().toISOString();
            if (groupCall.participantSockets) delete groupCall.participantSockets[userId];
            await saveGroupCall(groupCall);

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
    socket.on('group-call:status', async ({ conversationId }) => {
        const groupCall = await getGroupCall(conversationId);
        if (groupCall) {
            const participant = groupCall.participants?.[userId];
            const activeSocketId = groupCall.participantSockets?.[userId] || null;
            socket.emit('group-call:status-response', {
                conversationId,
                active: true,
                callId: groupCall.callId,
                callType: groupCall.callType,
                initiatorId: groupCall.initiatorId,
                participants: participantsArray(groupCall),
                startedAt: groupCall.startedAt ?? null,
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

            await clearWaitingTimeout(normalizedRoomName, waiterUserId);

            const alreadyParticipant = meeting.participants.some(
                (participant) => participant.userId.toString() === waiterUserId
            );

            if (!alreadyParticipant && meeting.participants.length >= MAX_MEETING_PARTICIPANTS) {
                await Meeting.findByIdAndUpdate(meeting._id, {
                    $pull: { waitingRoom: waiterUserId },
                });

                const targetSocketId = getReceiverSocketId(waiterUserId);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('participant-rejected', {
                        roomName: normalizedRoomName,
                        reason: 'room-full',
                    });
                }

                await emitWaitingRoomUpdate(normalizedRoomName, userId);
                return;
            }

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

            await clearWaitingTimeout(normalizedRoomName, waiterUserId);

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
                await clearWaitingTimeout(normalizedRoomName, waiterUserId);
            }

            const existingParticipantSet = new Set(
                meeting.participants.map((participant) => participant.userId.toString())
            );
            const openSlots = Math.max(0, MAX_MEETING_PARTICIPANTS - meeting.participants.length);
            const newParticipantIds = toAdmit.filter((targetId) => !existingParticipantSet.has(targetId));
            const admittedNewIds = newParticipantIds.slice(0, openSlots);
            const rejectedIds = newParticipantIds.slice(openSlots);
            const participantsToInsert = admittedNewIds.map((targetId) => ({ userId: targetId, joinedAt: now }));
            const admittedIds = new Set([
                ...toAdmit.filter((targetId) => existingParticipantSet.has(targetId)),
                ...admittedNewIds,
            ]);

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

            for (const targetId of admittedIds) {
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

            for (const targetId of rejectedIds) {
                const targetSocketId = getReceiverSocketId(targetId);
                if (!targetSocketId) {
                    continue;
                }

                io.to(targetSocketId).emit('participant-rejected', {
                    roomName: normalizedRoomName,
                    reason: 'room-full',
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

            await clearWaitingTimeout(normalizedRoomName, userId);

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
    for (const groupCall of await listGroupCalls()) {
        const conversationId = groupCall.conversationId;
        const participant = groupCall.participants?.[userId];
        const participantSocketId = groupCall.participantSockets?.[userId];
        const isActiveCallSocket = participantSocketId ? participantSocketId === socketId : true;

        if (participant && participant.status === 'joined' && isActiveCallSocket) {
            participant.status = 'left';
            participant.leftAt = new Date().toISOString();
            if (groupCall.participantSockets) delete groupCall.participantSockets[userId];
            await saveGroupCall(groupCall);

            io.to(conversationId).emit('group-call:user-left', {
                conversationId,
                userId,
                participants: participantsArray(groupCall),
            });

            await checkAutoEnd(conversationId, io);
        }
    }
}

async function emitPendingGroupCallsForUser(socket, userId) {
    const normalizedUserId = normalizeUserId(userId);

    for (const groupCall of await listPendingGroupCallsForUser(normalizedUserId)) {
        socket.emit('group-call:incoming', buildGroupIncomingPayload(groupCall));
    }
}

async function declineGroupCallFromPush(io, payload = {}) {
    const userId = normalizeUserId(payload.userId || '');
    const conversationId = payload.conversationId?.toString();
    if (!userId || !conversationId) return false;

    const groupCall = await getGroupCall(conversationId);
    if (!groupCall || (payload.callId && groupCall.callId !== payload.callId)) {
        return false;
    }

    const participant = groupCall.participants?.[userId];
    if (!participant || participant.status !== 'ringing') {
        return false;
    }

    participant.status = 'declined';
    if (groupCall.participantSockets) delete groupCall.participantSockets[userId];
    await saveGroupCall(groupCall);

    io.to(`user:${userId}`).emit('group-call:declined-on-other-device', groupCallDevicePayload(groupCall));
    io.to(conversationId).emit('group-call:user-declined', {
        conversationId,
        userId,
        participants: participantsArray(groupCall),
    });

    await checkAutoEnd(conversationId, io);
    return true;
}

export {
    registerGroupCallHandlers,
    handleGroupCallDisconnect,
    hasUserActiveGroupCall,
    emitPendingGroupCallsForUser,
    declineGroupCallFromPush,
    processGroupCallRingTimeout,
};
