import Friend from '../models/friendModel.js';
import BlockUser from '../models/blockUserModel.js';
import Conversation from '../models/conversationModel.js';
import User from '../models/userModel.js';
import { AccessToken } from 'livekit-server-sdk';
import { persistCallSystemMessage } from '../utils/callSystemMessageHelper.js';
import { sendFCMToUser } from '../services/fcmService.js';
import { isMuted } from '../utils/isMuted.js';
import { createCallActionToken, getCallActionUrl } from '../utils/callActionToken.js';
import {
    acquireDirectCallFinalizeLock,
    deleteDirectCallSession,
    findDirectCallBetween as findDirectCallBetweenState,
    findDirectCallForParticipants as findDirectCallForParticipantsState,
    findStoredDirectCall as findStoredDirectCallState,
    hasUserDirectCall as hasUserDirectCallState,
    listDirectCallsForUser,
    releaseDirectCallOffer as releaseDirectCallOfferState,
    reserveDirectCallOffer as reserveDirectCallOfferState,
    saveDirectCallSession,
} from '../services/directCallStateService.js';
import { hasUserActiveGroupCall } from '../services/groupCallStateService.js';
import { removeDirectCallTimeout, scheduleDirectCallTimeout as enqueueDirectCallTimeout } from '../config/realtimeTimeoutQueue.js';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const DIRECT_CALL_RING_TIMEOUT_MS = 30_000;

const sortPair = (a, b) => (a < b ? [a, b] : [b, a]);
const getDirectCallKey = (userId1, userId2) => {
    const [userA, userB] = sortPair(userId1.toString(), userId2.toString());
    return `${userA}:${userB}`;
};

async function findDirectCallBetween(userId1, userId2) {
    return findDirectCallBetweenState(userId1, userId2);
}

async function findDirectCallForParticipants({ userId, otherUserId = null, roomName = null }) {
    return findDirectCallForParticipantsState({ userId, otherUserId, roomName });
}

async function findStoredDirectCall(session) {
    return findStoredDirectCallState(session);
}

async function setDirectCall(session) {
    return saveDirectCallSession(session);
}

async function deleteDirectCall(session, { removeTimeout = true } = {}) {
    if (!session) return;
    if (removeTimeout) {
        await removeDirectCallTimeout(session.sessionId);
    }
    return deleteDirectCallSession(session);
}

async function hasUserDirectCall(userId) {
    return hasUserDirectCallState(userId);
}

function reserveDirectCallOffer(userId) {
    return reserveDirectCallOfferState(userId);
}

function releaseDirectCallOffer(userId) {
    return releaseDirectCallOfferState(userId);
}

