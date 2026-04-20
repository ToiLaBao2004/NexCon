import Friend from '../models/friendModel.js';
import BlockUser from '../models/blockUserModel.js';
import Conversation from '../models/conversationModel.js';
import { AccessToken } from 'livekit-server-sdk';
import { persistCallSystemMessage } from '../utils/callSystemMessageHelper.js';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

// Sắp xếp cặp userId để query Friend (userA < userB)
const sortPair = (a, b) => (a < b ? [a, b] : [b, a]);

function buildSessionId(prefix = 'dm-call') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toIsoOrNull(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Kiểm tra 2 user có phải bạn bè không
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

// Kiểm tra có bị block (1 trong 2)
async function isBlocked(userId1, userId2) {
    const block = await BlockUser.findOne({
        $or: [
            { from: userId1, to: userId2 },
            { from: userId2, to: userId1 }
        ]
    }).lean();
    return !!block;
}

// Tìm hoặc tạo conversation direct giữa 2 user
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

function buildInitialDirectSession({ conversation, caller, receiverId, callType }) {
    const callerId = caller._id.toString();
    const receiver = conversation.participants.find(
        (participant) => participant.userId?._id?.toString() === receiverId.toString()
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
        (participant) => participant.userId._id.toString() === userId.toString()
    );
    if (target) {
        Object.assign(target, patch);
    }
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
    return participants.map((participant) => {
        if (participant.status === 'ringing') {
            return { ...participant, status: 'missed' };
        }

        if (participant.status === 'accepted') {
            return {
                ...participant,
                status: 'left',
                leftAt: participant.leftAt || endedAtIso,
            };
        }

        return participant;
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

// Đăng ký socket events liên quan đến Call
export function registerCallHandlers(socket, user, activeCalls, onlineUsers, io, getReceiverSocketId) {

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

            if (overallStatus !== 'ended') {
                notifyEvent = 'call-cancelled';
            }
        }

        const payload = {
            by: {
                _id: user._id,
                displayName: user.displayName,
            }
        };

        if (resolvedOtherId) {
            const otherSocketId = getReceiverSocketId(resolvedOtherId);
            if (otherSocketId) {
                io.to(otherSocketId).emit(notifyEvent, payload);
            }
        }

        const mySocketId = getReceiverSocketId(myId);
        if (mySocketId) {
            io.to(mySocketId).emit(notifyEvent, payload);
        }

        console.log(`Call ${notifyEvent} between ${myId} and ${resolvedOtherId || 'unknown'}`);
    }

    // A gọi B — tạo call session và báo incoming-call
    socket.on('call-offer', async ({ toUserId, callType }) => {
        const callerId = user._id.toString();
        const receiverId = toUserId.toString();

        try {
            // 1. Không được tự gọi chính mình
            if (callerId === receiverId) {
                socket.emit('call-failed', { reason: 'self-call' });
                return;
            }

            // 2. Kiểm tra block (2 chiều)
            const blocked = await isBlocked(callerId, receiverId);
            if (blocked) {
                socket.emit('call-failed', { reason: 'blocked' });
                return;
            }

            // 3. Chỉ cho phép gọi nếu là bạn bè HOẶC đã có direct conversation
            const [friends, hasConversation] = await Promise.all([
                areFriends(callerId, receiverId),
                hasDirectConversation(callerId, receiverId)
            ]);
            if (!friends && !hasConversation) {
                socket.emit('call-failed', { reason: 'not-friends' });
                return;
            }

            const conversation = await findOrCreateDirectConversation(callerId, receiverId);

            // 4. Kiểm tra B có online không
            const receiverSocketId = getReceiverSocketId(receiverId);
            if (!receiverSocketId) {
                await persistMissedDirectCall(io, {
                    conversation,
                    caller: user,
                    receiverId,
                    callType,
                });
                socket.emit('call-failed', { reason: 'offline' });
                return;
            }

            // 5. Kiểm tra B có đang trong cuộc gọi khác không
            const isReceiverBusy = [...activeCalls.values()].some(
                (call) => call.receiverId === receiverId || call.callerId === receiverId
            );
            if (isReceiverBusy) {
                await persistMissedDirectCall(io, {
                    conversation,
                    caller: user,
                    receiverId,
                    callType,
                });
                socket.emit('call-failed', { reason: 'busy' });
                return;
            }

            // 6. Kiểm tra A có đang trong cuộc gọi khác không
            const isCallerBusy = [...activeCalls.values()].some(
                (call) => call.callerId === callerId || call.receiverId === callerId
            );
            if (isCallerBusy) {
                socket.emit('call-failed', { reason: 'already-in-call' });
                return;
            }

            // 7. Tạo call session in-memory
            const session = buildInitialDirectSession({
                conversation,
                caller: user,
                receiverId,
                callType,
            });

            // 8. Đăng ký cuộc gọi đang chờ (in-memory)
            activeCalls.set(callerId, session);

            // 9. Gửi incoming-call cho B
            io.to(receiverSocketId).emit('incoming-call', {
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

    // B chấp nhận — phát token LiveKit cho cả 2 bên
    socket.on('accept-call', ({ toUserId }) => {
        const callerId = toUserId?.toString();
        const receiverId = user._id.toString();

        if (!callerId) return;

        const activeCall = activeCalls.get(callerId);
        if (!activeCall) return;

        activeCall.status = 'connecting';
        markParticipant(activeCall, receiverId, { status: 'accepted', joinedAt: null });

        const callerSocketId = getReceiverSocketId(callerId);
        if (callerSocketId) {
            io.to(callerSocketId).emit('accept-call', {
                by: {
                    _id: user._id,
                    displayName: user.displayName,
                },
                roomName: activeCall.roomName,
            });
        }
    });

    socket.on('call-answer', async ({ toUserId }) => {
        const callerId = toUserId?.toString();
        const receiverId = user._id.toString();

        try {
            if (!callerId) return;

            const callerSocketId = getReceiverSocketId(callerId);
            if (!callerSocketId) return;

            const activeCall = activeCalls.get(callerId);
            if (!activeCall) return;

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
            if (!latestCall || latestCall.sessionId !== activeCall.sessionId) {
                return;
            }

            latestCall.status = 'connecting';
            markParticipant(latestCall, callerId, { status: 'accepted' });
            markParticipant(latestCall, receiverId, { status: 'accepted' });

            io.to(callerSocketId).emit('call-answered', {
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
                const callerSocketId = getReceiverSocketId(callerId);
                if (callerSocketId) {
                    io.to(callerSocketId).emit('call-failed', { reason: 'server-error' });
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

    // B từ chối cuộc gọi
    socket.on('call-rejected', async ({ toUserId }) => {
        const callerId = toUserId.toString();

        try {
            const activeCall = activeCalls.get(callerId);
            if (activeCall) {
                markParticipant(activeCall, user._id.toString(), { status: 'declined' });
                await persistFinalizedDirectSession(io, activeCall, 'canceled');
                activeCalls.delete(callerId);
            }

            const callerSocketId = getReceiverSocketId(callerId);
            if (callerSocketId) {
                io.to(callerSocketId).emit('call-rejected', {
                    by: {
                        _id: user._id,
                        displayName: user.displayName,
                    }
                });
            }

            const mySocketId = getReceiverSocketId(user._id.toString());
            if (mySocketId) {
                io.to(mySocketId).emit('call-rejected', {
                    by: {
                        _id: user._id,
                        displayName: user.displayName,
                    }
                });
            }

            console.log(`${user.displayName} rejected call from ${callerId}`);

        } catch (error) {
            console.error('Error in call-rejected:', error);
        }
    });

    // Một trong hai bên kết thúc cuộc gọi
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

    // Một bên toggle camera — relay sang người còn lại
    socket.on('call-video-toggle', ({ toUserId, isVideoOff }) => {
        const otherSocketId = getReceiverSocketId(toUserId.toString());
        if (otherSocketId) {
            io.to(otherSocketId).emit('call-video-toggle', { isVideoOff });
        }
    });
}

// Xử lý disconnect liên quan đến call
export async function handleCallDisconnect(userId, activeCalls, io, getReceiverSocketId) {
    let foundSession = null;

    for (const session of activeCalls.values()) {
        if (session.callerId === userId || session.receiverId === userId) {
            foundSession = session;
            break;
        }
    }

    if (!foundSession) {
        return;
    }

    const otherId = foundSession.callerId === userId ? foundSession.receiverId : foundSession.callerId;
    const disconnectedParticipant = foundSession.participants.find(
        (participant) => participant.userId._id.toString() === userId.toString()
    );

    if (disconnectedParticipant && disconnectedParticipant.status === 'accepted') {
        disconnectedParticipant.status = 'left';
        disconnectedParticipant.leftAt = toIsoOrNull(new Date());
    }

    const overallStatus = foundSession.status === 'in-call' ? 'ended' : 'missed';
    await persistFinalizedDirectSession(io, foundSession, overallStatus);

    const otherSocketId = getReceiverSocketId(otherId);
    if (otherSocketId) {
        io.to(otherSocketId).emit('call-ended');
    }

    activeCalls.delete(foundSession.callerId);
    console.log(`Call auto-ended: ${userId} disconnected`);
}
