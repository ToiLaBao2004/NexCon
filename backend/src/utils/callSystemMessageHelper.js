import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import { emitNewMessage } from './messageHelper.js';

const SEEN_STATUSES = new Set(['accepted', 'declined', 'left', 'joined']);
const MISSED_STATUSES = new Set(['missed', 'no-answer']);

function toIsoOrNull(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeParticipant(participant) {
    const userObj = participant?.userId || {};
    const userId = userObj?._id || userObj;

    return {
        userId: {
            _id: userId?.toString?.() || '',
            displayName: userObj?.displayName || participant?.displayName || 'Người dùng',
            avatarUrl: userObj?.avatarUrl ?? participant?.avatarUrl ?? null,
        },
        status: participant?.status || 'missed',
        joinedAt: toIsoOrNull(participant?.joinedAt),
        leftAt: toIsoOrNull(participant?.leftAt),
    };
}

function buildCallContent(callType, mode) {
    const base = callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
    return mode === 'group' ? `${base} nhóm` : base;
}

function applyCallConversationState(conversation, message, initiatorId, participants) {
    const initiatorIdStr = initiatorId.toString();

    if (!conversation.unreadCounts || typeof conversation.unreadCounts.get !== 'function') {
        conversation.unreadCounts = new Map();
    }

    conversation.set({
        lastMessage: {
            content: message.content,
            type: 'system',
            systemType: 'call',
            metadata: message.metadata,
            senderId: initiatorId,
            senderInfo: message.senderInfo,
            createdAt: message.createdAt,
        },
    });


    const seenUserIds = new Set([initiatorIdStr]);
    participants.forEach((participant) => {
        const pid = participant.userId?._id?.toString?.() || '';
        if (pid && SEEN_STATUSES.has(participant.status)) {
            seenUserIds.add(pid);
        }
    });

    const now = new Date();
    conversation.participants.forEach((participant) => {
        const memberId = (participant.userId?._id || participant.userId).toString();
        if (seenUserIds.has(memberId)) {
            participant.lastReadMessageId = message._id;
            participant.lastReadAt = now;
        }
    });
    conversation.markModified('participants');

    conversation.participants.forEach((participant) => {
        const memberId = (participant.userId?._id || participant.userId).toString();
        if (memberId === initiatorIdStr) {
            return;
        }

        const callParticipant = participants.find((item) => item.userId?._id?.toString?.() === memberId);
        if (!callParticipant || !MISSED_STATUSES.has(callParticipant.status)) {
            return;
        }

        const prevCount = conversation.unreadCounts.get(memberId) || 0;
        conversation.unreadCounts.set(memberId, prevCount + 1);
    });
}

export async function persistCallSystemMessage(io, {
    conversationId,
    callId,
    mode,
    callType,
    overallStatus,
    duration,
    startedAt,
    endedAt,
    initiator,
    participants,
}) {
    const sanitizedParticipants = Array.isArray(participants)
        ? participants.map(sanitizeParticipant)
        : [];

    const safeInitiatorId = initiator?._id?.toString?.() || '';
    const safeInitiator = {
        _id: safeInitiatorId,
        displayName: initiator?.displayName || 'Người dùng',
        avatarUrl: initiator?.avatarUrl ?? null,
    };

    const message = await Message.create({
        conversationId,
        senderId: safeInitiatorId,
        senderInfo: {
            displayName: safeInitiator.displayName,
            avatarUrl: safeInitiator.avatarUrl,
        },
        type: 'system',
        systemType: 'call',
        content: buildCallContent(callType, mode),
        metadata: {
            callId: callId?.toString?.() || `${conversationId}-${Date.now()}`,
            mode: mode === 'group' ? 'group' : 'direct',
            callType,
            overallStatus,
            duration: Number.isFinite(duration) ? duration : 0,
            startedAt: toIsoOrNull(startedAt),
            endedAt: toIsoOrNull(endedAt),
            initiatorUser: safeInitiator,
            participants: sanitizedParticipants,
        },
    });

    let maxRetries = 3;
    let saved = false;
    let updatedConversation = null;

    while (maxRetries > 0) {
        try {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                return message;
            }

            applyCallConversationState(conversation, message, safeInitiatorId, sanitizedParticipants);
            await conversation.save();
            
            updatedConversation = conversation;
            saved = true;
            break;
        } catch (error) {
            if (error.name === 'VersionError' && maxRetries > 1) {
                maxRetries--;
                await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
                continue;
            }
            console.error('Error saving conversation in persistCallSystemMessage:', error);
            break;
        }
    }

    if (saved && updatedConversation) {
        emitNewMessage(io, updatedConversation, message);
    }
    return message;
}
