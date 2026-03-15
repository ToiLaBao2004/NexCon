import { AccessToken } from 'livekit-server-sdk';
import Call from '../models/callModel.js';
import Conversation from '../models/conversationModel.js';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

// conversationId → GroupCallInfo
const activeGroupCalls = new Map();

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
    for (const p of groupCall.participants.values()) {
        if (p.status === 'joined') n++;
    }
    return n;
}

async function endGroupCall(conversationId, io) {
    const gc = activeGroupCalls.get(conversationId);
    if (!gc) return;

    const now = new Date();
    const durationSec = gc.startedAt ? Math.round((now - gc.startedAt) / 1000) : 0;

    // Finalize MongoDB
    try {
        const call = await Call.findById(gc.callId);
        if (call) {
            call.overallStatus = 'ended';
            call.endedAt = now;
            call.duration = durationSec;
            for (const p of call.participants) {
                if (p.status === 'ringing') p.status = 'missed';
                else if (p.status === 'accepted') {
                    p.status = 'left';
                    p.leftAt = now;
                }
            }
            await call.save();

            // Update conversation lastMessage
            await updateConversationLastMessageWithCall(call);
        }
    } catch (err) {
        console.error('[GroupCall] endGroupCall DB error:', err);
    }

    // Notify room
    io.to(conversationId).emit('group-call:ended', {
        conversationId,
        callId: gc.callId,
        duration: durationSec,
        endedAt: now.toISOString(),
    });

    if (gc.ringTimeout) clearTimeout(gc.ringTimeout);
    activeGroupCalls.delete(conversationId);
}

async function checkAutoEnd(conversationId, io) {
    const gc = activeGroupCalls.get(conversationId);
    if (!gc) return;
    const joined = countJoined(gc);
    // No one left in the call
    if (joined === 0) {
        await endGroupCall(conversationId, io);
        return;
    }
    // Only 1 person left AND no one is still ringing
    let ringing = 0;
    for (const p of gc.participants.values()) {
        if (p.status === 'ringing') ringing++;
    }
    if (joined < 2 && ringing === 0) {
        await endGroupCall(conversationId, io);
    }
}

async function updateConversationLastMessageWithCall(call) {
    try {
        const conversation = await Conversation.findById(call.conversationId);
        if (!conversation) return;

        const content = call.type === 'video' ? 'Cuộc gọi video nhóm' : 'Cuộc gọi thoại nhóm';
        conversation.lastMessage = {
            content,
            senderId: call.initiatorUser,
            createdAt: new Date(),
        };
        conversation.seenBy = [call.initiatorUser];

        call.participants.forEach(p => {
            const pid = p.userId.toString();
            if (['accepted', 'declined', 'left'].includes(p.status)) {
                if (!conversation.seenBy.map(id => id.toString()).includes(pid)) {
                    conversation.seenBy.push(p.userId);
                }
            }
        });

        // Tăng unread cho missed
        conversation.participants.forEach(p => {
            const pid = p.userId.toString();
            if (pid === call.initiatorUser.toString()) return;
            const cp = call.participants.find(cp => cp.userId.toString() === pid);
            if (cp && cp.status === 'missed') {
                const prev = conversation.unreadCounts.get(pid) || 0;
                conversation.unreadCounts.set(pid, prev + 1);
            }
        });

        await conversation.save();
    } catch (err) {
        console.error('[GroupCall] updateConversationLastMessage error:', err);
    }
}

