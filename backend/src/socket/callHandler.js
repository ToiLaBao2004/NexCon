import Call from '../models/callModel.js';
import Friend from '../models/friendModel.js';
import BlockUser from '../models/blockUserModel.js';
import Conversation from '../models/conversationModel.js';
import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

// Sắp xếp cặp userId để query Friend (userA < userB)
const sortPair = (a, b) => (a < b ? [a, b] : [b, a]);

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

// Kiểm tra có bị block (1 trong 2 )
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
    });

    if (!conversation) {
        conversation = await Conversation.create({
            type: 'direct',
            participants: [
                { userId: userId1, joinedAt: new Date() },
                { userId: userId2, joinedAt: new Date() }
            ]
        });
    }

    return conversation;
}

// Cập nhật lastMessage cho Conversation từ thông tin cuộc gọi
async function updateConversationLastMessageWithCall(call, shouldCheckMissed = false) {
    try {
        const conversation = await Conversation.findById(call.conversationId);
        if (conversation) {
            const content = call.type === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
            conversation.lastMessage = {
                content: content,
                senderId: call.initiatorUser,
                createdAt: new Date()
            };

            // Reset seenBy khi có thông tin cuộc gọi mới (người gọi là người duy nhất đã 'xem' ban đầu)
            conversation.seenBy = [call.initiatorUser];

            // Nếu cuộc gọi đã có tương tác, thêm những người đó vào seenBy
            call.participants.forEach(p => {
                const pid = p.userId.toString();
                if (['accepted', 'declined', 'left'].includes(p.status)) {
                    if (!conversation.seenBy.map(id => id.toString()).includes(pid)) {
                        conversation.seenBy.push(p.userId);
                    }
                }
            });

            if (shouldCheckMissed) {
                // Tăng unreadCount cho những người có trạng thái 'missed' trong cuộc gọi này
                conversation.participants.forEach(p => {
                    const pid = p.userId.toString();
                    // Không bao giờ tăng unread cho chính người khởi tạo
                    if (pid === call.initiatorUser.toString()) return;

                    const callParticipant = call.participants.find(cp => cp.userId.toString() === pid);
                    if (callParticipant && callParticipant.status === 'missed') {
                        const prevCount = conversation.unreadCounts.get(pid) || 0;
                        conversation.unreadCounts.set(pid, prevCount + 1);
                    }
                });
            }

            await conversation.save();
        }
    } catch (error) {
        console.error("Error updating conversation lastMessage with call:", error);
    }
}

// Tạo call record trong DB
async function createCallRecord({ conversationId, initiatorId, receiverId, callType }) {
    const call = await Call.create({
        conversationId,
        initiatorUser: initiatorId,
        type: callType,
        participants: [
            { userId: initiatorId, status: 'ringing', joinedAt: null },
            { userId: receiverId, status: 'ringing', joinedAt: null }
        ],
        overallStatus: 'active'
    });

    // Cập nhật sidebar ngay khi cuộc gọi bắt đầu
    await updateConversationLastMessageWithCall(call);

    return call;
}

