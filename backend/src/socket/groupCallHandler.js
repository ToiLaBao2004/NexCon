import { AccessToken } from 'livekit-server-sdk';
import Conversation from '../models/conversationModel.js';
import { persistCallSystemMessage } from '../utils/callSystemMessageHelper.js';
import { getMeetingSession, serializeWaitingRoom } from '../controllers/livekitController.js';

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

function countJoined(groupCall) {
    let n = 0;
    for (const participant of groupCall.participants.values()) {
        if (participant.status === 'joined') n++;
    }
    return n;
}

function normalizeRoomName(roomName) {
    return String(roomName || '').trim().toLowerCase();
}

function emitHostWaitingRoomUpdate(io, getReceiverSocketId, session, roomName) {
    const hostSocketId = getReceiverSocketId(session.hostId);
    if (!hostSocketId) {
        return;
    }

    io.to(hostSocketId).emit('waiting-room-update', {
        roomName,
        waitingRoom: serializeWaitingRoom(session.waitingRoom),
    });
}

function removeWaiterFromQueue(session, idx) {
    const waiter = session.waitingRoom[idx];
    if (waiter?.timeoutId) {
        clearTimeout(waiter.timeoutId);
    }
    session.waitingRoom.splice(idx, 1);
    return waiter;
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

function registerGroupCallHandlers(socket, user, onlineUsers, io, getReceiverSocketId) {
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
            socket.to(conversationId).emit('group-call:incoming', {
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

            // Generate token
            const metadata = JSON.stringify({
                displayName: user.displayName,
                avatarUrl: user.avatarUrl || null,
            });
            const token = await generateToken(conversationId, userId, user.displayName, metadata);

            // Update in-memory
            const participant = groupCall.participants.get(userId);
            participant.status = 'joined';
            participant.joinedAt = new Date().toISOString();
            participant.leftAt = null;

            // Send token to this user
            socket.emit('group-call:token', { conversationId, token });

            // Notify room
            io.to(conversationId).emit('group-call:user-joined', {
                conversationId,
                user: {
                    _id: userId,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl || null,
                },
                participants: participantsArray(groupCall),
            });

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

            participant.status = 'declined';

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

            participant.status = 'left';
            participant.leftAt = new Date().toISOString();

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
            socket.emit('group-call:status-response', {
                conversationId,
                active: true,
                callId: groupCall.callId,
                callType: groupCall.callType,
                initiatorId: groupCall.initiatorId,
                participants: participantsArray(groupCall),
                startedAt: groupCall.startedAt?.toISOString() ?? null,
            });
        } else {
            socket.emit('group-call:status-response', {
                conversationId,
                active: false,
            });
        }
    });

    socket.on('admit-participant', async ({ roomName, targetUserId }) => {
        try {
            const normalizedRoomName = normalizeRoomName(roomName);
            const waiterUserId = String(targetUserId || '').trim();
            if (!normalizedRoomName || !waiterUserId) {
                return;
            }

            const session = getMeetingSession(normalizedRoomName);
            if (!session || session.hostId !== userId) {
                return;
            }

            const idx = session.waitingRoom.findIndex((waiter) => waiter.userId === waiterUserId);
            if (idx === -1) {
                return;
            }

            const waiter = removeWaiterFromQueue(session, idx);
            if (!waiter) {
                return;
            }

            const token = await generateToken(
                normalizedRoomName,
                waiter.userId,
                waiter.displayName,
                waiter.metadata ?? '',
            );

            session.participants.set(waiter.userId, {
                userId: waiter.userId,
                displayName: waiter.displayName,
                avatarUrl: waiter.avatarUrl ?? null,
                joinedAt: new Date().toISOString(),
                metadata: waiter.metadata ?? '',
            });

            const targetSocketId = getReceiverSocketId(waiter.userId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('participant-admitted', {
                    roomName: normalizedRoomName,
                    token,
                    isHost: session.hostId === waiter.userId,
                });
            }

            emitHostWaitingRoomUpdate(io, getReceiverSocketId, session, normalizedRoomName);
        } catch (error) {
            console.error('[Meet] admit-participant error:', error);
        }
    });

    socket.on('reject-participant', ({ roomName, targetUserId }) => {
        try {
            const normalizedRoomName = normalizeRoomName(roomName);
            const waiterUserId = String(targetUserId || '').trim();
            if (!normalizedRoomName || !waiterUserId) {
                return;
            }

            const session = getMeetingSession(normalizedRoomName);
            if (!session || session.hostId !== userId) {
                return;
            }

            const idx = session.waitingRoom.findIndex((waiter) => waiter.userId === waiterUserId);
            if (idx === -1) {
                return;
            }

            const waiter = removeWaiterFromQueue(session, idx);
            if (!waiter) {
                return;
            }

            const targetSocketId = getReceiverSocketId(waiter.userId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('participant-rejected', {
                    roomName: normalizedRoomName,
                    reason: 'host-rejected',
                });
            }

            emitHostWaitingRoomUpdate(io, getReceiverSocketId, session, normalizedRoomName);
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

            const session = getMeetingSession(normalizedRoomName);
            if (!session || session.hostId !== userId) {
                return;
            }

            const waitingSnapshot = [...session.waitingRoom];

            for (const waiter of waitingSnapshot) {
                if (waiter.timeoutId) {
                    clearTimeout(waiter.timeoutId);
                }

                const token = await generateToken(
                    normalizedRoomName,
                    waiter.userId,
                    waiter.displayName,
                    waiter.metadata ?? '',
                );

                session.participants.set(waiter.userId, {
                    userId: waiter.userId,
                    displayName: waiter.displayName,
                    avatarUrl: waiter.avatarUrl ?? null,
                    joinedAt: new Date().toISOString(),
                    metadata: waiter.metadata ?? '',
                });

                const targetSocketId = getReceiverSocketId(waiter.userId);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('participant-admitted', {
                        roomName: normalizedRoomName,
                        token,
                        isHost: session.hostId === waiter.userId,
                    });
                }
            }

            session.waitingRoom = [];
            emitHostWaitingRoomUpdate(io, getReceiverSocketId, session, normalizedRoomName);
        } catch (error) {
            console.error('[Meet] admit-all-participants error:', error);
        }
    });

    socket.on('cancel-waiting', ({ roomName }) => {
        try {
            const normalizedRoomName = normalizeRoomName(roomName);
            if (!normalizedRoomName) {
                return;
            }

            const session = getMeetingSession(normalizedRoomName);
            if (!session) {
                return;
            }

            const idx = session.waitingRoom.findIndex((waiter) => waiter.userId === userId);
            if (idx === -1) {
                return;
            }

            removeWaiterFromQueue(session, idx);
            emitHostWaitingRoomUpdate(io, getReceiverSocketId, session, normalizedRoomName);
        } catch (error) {
            console.error('[Meet] cancel-waiting error:', error);
        }
    });
}

// Disconnect handler
async function handleGroupCallDisconnect(userId, io) {
    for (const [conversationId, groupCall] of activeGroupCalls) {
        const participant = groupCall.participants.get(userId);
        if (participant && participant.status === 'joined') {
            participant.status = 'left';
            participant.leftAt = new Date().toISOString();

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