function registerGroupCallHandlers(socket, user, onlineUsers, io) {
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
            const isMember = conversation.participants.some(
                p => p.userId._id.toString() === userId
            );
            if (!isMember) {
                return socket.emit('group-call:error', { reason: 'not-a-member' });
            }

            // Already active?
            if (activeGroupCalls.has(conversationId)) {
                return socket.emit('group-call:error', { reason: 'already-active' });
            }

            // Create Call document
            const call = await Call.create({
                conversationId,
                initiatorUser: user._id,
                type: callType,
                participants: conversation.participants.map(p => ({
                    userId: p.userId._id,
                    status: p.userId._id.toString() === userId ? 'accepted' : 'ringing',
                    joinedAt: p.userId._id.toString() === userId ? new Date() : null,
                })),
                overallStatus: 'active',
                startedAt: new Date(),
            });

            // Build in-memory participants map
            const participantsMap = new Map();
            for (const p of conversation.participants) {
                const pid = p.userId._id.toString();
                participantsMap.set(pid, {
                    userId: pid,
                    displayName: p.userId.displayName,
                    avatarUrl: p.userId.avatarUrl || null,
                    status: pid === userId ? 'joined' : 'ringing',
                    joinedAt: pid === userId ? new Date().toISOString() : null,
                    leftAt: null,
                });
            }

            // Ring timeout (30s)
            const ringTimeout = setTimeout(async () => {
                const gc = activeGroupCalls.get(conversationId);
                if (!gc) return;
                let changed = false;
                for (const [pid, p] of gc.participants) {
                    if (p.status === 'ringing') {
                        p.status = 'no-answer';
                        changed = true;
                        // Update DB
                        await Call.updateOne(
                            { _id: gc.callId, 'participants.userId': pid },
                            { $set: { 'participants.$.status': 'missed' } }
                        ).catch(() => { });
                    }
                }
                if (changed) {
                    io.to(conversationId).emit('group-call:user-declined', {
                        conversationId,
                        userId: null, // timeout, not a specific user
                        participants: participantsArray(gc),
                    });
                    await checkAutoEnd(conversationId, io);
                }
            }, 30_000);

            const groupCallInfo = {
                callId: call._id.toString(),
                conversationId,
                initiatorId: userId,
                callType,
                startedAt: new Date(),
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
            const initiatorInfo = {
                _id: userId,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl || null,
            };

            // Emit to initiator
            socket.emit('group-call:started', {
                conversationId,
                callId: call._id.toString(),
                callType,
                token,
                initiator: initiatorInfo,
                groupName,
                participants: participantsArray(groupCallInfo),
            });

            // Emit to rest of group
            socket.to(conversationId).emit('group-call:incoming', {
                conversationId,
                callId: call._id.toString(),
                callType,
                initiator: initiatorInfo,
                groupName,
                participants: participantsArray(groupCallInfo),
            });

            console.log(`[GroupCall] ${user.displayName} started group call in ${conversationId}`);
        } catch (err) {
            console.error('[GroupCall] start error:', err);
            socket.emit('group-call:error', { reason: 'server-error' });
        }
    });

    // JOIN
    socket.on('group-call:join', async ({ conversationId }) => {
        try {
            const gc = activeGroupCalls.get(conversationId);
            if (!gc) {
                return socket.emit('group-call:error', { reason: 'call-not-found' });
            }

            // Check if user is in the participant map (member of group)
            if (!gc.participants.has(userId)) {
                return socket.emit('group-call:error', { reason: 'not-a-member' });
            }

            // Generate token
            const metadata = JSON.stringify({
                displayName: user.displayName,
                avatarUrl: user.avatarUrl || null,
            });
            const token = await generateToken(conversationId, userId, user.displayName, metadata);

            // Update in-memory
            const p = gc.participants.get(userId);
            p.status = 'joined';
            p.joinedAt = new Date().toISOString();
            p.leftAt = null;

            // Update DB
            await Call.updateOne(
                { _id: gc.callId, 'participants.userId': user._id },
                { $set: { 'participants.$.status': 'accepted', 'participants.$.joinedAt': new Date() } }
            ).catch(err => console.error('[GroupCall] join DB update error:', err));

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
                participants: participantsArray(gc),
            });

            console.log(`[GroupCall] ${user.displayName} joined group call in ${conversationId}`);
        } catch (err) {
            console.error('[GroupCall] join error:', err);
            socket.emit('group-call:error', { reason: 'server-error' });
        }
    });

    // DECLINE
    socket.on('group-call:decline', async ({ conversationId }) => {
        try {
            const gc = activeGroupCalls.get(conversationId);
            if (!gc) return;

            const p = gc.participants.get(userId);
            if (!p) return;

            p.status = 'declined';

            // Update DB
            await Call.updateOne(
                { _id: gc.callId, 'participants.userId': user._id },
                { $set: { 'participants.$.status': 'declined' } }
            ).catch(() => { });

            io.to(conversationId).emit('group-call:user-declined', {
                conversationId,
                userId,
                participants: participantsArray(gc),
            });

            await checkAutoEnd(conversationId, io);
        } catch (err) {
            console.error('[GroupCall] decline error:', err);
        }
    });

    // LEAVE
    socket.on('group-call:leave', async ({ conversationId }) => {
        try {
            const gc = activeGroupCalls.get(conversationId);
            if (!gc) return;

            const p = gc.participants.get(userId);
            if (!p) return;

            p.status = 'left';
            p.leftAt = new Date().toISOString();

            // Update DB
            await Call.updateOne(
                { _id: gc.callId, 'participants.userId': user._id },
                { $set: { 'participants.$.status': 'left', 'participants.$.leftAt': new Date() } }
            ).catch(() => { });

            io.to(conversationId).emit('group-call:user-left', {
                conversationId,
                userId,
                participants: participantsArray(gc),
            });

            await checkAutoEnd(conversationId, io);

            console.log(`[GroupCall] ${user.displayName} left group call in ${conversationId}`);
        } catch (err) {
            console.error('[GroupCall] leave error:', err);
        }
    });

    // STATUS
    socket.on('group-call:status', ({ conversationId }) => {
        const gc = activeGroupCalls.get(conversationId);
        if (gc) {
            socket.emit('group-call:status-response', {
                conversationId,
                active: true,
                callId: gc.callId,
                callType: gc.callType,
                initiatorId: gc.initiatorId,
                participants: participantsArray(gc),
                startedAt: gc.startedAt?.toISOString() ?? null,
            });
        } else {
            socket.emit('group-call:status-response', {
                conversationId,
                active: false,
            });
        }
    });
}

// disconnect handler

async function handleGroupCallDisconnect(userId, io) {
    for (const [conversationId, gc] of activeGroupCalls) {
        const p = gc.participants.get(userId);
        if (p && p.status === 'joined') {
            p.status = 'left';
            p.leftAt = new Date().toISOString();

            await Call.updateOne(
                { _id: gc.callId, 'participants.userId': userId },
                { $set: { 'participants.$.status': 'left', 'participants.$.leftAt': new Date() } }
            ).catch(() => { });

            io.to(conversationId).emit('group-call:user-left', {
                conversationId,
                userId,
                participants: participantsArray(gc),
            });

            await checkAutoEnd(conversationId, io);
        }
    }
}

export { registerGroupCallHandlers, handleGroupCallDisconnect };
