import Friend from '../models/friendModel.js';
import BlockUser from '../models/blockUserModel.js';
import Conversation from '../models/conversationModel.js';
import { AccessToken } from 'livekit-server-sdk';
import { persistCallSystemMessage } from '../utils/callSystemMessageHelper.js';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const sortPair = (a, b) => (a < b ? [a, b] : [b, a]);

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
        callerId,
        receiverId: receiverId.toString(),
        conversationId: conversation._id.toString(),
        callType,
        roomName: sessionId,
        status: 'calling',
        startedAt: null,
        callerSocketId,
        receiverSocketId: null,
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

async function persistMissedDirectCall(io, { conversation, caller, receiverId, callType }) {
    const session = buildInitialDirectSession({ conversation, caller, receiverId, callType });
    await persistFinalizedDirectSession(io, session, 'missed');
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

export function registerCallHandlers(socket, user, activeCalls, io, getReceiverSocketId) {

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

    async function finalizeAndNotifyCall({ toUserId, cancelled = false }) {
        const myId = user._id.toString();
        const otherIdFromPayload = toUserId ? toUserId.toString() : null;

        let activeCall = null;
        if (otherIdFromPayload) {
            activeCall = activeCalls.get(myId) || activeCalls.get(otherIdFromPayload);
        } else {
            activeCall = activeCalls.get(myId);
        }

        if (!activeCall) {
            activeCall = [...activeCalls.values()].find(
                (call) => call.callerId === myId || call.receiverId === myId
            ) || null;
        }

        const resolvedOtherId = activeCall
            ? (activeCall.callerId === myId ? activeCall.receiverId : activeCall.callerId)
            : otherIdFromPayload;

        let notifyEvent = cancelled ? 'call-cancelled' : 'call-ended';

        if (activeCall) {
            const overallStatus = activeCall.status === 'in-call' ? 'ended' : 'canceled';
            await persistFinalizedDirectSession(io, activeCall, overallStatus);
            activeCalls.delete(activeCall.callerId);
            if (overallStatus !== 'ended') notifyEvent = 'call-cancelled';
        }

        const payload = {
            by: { _id: user._id, displayName: user.displayName }
        };

        // Emit tới tất cả thiết bị của cả 2 bên
        if (resolvedOtherId) emitToUserRoom(resolvedOtherId, notifyEvent, payload);
        emitToUserRoom(myId, notifyEvent, payload);

        console.log(`Call ${notifyEvent} between ${myId} and ${resolvedOtherId || 'unknown'}`);
    }

    socket.on('call-offer', async ({ toUserId, callType }) => {
        const callerId = user._id.toString();
        const receiverId = toUserId.toString();

        try {
            if (callerId === receiverId) {
                socket.emit('call-failed', { reason: 'self-call' });
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

            const conversation = await findOrCreateDirectConversation(callerId, receiverId);

            // Kiểm tra receiver có online không (dùng room thay vì socketId)
            const receiverRoom = io.sockets.adapter.rooms.get(`user:${receiverId}`);
            const isReceiverOnline = receiverRoom && receiverRoom.size > 0;

            if (!isReceiverOnline) {
                await persistMissedDirectCall(io, { conversation, caller: user, receiverId, callType });
                socket.emit('call-failed', { reason: 'offline' });
                return;
            }

            const isReceiverBusy = [...activeCalls.values()].some(
                (call) => call.receiverId === receiverId || call.callerId === receiverId
            );
            if (isReceiverBusy) {
                await persistMissedDirectCall(io, { conversation, caller: user, receiverId, callType });
                socket.emit('call-failed', { reason: 'busy' });
                return;
            }

            const isCallerBusy = [...activeCalls.values()].some(
                (call) => call.callerId === callerId || call.receiverId === callerId
            );
            if (isCallerBusy) {
                socket.emit('call-failed', { reason: 'already-in-call' });
                return;
            }

            const session = buildInitialDirectSession({
                conversation,
                caller: user,
                receiverId,
                callType,
                callerSocketId: socket.id,
            });
            activeCalls.set(callerId, session);

            // Gửi incoming-call tới TẤT CẢ thiết bị của receiver
            emitToUserRoom(receiverId, 'incoming-call', {
                from: {
                    _id: user._id,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl,
                },
                callType,
                roomName: session.roomName,
                conversationId: session.conversationId,
            });

            console.log(`${user.displayName} is calling ${receiverId} [${callType}] | session: ${session.sessionId}`);

        } catch (error) {
            console.error('Error in call-offer:', error);
            socket.emit('call-failed', { reason: 'server-error' });
        }
    });

    socket.on('accept-call', ({ toUserId }) => {
        const callerId = toUserId?.toString();
        const receiverId = user._id.toString();
        if (!callerId) return;

        const activeCall = activeCalls.get(callerId);
        if (!activeCall) return;

        // Thiết bị khác đã bắt rồi — dismiss thiết bị này
        if (activeCall.status !== 'calling') {
            socket.emit('call-answered-on-other-device', {
                conversationId: activeCall.conversationId,
            });
            return;
        }

        activeCall.status = 'connecting';
        activeCall.receiverSocketId = socket.id;
        markParticipant(activeCall, receiverId, { status: 'accepted', joinedAt: null });

        const callerTarget = getParticipantSocketTarget(activeCall, callerId);
        if (callerTarget) {
            io.to(callerTarget).emit('accept-call', {
                by: { _id: user._id, displayName: user.displayName },
                roomName: activeCall.roomName,
            });
        }

        // Dismiss tất cả thiết bị khác của receiver
        socket.to(`user:${receiverId}`).emit('call-answered-on-other-device', {
            conversationId: activeCall.conversationId,
        });
    });

    socket.on('call-answer', async ({ toUserId }) => {
        const callerId = toUserId?.toString();
        const receiverId = user._id.toString();

        try {
            if (!callerId) return;

            const activeCall = activeCalls.get(callerId);
            if (!activeCall) return;

            if (activeCall.status !== 'connecting' && activeCall.status !== 'calling') return;

            activeCall.receiverSocketId = socket.id;
            const callerTarget = getParticipantSocketTarget(activeCall, callerId);
            if (!callerTarget) return;

            activeCall.status = 'connecting';
            markParticipant(activeCall, receiverId, { status: 'accepted' });

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

            const latestCall = activeCalls.get(callerId);
            if (!latestCall || latestCall.sessionId !== activeCall.sessionId) return;

            latestCall.status = 'connecting';
            markParticipant(latestCall, callerId, { status: 'accepted' });
            markParticipant(latestCall, receiverId, { status: 'accepted' });

            // Token chỉ gửi đúng socket đang active (không broadcast)
            io.to(callerTarget).emit('call-answered', {
                token: callerToken,
                roomName: latestCall.roomName,
            });
            socket.emit('call-accepted', {
                token: receiverToken,
                roomName: latestCall.roomName,
            });

            console.log(`${user.displayName} accepted call from ${callerId}`);

        } catch (error) {
            console.error('Error in call-answer:', error);
            if (callerId) {
                try {
                    await finalizeAndNotifyCall({ toUserId: callerId, cancelled: true });
                } catch (finalizeError) {
                    console.error('Error cleaning up failed call-answer:', finalizeError);
                }
                socket.emit('call-failed', { reason: 'server-error' });
                const activeCall = activeCalls.get(callerId);
                const callerTarget = activeCall
                    ? getParticipantSocketTarget(activeCall, callerId)
                    : getReceiverSocketId(callerId);
                if (callerTarget) {
                    io.to(callerTarget).emit('call-failed', { reason: 'server-error' });
                }
            }
        }
    });

    socket.on('call-connected', ({ toUserId }) => {
        const myId = user._id.toString();
        const otherId = toUserId?.toString();
        if (!otherId) return;

        const activeCall = activeCalls.get(myId) || activeCalls.get(otherId);
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
    });

    socket.on('call-rejected', async ({ toUserId }) => {
        const callerId = toUserId.toString();
        const rejecterId = user._id.toString();

        try {
            const activeCall = activeCalls.get(callerId);
            if (activeCall) {
                markParticipant(activeCall, rejecterId, { status: 'declined' });
                await persistFinalizedDirectSession(io, activeCall, 'canceled');
                activeCalls.delete(callerId);
            }

            const payload = { by: { _id: user._id, displayName: user.displayName } };

            // Notify tất cả thiết bị của cả 2 bên để dismiss UI
            emitToUserRoom(callerId, 'call-rejected', payload);
            emitToUserRoom(rejecterId, 'call-rejected', payload);

            console.log(`${user.displayName} rejected call from ${callerId}`);

        } catch (error) {
            console.error('Error in call-rejected:', error);
        }
    });

    socket.on('call-ended', async ({ toUserId }) => {
        try {
            await finalizeAndNotifyCall({ toUserId, cancelled: false });
        } catch (error) {
            console.error('Error in call-ended:', error);
        }
    });

    socket.on('leave-call', async ({ toUserId }) => {
        try {
            await finalizeAndNotifyCall({ toUserId, cancelled: false });
        } catch (error) {
            console.error('Error in leave-call:', error);
        }
    });

    socket.on('call-cancelled', async ({ toUserId }) => {
        try {
            await finalizeAndNotifyCall({ toUserId, cancelled: true });
        } catch (error) {
            console.error('Error in call-cancelled:', error);
        }
    });

    socket.on('call-video-toggle', ({ toUserId, isVideoOff }) => {
        const myId = user._id.toString();
        const otherId = toUserId.toString();
        const activeCall = activeCalls.get(myId) || activeCalls.get(otherId);
        const otherTarget = activeCall
            ? getParticipantSocketTarget(activeCall, otherId)
            : getReceiverSocketId(otherId);

        if (otherTarget) {
            io.to(otherTarget).emit('call-video-toggle', { isVideoOff });
        }
    });
}

export async function handleCallDisconnect(userId, socketId, activeCalls, io, getReceiverSocketId) {
    let foundSession = null;
    for (const session of activeCalls.values()) {
        const isCallSocket = session.callerSocketId === socketId || session.receiverSocketId === socketId;
        const isLegacyParticipant = !session.callerSocketId
            && !session.receiverSocketId
            && (session.callerId === userId || session.receiverId === userId);

        if (isCallSocket || isLegacyParticipant) {
            foundSession = session;
            break;
        }
    }

    if (!foundSession) return;

    const otherId = foundSession.callerId === userId
        ? foundSession.receiverId
        : foundSession.callerId;

    const disconnectedParticipant = foundSession.participants.find(
        (p) => p.userId._id.toString() === userId.toString()
    );
    if (disconnectedParticipant && disconnectedParticipant.status === 'accepted') {
        disconnectedParticipant.status = 'left';
        disconnectedParticipant.leftAt = toIsoOrNull(new Date());
    }

    const overallStatus = foundSession.status === 'in-call' ? 'ended' : 'missed';
    await persistFinalizedDirectSession(io, foundSession, overallStatus);

    // Notify tất cả thiết bị của bên còn lại
    const otherTarget = getReceiverSocketId(otherId);
    if (otherTarget) {
        io.to(otherTarget).emit('call-ended');
    }

    activeCalls.delete(foundSession.callerId);
    console.log(`Call auto-ended: ${userId} disconnected`);
}
