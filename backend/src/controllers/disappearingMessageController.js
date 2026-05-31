import mongoose from 'mongoose';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import { io } from '../socket/index.js';
import { createNotification } from '../services/notificationServices.js';
import {
    expireDueMessages,
    expireMessageById,
} from '../services/disappearingMessageService.js';
import { emitNewMessage, updateConversationLastMessage } from '../utils/messageHelper.js';
import {
    DEFAULT_DISAPPEARING_DURATION_SECONDS,
    buildDisappearingSetting,
    canManageDisappearingMessages,
    normalizeDisappearingDurationSeconds,
} from '../utils/disappearingMessages.js';

function isConversationMember(conversation, userId) {
    return Boolean(conversation?.participants?.some(
        (participant) => participant.userId.toString() === userId.toString()
    ));
}

function formatDuration(durationSeconds) {
    const presets = new Map([
        [60, '1 minute'],
        [300, '5 minutes'],
        [1800, '30 minutes'],
        [3600, '1 hour'],
        [21600, '6 hours'],
        [43200, '12 hours'],
        [86400, '24 hours'],
        [604800, '7 days'],
    ]);
    if (presets.has(durationSeconds)) return presets.get(durationSeconds);
    if (durationSeconds % 86400 === 0) return `${durationSeconds / 86400} days`;
    if (durationSeconds % 3600 === 0) return `${durationSeconds / 3600} hours`;
    return `${Math.ceil(durationSeconds / 60)} minutes`;
}

async function findMemberConversation(conversationId, userId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) return null;
    return Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId,
    });
}

export async function getDisappearingSetting(req, res) {
    try {
        const conversation = await findMemberConversation(req.params.conversationId, req.user._id);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        return res.status(200).json({
            setting: buildDisappearingSetting(conversation),
            canManage: canManageDisappearingMessages(conversation, req.user._id),
        });
    } catch (error) {
        console.error('Error fetching disappearing-message setting:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function updateDisappearingSetting(req, res) {
    try {
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ message: 'enabled must be a boolean.' });
        }

        const conversation = await findMemberConversation(req.params.conversationId, req.user._id);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }
        if (conversation.type === 'group' && conversation.disbanded === true) {
            return res.status(403).json({ message: 'This group has been disbanded.' });
        }
        if (!canManageDisappearingMessages(conversation, req.user._id)) {
            return res.status(403).json({
                message: 'Only the conversation initiator or a group admin can change disappearing messages.',
            });
        }

        let durationSeconds = conversation.disappearingDurationSeconds
            || DEFAULT_DISAPPEARING_DURATION_SECONDS;
        if (enabled) {
            try {
                durationSeconds = normalizeDisappearingDurationSeconds(
                    req.body.durationSeconds ?? durationSeconds
                );
            } catch (error) {
                return res.status(400).json({ message: error.message });
            }
        }

        const isUnchanged = conversation.disappearingEnabled === enabled
            && (!enabled || conversation.disappearingDurationSeconds === durationSeconds);
        if (isUnchanged) {
            return res.status(200).json({
                setting: buildDisappearingSetting(conversation),
                unchanged: true,
            });
        }

        conversation.disappearingEnabled = enabled;
        conversation.disappearingDurationSeconds = enabled ? durationSeconds : conversation.disappearingDurationSeconds;
        conversation.disappearingEnabledBy = req.user._id;
        conversation.disappearingEnabledAt = new Date();

        const pinnedCount = enabled
            ? await Message.countDocuments({
                conversationId: conversation._id,
                isPinned: true,
                isExpired: { $ne: true },
            })
            : 0;
        const warning = pinnedCount > 0
            ? `${pinnedCount} pinned message(s) will stay pinned. New disappearing messages cannot be pinned.`
            : null;

        const actorName = req.user.displayName || 'A participant';
        const systemMessage = await Message.create({
            conversationId: conversation._id,
            senderId: req.user._id,
            senderInfo: {
                displayName: req.user.displayName,
                avatarUrl: req.user.avatarUrl,
            },
            type: 'system',
            systemType: enabled
                ? 'disappearing_messages_enabled'
                : 'disappearing_messages_disabled',
            content: enabled
                ? `🕐 ${actorName} turned on disappearing messages. New messages will disappear after ${formatDuration(durationSeconds)}. Tap to change.`
                : `🕐 ${actorName} turned off disappearing messages. New messages will be kept.`,
            metadata: {
                actorId: req.user._id,
                actorName,
                enabled,
                durationSeconds: enabled ? durationSeconds : null,
            },
        });

        updateConversationLastMessage(conversation, systemMessage, req.user._id);
        await conversation.save();

        const setting = buildDisappearingSetting(conversation);
        io.to(conversation._id.toString()).emit('dm:disappearing-setting-updated', {
            conversationId: conversation._id.toString(),
            setting,
        });
        emitNewMessage(io, conversation, systemMessage);

        return res.status(200).json({
            setting,
            warning,
            systemMessage,
        });
    } catch (error) {
        console.error('Error updating disappearing-message setting:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function reportDisappearingScreenshot(req, res) {
    try {
        const conversation = await findMemberConversation(req.params.conversationId, req.user._id);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }
        if (conversation.disappearingEnabled !== true) {
            return res.status(409).json({ message: 'Disappearing messages are not enabled.' });
        }

        const actorName = req.user.displayName || 'A participant';
        const conversationId = conversation._id.toString();
        const payload = {
            conversationId,
            actorId: req.user._id.toString(),
            actorName,
            detectedAt: new Date().toISOString(),
        };

        io.to(conversationId).emit('dm:screenshot-detected', payload);

        await Promise.allSettled(
            conversation.participants
                .filter((participant) => participant.userId.toString() !== req.user._id.toString())
                .map((participant) => createNotification(
                    participant.userId,
                    'Screenshot detected',
                    `${actorName} took a screenshot in a disappearing-messages conversation.`,
                    `/chat?conversationId=${conversationId}`,
                    {
                        type: 'dm_screenshot',
                        actorId: req.user._id,
                        recipientId: participant.userId,
                        metadata: { conversationId },
                    },
                ))
        );

        return res.status(202).json({ accepted: true });
    } catch (error) {
        console.error('Error reporting disappearing-message screenshot:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function manuallyExpireMessage(req, res) {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.messageId)) {
            return res.status(400).json({ message: 'Invalid messageId.' });
        }

        const message = await expireMessageById(req.params.messageId, { force: true });
        if (!message) {
            return res.status(404).json({ message: 'Expirable message not found.' });
        }

        return res.status(200).json({ message });
    } catch (error) {
        console.error('Error manually expiring message:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function expireDisappearingBatch(_req, res) {
    try {
        const result = await expireDueMessages();
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error expiring disappearing-message batch:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