// Kết thúc cuộc gọi và tính duration
async function finalizeCallRecord(callId, overallStatus) {
    const call = await Call.findById(callId);
    if (!call || call.overallStatus === 'ended') return null;

    const now = new Date();
    call.endedAt = now;
    call.overallStatus = overallStatus;

    // Tính duration: từ startedAt (lúc accepted) đến endedAt
    if (call.startedAt) {
        call.duration = Math.round((now.getTime() - call.startedAt.getTime()) / 1000);
    }

    // Cập nhật trạng thái participants còn lại
    call.participants.forEach(p => {
        if (p.status === 'ringing') {
            // Nếu cuộc gọi kết thúc mà vẫn ringing → missed
            p.status = 'missed';
        }
        if (p.status === 'accepted') {
            p.status = 'left';
            p.leftAt = now;
        }
    });

    await call.save();

    // Cập nhật sidebar khi kết thúc (để refresh timestamp/status)
    // Tăng unreadCount nếu có ai bị 'missed'
    await updateConversationLastMessageWithCall(call, true);

    return call;
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

    // A gọi B — tạo call session và báo incoming-call
    socket.on("call-offer", async ({ toUserId, callType }) => {
        const callerId = user._id.toString();
        const receiverId = toUserId.toString();

        try {
            // 1. Không được tự gọi chính mình
            if (callerId === receiverId) {
                socket.emit("call-failed", { reason: "self-call" });
                return;
            }

            // 2. Kiểm tra block (2 chiều)
            const blocked = await isBlocked(callerId, receiverId);
            if (blocked) {
                socket.emit("call-failed", { reason: "blocked" });
                return;
            }

            // 3. Chỉ cho phép gọi nếu là bạn bè HOẶC đã có direct conversation
            const [friends, hasConversation] = await Promise.all([
                areFriends(callerId, receiverId),
                hasDirectConversation(callerId, receiverId)
            ]);
            if (!friends && !hasConversation) {
                socket.emit("call-failed", { reason: "not-friends" });
                return;
            }

            // 4. Kiểm tra B có online không
            const receiverSocketId = getReceiverSocketId(receiverId);
            if (!receiverSocketId) {
                // B offline → lưu cuộc gọi missed
                const conversation = await findOrCreateDirectConversation(callerId, receiverId);
                const call = await createCallRecord({
                    conversationId: conversation._id,
                    initiatorId: callerId,
                    receiverId,
                    callType
                });
                await finalizeCallRecord(call._id, 'missed');

                socket.emit("call-failed", { reason: "offline" });
                return;
            }

            // 5. Kiểm tra B có đang trong cuộc gọi khác không
            const isReceiverBusy = [...activeCalls.values()].some(
                (call) => call.receiverId === receiverId || call.callerId === receiverId
            );
            if (isReceiverBusy) {
                // B đang bận → lưu cuộc gọi missed
                const conversation = await findOrCreateDirectConversation(callerId, receiverId);
                const call = await createCallRecord({
                    conversationId: conversation._id,
                    initiatorId: callerId,
                    receiverId,
                    callType
                });
                await finalizeCallRecord(call._id, 'missed');

                socket.emit("call-failed", { reason: "busy" });
                return;
            }

            // 6. Kiểm tra A có đang trong cuộc gọi khác không
            const isCallerBusy = [...activeCalls.values()].some(
                (call) => call.callerId === callerId || call.receiverId === callerId
            );
            if (isCallerBusy) {
                socket.emit("call-failed", { reason: "already-in-call" });
                return;
            }

            // 7. Tạo conversation (nếu chưa có) và call record
            const conversation = await findOrCreateDirectConversation(callerId, receiverId);
            const call = await createCallRecord({
                conversationId: conversation._id,
                initiatorId: callerId,
                receiverId,
                callType
            });
            const roomName = `dm-call-${call._id.toString()}`;

            // 8. Đăng ký cuộc gọi đang chờ (in-memory)
            activeCalls.set(callerId, {
                callerId,
                receiverId,
                callId: call._id.toString(),
                conversationId: conversation._id.toString(),
                roomName,
                callerDisplayName: user.displayName,
                callerAvatarUrl: user.avatarUrl || null,
                status: "calling"
            });

            // 9. Gửi incoming-call cho B
            io.to(receiverSocketId).emit("incoming-call", {
                from: {
                    _id: user._id,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl,
                },
                callType,
                roomName,
                callId: call._id.toString(),
                conversationId: conversation._id.toString(),
            });

            console.log(`${user.displayName} is calling ${receiverId} [${callType}] | callId: ${call._id}`);

        } catch (error) {
            console.error("Error in call-offer:", error);
            socket.emit("call-failed", { reason: "server-error" });
        }
    });

    // B chấp nhận — phát token LiveKit cho cả 2 bên
    socket.on("call-answer", async ({ toUserId }) => {
        const callerId = toUserId.toString();
        const receiverId = user._id.toString();

        try {
            const callerSocketId = getReceiverSocketId(callerId);
            if (!callerSocketId) return;

            const activeCall = activeCalls.get(callerId);
            if (!activeCall) return;
            const roomName = activeCall.roomName || `dm-call-${activeCall.callId}`;

            // Cập nhật in-memory
            activeCalls.set(callerId, { ...activeCall, status: "in-call" });

            // Cập nhật DB: participant caller → accepted, receiver → accepted
            const now = new Date();
            const call = await Call.findById(activeCall.callId);
            if (call) {
                call.startedAt = now;
                call.participants.forEach(p => {
                    const pid = p.userId.toString();
                    if (pid === callerId || pid === receiverId) {
                        p.status = 'accepted';
                        p.joinedAt = now;
                    }
                });
                await call.save();
            }

            const callerToken = await generateLiveKitToken(
                roomName,
                callerId,
                activeCall.callerDisplayName || callerId,
                JSON.stringify({
                    displayName: activeCall.callerDisplayName || callerId,
                    avatarUrl: activeCall.callerAvatarUrl || null,
                })
            );

            const receiverToken = await generateLiveKitToken(
                roomName,
                receiverId,
                user.displayName,
                JSON.stringify({
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl || null,
                })
            );

            io.to(callerSocketId).emit("call-answered", {
                token: callerToken,
                roomName,
            });
            socket.emit("call-accepted", {
                token: receiverToken,
                roomName,
            });

            console.log(`${user.displayName} accepted call from ${callerId}`);

        } catch (error) {
            console.error("Error in call-answer:", error);
        }
    });

    // B từ chối cuộc gọi
    socket.on("call-rejected", async ({ toUserId }) => {
        const callerId = toUserId.toString();

        try {
            const activeCall = activeCalls.get(callerId);

            // Cập nhật DB: receiver → declined, overallStatus → canceled
            if (activeCall?.callId) {
                const call = await Call.findById(activeCall.callId);
                if (call) {
                    const now = new Date();
                    call.participants.forEach(p => {
                        const pid = p.userId.toString();
                        if (pid === user._id.toString()) {
                            p.status = 'declined';
                        }
                    });
                    await call.save();

                    // Dùng finalize để xử lý nốt overallStatus và các participant khác (người gọi)
                    await finalizeCallRecord(activeCall.callId, 'canceled');
                }
            }

            // Xóa in-memory
            activeCalls.delete(callerId);

            const callerSocketId = getReceiverSocketId(callerId);
            if (callerSocketId) {
                io.to(callerSocketId).emit("call-rejected", {
                    by: {
                        _id: user._id,
                        displayName: user.displayName,
                    }
                });
            }

            // Gửi ngược lại cho chính người từ chối để họ trigger refreshCallHistory
            const mySocketId = getReceiverSocketId(user._id.toString());
            if (mySocketId) {
                io.to(mySocketId).emit("call-rejected", {
                    by: {
                        _id: user._id,
                        displayName: user.displayName,
                    }
                });
            }

            console.log(`${user.displayName} rejected call from ${callerId}`);

        } catch (error) {
            console.error("Error in call-rejected:", error);
        }
    });

    // Một trong hai bên kết thúc cuộc gọi
    socket.on("call-ended", async ({ toUserId }) => {
        const myId = user._id.toString();
        const otherId = toUserId.toString();

        try {
            // Tìm activeCall (không biết ai là caller)
            const activeCall = activeCalls.get(myId) || activeCalls.get(otherId);

            if (activeCall?.callId) {
                // Nếu trạng thái là "calling" (chưa answer) → canceled (A hủy gọi)
                // Nếu trạng thái là "in-call" → ended (kết thúc bình thường)
                const overallStatus = activeCall.status === "in-call" ? "ended" : "canceled";
                await finalizeCallRecord(activeCall.callId, overallStatus);
            }

            // Xóa khỏi activeCalls
            activeCalls.delete(myId);
            activeCalls.delete(otherId);

            const otherSocketId = getReceiverSocketId(otherId);
            if (otherSocketId) {
                io.to(otherSocketId).emit("call-ended");
            }

            // Gửi ngược lại cho chính người vừa cúp máy để họ trigger refreshCallHistory
            const mySocketId = getReceiverSocketId(myId);
            if (mySocketId) {
                io.to(mySocketId).emit("call-ended");
            }

            console.log(`Call ended between ${myId} and ${otherId}`);

        } catch (error) {
            console.error("Error in call-ended:", error);
        }
    });
    // Một bên toggle camera — relay sang người còn lại
    socket.on("call-video-toggle", ({ toUserId, isVideoOff }) => {
        const otherSocketId = getReceiverSocketId(toUserId.toString());
        if (otherSocketId) {
            io.to(otherSocketId).emit("call-video-toggle", { isVideoOff });
        }
    });

}

// Xử lý disconnect liên quan đến call
export async function handleCallDisconnect(userId, activeCalls, io, getReceiverSocketId) {
    let foundCallerId = null;
    let otherId = null;

    for (const [callerId, call] of activeCalls.entries()) {
        if (call.callerId === userId) {
            foundCallerId = callerId;
            otherId = call.receiverId;
            break;
        } else if (call.receiverId === userId) {
            foundCallerId = callerId;
            otherId = call.callerId;
            break;
        }
    }

    if (foundCallerId) {
        const activeCall = activeCalls.get(foundCallerId);

        // Lưu vào DB trước khi dọn dẹp
        if (activeCall?.callId) {
            const overallStatus = activeCall.status === "in-call" ? "ended" : "missed";
            await finalizeCallRecord(activeCall.callId, overallStatus);
        }

        const otherSocketId = getReceiverSocketId(otherId);
        if (otherSocketId) {
            io.to(otherSocketId).emit("call-ended");
        }
        activeCalls.delete(foundCallerId);
        console.log(`Call auto-ended: ${userId} disconnected`);
    }
}