function buildSessionId(prefix = 'dm-call') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toIsoOrNull(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function areFriends(userId1, userId2) {
    const [userA, userB] = sortPair(userId1.toString(), userId2.toString());
    const friendship = await Friend.findOne({ userA, userB }).lean();
    return !!friendship;
}

async function hasDirectConversation(userId1, userId2) {
    const conversation = await Conversation.findOne({
        type: 'direct',
        'participants.userId': { $all: [userId1, userId2] }
    }).select('_id').lean();
    return !!conversation;
}

async function isBlocked(userId1, userId2) {
    const block = await BlockUser.findOne({
        $or: [
            { from: userId1, to: userId2 },
            { from: userId2, to: userId1 }
        ]
    }).lean();
    return !!block;
}

async function findCallableUser(userId) {
    return User.findById(userId).select('lock').lean();
}

async function findOrCreateDirectConversation(userId1, userId2) {
    let conversation = await Conversation.findOne({
        type: 'direct',
        'participants.userId': { $all: [userId1, userId2] }
    }).populate('participants.userId', 'displayName avatarUrl');

    if (!conversation) {
        conversation = await Conversation.create({
            type: 'direct',
            participants: [
                { userId: userId1, joinedAt: new Date() },
                { userId: userId2, joinedAt: new Date() }
            ]
        });
        conversation = await Conversation.findById(conversation._id)
            .populate('participants.userId', 'displayName avatarUrl');
    }

    return conversation;
}

function buildInitialDirectSession({ conversation, caller, receiverId, callType, callerSocketId = null }) {
    const callerId = caller._id.toString();
    const receiver = conversation.participants.find(
        (p) => p.userId?._id?.toString() === receiverId.toString()
    )?.userId;

    const sessionId = buildSessionId('dm-call');

    return {
        sessionId,
        callKey: getDirectCallKey(callerId, receiverId.toString()),
        callerId,
        receiverId: receiverId.toString(),
        conversationId: conversation._id.toString(),
        callType,
        roomName: sessionId,
        status: 'calling',
        startedAt: null,
        callerSocketId,
        receiverSocketId: null,
        ringTimeout: null,
        livekitConnected: {
            [callerId]: false,
            [receiverId.toString()]: false,
        },
        initiator: {
            _id: callerId,
            displayName: caller.displayName,
            avatarUrl: caller.avatarUrl || null,
        },
        participants: [
            {
                userId: {
                    _id: callerId,
                    displayName: caller.displayName,
                    avatarUrl: caller.avatarUrl || null,
                },
                status: 'ringing',
                joinedAt: null,
                leftAt: null,
            },
            {
                userId: {
                    _id: receiverId.toString(),
                    displayName: receiver?.displayName || 'Người dùng',
                    avatarUrl: receiver?.avatarUrl ?? null,
                },
                status: 'ringing',
                joinedAt: null,
                leftAt: null,
            },
        ],
    };
}

function markParticipant(session, userId, patch) {
    const target = session.participants.find(
        (p) => p.userId._id.toString() === userId.toString()
    );
    if (target) Object.assign(target, patch);
}

function markLiveKitConnected(session, userId) {
    const normalizedUserId = userId.toString();
    if (!session.livekitConnected || typeof session.livekitConnected !== 'object') {
        session.livekitConnected = {
            [session.callerId]: false,
            [session.receiverId]: false,
        };
    }
    session.livekitConnected[normalizedUserId] = true;
    return Boolean(session.livekitConnected[session.callerId])
        && Boolean(session.livekitConnected[session.receiverId]);
}

function finalizeSessionParticipants(participants, endedAtIso) {
    return participants.map((p) => {
        if (p.status === 'ringing') return { ...p, status: 'missed' };
        if (p.status === 'accepted') return { ...p, status: 'left', leftAt: p.leftAt || endedAtIso };
        return p;
    });
}

async function persistFinalizedDirectSession(io, session, overallStatus) {
    const endedAt = new Date();
    const endedAtIso = endedAt.toISOString();
    const finalizedParticipants = finalizeSessionParticipants(session.participants, endedAtIso);
    const startedAtDate = session.startedAt ? new Date(session.startedAt) : null;
    const duration = startedAtDate
        ? Math.max(0, Math.round((endedAt.getTime() - startedAtDate.getTime()) / 1000))
        : 0;

    await persistCallSystemMessage(io, {
        conversationId: session.conversationId,
        callId: session.sessionId,
        mode: 'direct',
        callType: session.callType,
        overallStatus,
        duration,
        startedAt: startedAtDate,
        endedAt,
        initiator: session.initiator,
        participants: finalizedParticipants,
    });
}

function buildDirectIncomingPayload(session) {
    return {
        from: {
            _id: session.initiator._id,
            displayName: session.initiator.displayName,
            avatarUrl: session.initiator.avatarUrl,
        },
        callType: session.callType,
        roomName: session.roomName,
        conversationId: session.conversationId,
    };
}

function buildDirectRingingPayload(session) {
    return {
        roomName: session.roomName,
        conversationId: session.conversationId,
        callerId: session.callerId,
        receiverId: session.receiverId,
    };
}

async function sendOfflineDirectCallPush({ session, conversation, receiverId }) {
    const receiverParticipant = conversation.participants.find(
        (participant) => participant.userId?._id?.toString() === receiverId.toString()
            || participant.userId?.toString?.() === receiverId.toString()
    );

    if (isMuted(receiverParticipant?.mute, 'meetings')) {
        return;
    }

    const callLabel = session.callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
    await sendFCMToUser(receiverId, {
        title: session.initiator.displayName || 'Cuộc gọi đến',
        body: `${callLabel} đến`,
        dataOnly: true,
        data: {
            type: 'direct-call',
            callType: session.callType,
            roomName: session.roomName,
            conversationId: session.conversationId,
            callerId: session.callerId,
            receiverId: session.receiverId,
            callerName: session.initiator.displayName || 'Người dùng',
            callerAvatarUrl: session.initiator.avatarUrl || '',
            callActionToken: createCallActionToken({
                type: 'direct-call',
                callerId: session.callerId,
                receiverId: session.receiverId,
                roomName: session.roomName,
                conversationId: session.conversationId,
            }),
            callActionUrl: getCallActionUrl(),
            url: `/chat?conversationId=${session.conversationId}`,
        },
    });
}

async function generateLiveKitToken(roomName, identity, displayName, metadata) {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        throw new Error('LiveKit credentials are missing');
    }
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        name: displayName,
        ttl: '2h',
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

export function registerCallHandlers(socket, user, io, getReceiverSocketId) {
    // Helper emit tới tất cả thiết bị của 1 user
    function emitToUserRoom(userId, event, data) {
        io.to(`user:${userId.toString()}`).emit(event, data);
    }

    function getParticipantSocketTarget(session, userId) {
        const normalizedUserId = userId.toString();
        if (session?.callerId === normalizedUserId && session.callerSocketId) {
            return session.callerSocketId;
        }
        if (session?.receiverId === normalizedUserId && session.receiverSocketId) {
            return session.receiverSocketId;
        }
        return getReceiverSocketId(normalizedUserId);
    }

    function scheduleDirectCallTimeout(session) {
        return enqueueDirectCallTimeout(session.sessionId, DIRECT_CALL_RING_TIMEOUT_MS);
    }

    async function finalizeAndNotifyCall({ toUserId, roomName = null, cancelled = false }) {
        const myId = user._id.toString();
        const otherIdFromPayload = toUserId ? toUserId.toString() : null;

        const activeCall = await findDirectCallForParticipants({
            userId: myId,
            otherUserId: otherIdFromPayload,
            roomName,
        });

        const resolvedOtherId = activeCall
            ? (activeCall.callerId === myId ? activeCall.receiverId : activeCall.callerId)
            : otherIdFromPayload;

        let notifyEvent = cancelled ? 'call-cancelled' : 'call-ended';

        if (activeCall) {
            const rejectedByReceiver =
                cancelled &&
                activeCall.status === 'calling' &&
                activeCall.receiverId === myId;
            if (rejectedByReceiver) {
                markParticipant(activeCall, myId, { status: 'declined' });
            }

            const overallStatus = activeCall.status === 'in-call' ? 'ended' : 'canceled';
            if (await acquireDirectCallFinalizeLock(activeCall.sessionId)) {
                await persistFinalizedDirectSession(io, activeCall, overallStatus);
            }
            await deleteDirectCall(activeCall);
            if (rejectedByReceiver) {
                notifyEvent = 'call-rejected';
            } else if (overallStatus !== 'ended') {
                notifyEvent = 'call-cancelled';
            }
        }

        const payload = {
            by: { _id: user._id, displayName: user.displayName }
        };
        if (activeCall) {
            Object.assign(payload, {
                roomName: activeCall.roomName,
                conversationId: activeCall.conversationId,
                callerId: activeCall.callerId,
                receiverId: activeCall.receiverId,
            });
        }

        // Emit tới tất cả thiết bị của cả 2 bên
        if (resolvedOtherId) emitToUserRoom(resolvedOtherId, notifyEvent, payload);
        emitToUserRoom(myId, notifyEvent, payload);

        console.log(`Call ${notifyEvent} between ${myId} and ${resolvedOtherId || 'unknown'}`);
    }

    async function rejectOtherRingingCallsForReceiver(acceptedCall) {
        const receiverId = acceptedCall.receiverId;
        const sessionsToReject = (await listDirectCallsForUser(receiverId)).filter(
            (session) =>
                session.sessionId !== acceptedCall.sessionId &&
                session.receiverId === receiverId &&
                session.status === 'calling'
        );

        for (const session of sessionsToReject) {
            markParticipant(session, receiverId, { status: 'declined' });
            await deleteDirectCall(session);

            const payload = {
                by: { _id: user._id, displayName: user.displayName },
                roomName: session.roomName,
                conversationId: session.conversationId,
                callerId: session.callerId,
                receiverId: session.receiverId,
            };

            emitToUserRoom(session.callerId, 'call-rejected', payload);
            emitToUserRoom(receiverId, 'call-rejected', payload);

            try {
                if (await acquireDirectCallFinalizeLock(session.sessionId)) {
                    await persistFinalizedDirectSession(io, session, 'canceled');
                }
            } catch (error) {
                console.error('Error rejecting parallel incoming call:', error);
            }
        }
    }

    socket.on('call-offer', async ({ toUserId, callType }) => {
        const callerId = user._id.toString();
        const receiverId = toUserId.toString();
        const reservationError = await reserveDirectCallOffer(callerId);
        if (reservationError) {
            socket.emit('call-failed', { reason: reservationError });
            return;
        }

        try {
            if (callerId === receiverId) {
                socket.emit('call-failed', { reason: 'self-call' });
                return;
            }

            const receiver = await findCallableUser(receiverId);
            if (!receiver) {
                socket.emit('call-failed', { reason: 'user-not-found' });
                return;
            }
            if (receiver.lock?.isLocked) {
                socket.emit('call-failed', {
                    reason: 'account-locked',
                    message: 'Không thể gọi tài khoản đã bị khóa.',
                });
                return;
            }

            const blocked = await isBlocked(callerId, receiverId);
            if (blocked) {
                socket.emit('call-failed', { reason: 'blocked' });
                return;
            }

            const [friends, hasConversation] = await Promise.all([
                areFriends(callerId, receiverId),
                hasDirectConversation(callerId, receiverId)
            ]);
            if (!friends && !hasConversation) {
                socket.emit('call-failed', { reason: 'not-friends' });
                return;
            }

            if (await hasUserDirectCall(callerId) || await hasUserActiveGroupCall(callerId)) {
                socket.emit('call-failed', { reason: 'already-in-call' });
                return;
            }

            const conversation = await findOrCreateDirectConversation(callerId, receiverId);

            const existingDirectCall = await findDirectCallBetween(callerId, receiverId);
            if (existingDirectCall) {
                socket.emit('call-failed', { reason: 'already-active' });
                return;
            }

            const session = buildInitialDirectSession({
                conversation,
                caller: user,
                receiverId,
                callType,
                callerSocketId: socket.id,
            });
            await setDirectCall(session);
            await scheduleDirectCallTimeout(session);

            // Gửi incoming-call tới TẤT CẢ thiết bị của receiver
            const receiverTarget = getParticipantSocketTarget(session, receiverId);
            const callerTarget = getParticipantSocketTarget(session, callerId);
            if (receiverTarget) {
                io.to(receiverTarget).emit('incoming-call', buildDirectIncomingPayload(session));
            }
            await sendOfflineDirectCallPush({ session, conversation, receiverId });
            if (callerTarget) {
                io.to(callerTarget).emit('call-ringing', buildDirectRingingPayload(session));
            }

            console.log(`${user.displayName} is calling ${receiverId} [${callType}] | session: ${session.sessionId}`);

        } catch (error) {
            console.error('Error in call-offer:', error);
            socket.emit('call-failed', { reason: 'server-error' });
        } finally {
            await releaseDirectCallOffer(callerId);
        }
    });

    socket.on('accept-call', async ({ toUserId, roomName }) => {
        const callerId = toUserId?.toString();
        const receiverId = user._id.toString();
        if (!callerId) return;

        const activeCall = await findDirectCallForParticipants({
            userId: receiverId,
            otherUserId: callerId,
            roomName,
        });
        if (!activeCall) return;
        if (activeCall.receiverId !== receiverId) {
            socket.emit('call-failed', { reason: 'not-call-receiver' });
            return;
        }

        // Thiết bị khác đã bắt rồi — dismiss thiết bị này
        if (activeCall.status !== 'calling') {
            socket.emit('call-answered-on-other-device', {
                conversationId: activeCall.conversationId,
                roomName: activeCall.roomName,
                callerId: activeCall.callerId,
                receiverId: activeCall.receiverId,
            });
            return;
        }

        activeCall.status = 'connecting';
        activeCall.receiverSocketId = socket.id;
        markParticipant(activeCall, receiverId, { status: 'accepted', joinedAt: null });
        await setDirectCall(activeCall);
        await removeDirectCallTimeout(activeCall.sessionId);
        await rejectOtherRingingCallsForReceiver(activeCall);

        const callerTarget = getParticipantSocketTarget(activeCall, callerId);
        if (callerTarget) {
            io.to(callerTarget).emit('accept-call', {
                by: { _id: user._id, displayName: user.displayName },
                roomName: activeCall.roomName,
                conversationId: activeCall.conversationId,
                callerId: activeCall.callerId,
                receiverId: activeCall.receiverId,
            });
        }

        // Dismiss tất cả thiết bị khác của receiver
        socket.to(`user:${receiverId}`).emit('call-answered-on-other-device', {
            conversationId: activeCall.conversationId,
            roomName: activeCall.roomName,
            callerId: activeCall.callerId,
            receiverId: activeCall.receiverId,
        });
    });

    socket.on('call-answer', async ({ toUserId, roomName }) => {
        const callerId = toUserId?.toString();
        const receiverId = user._id.toString();

        try {
            if (!callerId) return;

            const activeCall = await findDirectCallForParticipants({
                userId: receiverId,
                otherUserId: callerId,
                roomName,
            });
            if (!activeCall) return;
            if (activeCall.receiverId !== receiverId) {
                socket.emit('call-failed', { reason: 'not-call-receiver' });
                return;
            }

            if (activeCall.status !== 'connecting' && activeCall.status !== 'calling') return;

            activeCall.receiverSocketId = socket.id;

            activeCall.status = 'connecting';
            markParticipant(activeCall, receiverId, { status: 'accepted' });
            await setDirectCall(activeCall);
            await removeDirectCallTimeout(activeCall.sessionId);
            await rejectOtherRingingCallsForReceiver(activeCall);

            const [callerToken, receiverToken] = await Promise.all([
                generateLiveKitToken(
                    activeCall.roomName,
                    callerId,
                    activeCall.initiator.displayName || callerId,
                    JSON.stringify({
                        displayName: activeCall.initiator.displayName || callerId,
                        avatarUrl: activeCall.initiator.avatarUrl || null,
                    })
                ),
                generateLiveKitToken(
                    activeCall.roomName,
                    receiverId,
                    user.displayName,
                    JSON.stringify({
                        displayName: user.displayName,
                        avatarUrl: user.avatarUrl || null,
                    })
                )
            ]);

            const latestCall = await findStoredDirectCall(activeCall);
            if (!latestCall || latestCall.sessionId !== activeCall.sessionId || latestCall.receiverId !== receiverId) return;

            latestCall.status = 'connecting';
            markParticipant(latestCall, callerId, { status: 'accepted' });
            markParticipant(latestCall, receiverId, { status: 'accepted' });
            await setDirectCall(latestCall);

            // Token chỉ gửi đúng socket đang active (không broadcast)
            const callerTarget = getParticipantSocketTarget(latestCall, callerId);
            if (callerTarget) {
                io.to(callerTarget).emit('call-answered', {
                    token: callerToken,
                    roomName: latestCall.roomName,
                });
            }
            socket.emit('call-accepted', {
                token: receiverToken,
                roomName: latestCall.roomName,
            });

            console.log(`${user.displayName} accepted call from ${callerId}`);

        } catch (error) {
            console.error('Error in call-answer:', error);
            if (callerId) {
                try {
                    await finalizeAndNotifyCall({ toUserId: callerId, roomName, cancelled: true });
                } catch (finalizeError) {
                    console.error('Error cleaning up failed call-answer:', finalizeError);
                }
                socket.emit('call-failed', { reason: 'server-error' });
                const activeCall = await findDirectCallBetween(callerId, receiverId);
                const callerTarget = activeCall
                    ? getParticipantSocketTarget(activeCall, callerId)
                    : getReceiverSocketId(callerId);
                if (callerTarget) {
                    io.to(callerTarget).emit('call-failed', { reason: 'server-error' });
                }
            }
        }
    });

    socket.on('call-connected', async ({ toUserId, roomName }) => {
        const myId = user._id.toString();
        const otherId = toUserId?.toString();
        if (!otherId) return;

        const activeCall = await findDirectCallForParticipants({
            userId: myId,
            otherUserId: otherId,
            roomName,
        });
        if (!activeCall) return;

        const isParticipant = activeCall.callerId === myId || activeCall.receiverId === myId;
        if (!isParticipant) return;

        const connectedAt = new Date().toISOString();
        markParticipant(activeCall, myId, { status: 'accepted', joinedAt: connectedAt });

        const bothConnected = markLiveKitConnected(activeCall, myId);
        if (bothConnected && !activeCall.startedAt) {
            activeCall.status = 'in-call';
            activeCall.startedAt = connectedAt;
            console.log(`Call active between ${activeCall.callerId} and ${activeCall.receiverId} at ${connectedAt}`);
        }
        await setDirectCall(activeCall);
    });

    socket.on('call-rejected', async ({ toUserId, roomName }) => {
        const callerId = toUserId?.toString();
        const rejecterId = user._id.toString();
        if (!callerId) return;

        try {
            const activeCall = await findDirectCallForParticipants({
                userId: rejecterId,
                otherUserId: callerId,
                roomName,
            });
            if (activeCall) {
                markParticipant(activeCall, rejecterId, { status: 'declined' });
                if (await acquireDirectCallFinalizeLock(activeCall.sessionId)) {
                    await persistFinalizedDirectSession(io, activeCall, 'canceled');
                }
                await deleteDirectCall(activeCall);
            }

            const payload = {
                by: { _id: user._id, displayName: user.displayName },
                roomName: activeCall?.roomName,
                conversationId: activeCall?.conversationId,
                callerId,
                receiverId: rejecterId,
            };

            // Notify tất cả thiết bị của cả 2 bên để dismiss UI
            emitToUserRoom(callerId, 'call-rejected', payload);
            emitToUserRoom(rejecterId, 'call-rejected', payload);

            console.log(`${user.displayName} rejected call from ${callerId}`);

        } catch (error) {
            console.error('Error in call-rejected:', error);
        }
    });

    socket.on('call-ended', async ({ toUserId, roomName }) => {
        try {
            await finalizeAndNotifyCall({ toUserId, roomName, cancelled: false });
        } catch (error) {
            console.error('Error in call-ended:', error);
        }
    });

    socket.on('leave-call', async ({ toUserId, roomName }) => {
        try {
            await finalizeAndNotifyCall({ toUserId, roomName, cancelled: false });
        } catch (error) {
            console.error('Error in leave-call:', error);
        }
    });

    socket.on('call-cancelled', async ({ toUserId, roomName }) => {
        try {
            await finalizeAndNotifyCall({ toUserId, roomName, cancelled: true });
        } catch (error) {
            console.error('Error in call-cancelled:', error);
        }
    });

    socket.on('call-video-toggle', async ({ toUserId, isVideoOff }) => {
        const myId = user._id.toString();
        const otherId = toUserId.toString();
        const activeCall = await findDirectCallBetween(myId, otherId);
        const otherTarget = activeCall
            ? getParticipantSocketTarget(activeCall, otherId)
            : getReceiverSocketId(otherId);

        if (otherTarget) {
            io.to(otherTarget).emit('call-video-toggle', { isVideoOff });
        }
    });
}

export async function processDirectCallTimeout(io, sessionId, getReceiverSocketId = (userId) => `user:${userId}`) {
    const latestCall = await findStoredDirectCall({ sessionId });
    if (!latestCall || latestCall.sessionId !== sessionId) return false;
    if (latestCall.status !== 'calling') return false;

    markParticipant(latestCall, latestCall.receiverId, { status: 'no-answer' });
    if (await acquireDirectCallFinalizeLock(latestCall.sessionId)) {
        await persistFinalizedDirectSession(io, latestCall, 'missed');
    }

    const callerTarget = latestCall.callerSocketId || getReceiverSocketId(latestCall.callerId);
    await deleteDirectCall(latestCall, { removeTimeout: false });

    if (callerTarget) {
        io.to(callerTarget).emit('call-failed', { reason: 'no-answer' });
    }
    io.to(`user:${latestCall.receiverId}`).emit('call-cancelled', {
        reason: 'no-answer',
        roomName: latestCall.roomName,
        conversationId: latestCall.conversationId,
        callerId: latestCall.callerId,
        receiverId: latestCall.receiverId,
    });

    console.log(`Call no-answer between ${latestCall.callerId} and ${latestCall.receiverId}`);
    return true;
}

export async function emitPendingDirectCallsForUser(socket, userId, io, getReceiverSocketId) {
    const normalizedUserId = userId.toString();

    for (const session of await listDirectCallsForUser(normalizedUserId)) {
        if (session.receiverId !== normalizedUserId) continue;
        if (session.status !== 'calling') continue;

        socket.emit('incoming-call', buildDirectIncomingPayload(session));

        const callerTarget = session.callerSocketId || getReceiverSocketId?.(session.callerId);
        if (callerTarget) {
            io.to(callerTarget).emit('call-ringing', buildDirectRingingPayload(session));
        }
    }
}

export async function declineDirectCallFromPush(io, getReceiverSocketId, payload = {}) {
    const receiverId = payload.receiverId?.toString();
    const callerId = payload.callerId?.toString();
    if (!receiverId || !callerId) return false;

    const activeCall = await findDirectCallForParticipants({
        userId: receiverId,
        otherUserId: callerId,
        roomName: payload.roomName,
    });
    if (!activeCall || activeCall.receiverId !== receiverId || activeCall.status !== 'calling') {
        return false;
    }

    markParticipant(activeCall, receiverId, { status: 'declined' });
    if (await acquireDirectCallFinalizeLock(activeCall.sessionId)) {
        await persistFinalizedDirectSession(io, activeCall, 'canceled');
    }
    await deleteDirectCall(activeCall);

    const eventPayload = {
        by: { _id: receiverId },
        roomName: activeCall.roomName,
        conversationId: activeCall.conversationId,
        callerId,
        receiverId,
    };

    io.to(`user:${callerId}`).emit('call-rejected', eventPayload);
    io.to(`user:${receiverId}`).emit('call-rejected', eventPayload);

    return true;
}

export async function handleCallDisconnect(userId, socketId, io, getReceiverSocketId) {
    const normalizedUserId = userId.toString();
    const sessionsToEnd = [];
    const seenSessionIds = new Set();
    for (const session of await listDirectCallsForUser(normalizedUserId)) {
        const isCallSocket = session.callerSocketId === socketId || session.receiverSocketId === socketId;
        const isLegacyParticipant = !session.callerSocketId
            && !session.receiverSocketId
            && (session.callerId === normalizedUserId || session.receiverId === normalizedUserId);

        if (isCallSocket || isLegacyParticipant) {
            const sessionKey = session.sessionId || session.callKey || `${session.callerId}:${session.receiverId}`;
            if (!seenSessionIds.has(sessionKey)) {
                seenSessionIds.add(sessionKey);
                sessionsToEnd.push(session);
            }
        }
    }

    if (sessionsToEnd.length === 0) return;

    for (const foundSession of sessionsToEnd) {
        const otherId = foundSession.callerId === normalizedUserId
            ? foundSession.receiverId
            : foundSession.callerId;

        const disconnectedParticipant = foundSession.participants.find(
            (p) => p.userId._id.toString() === normalizedUserId
        );
        if (disconnectedParticipant && disconnectedParticipant.status === 'accepted') {
            disconnectedParticipant.status = 'left';
            disconnectedParticipant.leftAt = toIsoOrNull(new Date());
        }

        const overallStatus = foundSession.status === 'in-call' ? 'ended' : 'missed';
        if (await acquireDirectCallFinalizeLock(foundSession.sessionId)) {
            await persistFinalizedDirectSession(io, foundSession, overallStatus);
        }

        // Notify all devices of the remaining participant.
        const otherTarget = getReceiverSocketId(otherId);
        if (otherTarget) {
            io.to(otherTarget).emit('call-ended', {
                by: { _id: normalizedUserId },
                roomName: foundSession.roomName,
                conversationId: foundSession.conversationId,
                callerId: foundSession.callerId,
                receiverId: foundSession.receiverId,
            });
        }

        await deleteDirectCall(foundSession);
    }
    console.log(`Direct calls auto-ended: ${normalizedUserId} disconnected`);
}
