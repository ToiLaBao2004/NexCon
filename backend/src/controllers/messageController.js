import mongoose from 'mongoose';
import Message from '../models/messageModel.js';
import Conversation from '../models/conversationModel.js';
import { emitNewMessage, updateConversationLastMessage, generateSignedUrl, replaceMentionTags } from '../utils/messageHelper.js';
import { io, getReceiverSocketId, emitToUser, joinUserSocketsToRoom } from '../socket/index.js';
import { normalizeVietnamese } from '../utils/vietnameseHelper.js';
import {
    uploadChatImageFromBuffer,
    uploadRawFileFromBuffer,
    uploadAudioFromBuffer,
    deleteCloudinaryResource,
    MAX_FILE_SIZE,
    MAX_IMAGE_SIZE,
} from '../middlewares/uploadMiddleware.js';
import { safeUpload } from '../utils/messageHelper.js';
import { v2 as cloudinary } from 'cloudinary';
import { moderateTextMessage } from '../services/moderation/moderationTextService.js';
import { moderateLinkMessage } from '../services/moderation/moderationLinkService.js';
import { fetchLinkPreview } from '../utils/linkPreview.js';
import { createNotification } from '../services/notificationServices.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { transcribeAudioFromBuffer } from '../services/audio/transcribeAudio.js';
import { moderateImageMessage } from '../services/moderation/imageModerationService.js';

const MAX_TEXT_MESSAGE_LENGTH = 1000;

const parseMentionPayload = (rawMentions) => {
    if (Array.isArray(rawMentions)) {
        return rawMentions;
    }

    if (rawMentions == null || rawMentions === '') {
        return [];
    }

    if (typeof rawMentions === 'string') {
        try {
            const parsed = JSON.parse(rawMentions);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            const error = new Error('mentions must be a JSON array.');
            error.statusCode = 400;
            throw error;
        }
    }

    return [];
};

const parseMessageMetadata = (rawMetadata) => {
    if (!rawMetadata) {
        return {};
    }

    if (typeof rawMetadata !== 'string') {
        return {};
    }

    try {
        const parsed = JSON.parse(rawMetadata);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        const metadata = {};
        const clientBatchId = String(parsed.clientBatchId || '').trim();
        const clientBatchIndex = Number(parsed.clientBatchIndex);
        const clientBatchSize = Number(parsed.clientBatchSize);

        if (clientBatchId) {
            metadata.clientBatchId = clientBatchId.slice(0, 120);
        }
        if (Number.isInteger(clientBatchIndex) && clientBatchIndex >= 0) {
            metadata.clientBatchIndex = clientBatchIndex;
        }
        if (Number.isInteger(clientBatchSize) && clientBatchSize > 1 && clientBatchSize <= 10) {
            metadata.clientBatchSize = clientBatchSize;
        }

        return metadata;
    } catch {
        const error = new Error('metadata must be a valid JSON object.');
        error.statusCode = 400;
        throw error;
    }
};

const parseForwardBatch = (rawBatch) => {
    if (!rawBatch || typeof rawBatch !== 'object') {
        return null;
    }

    const batch = {};
    const clientBatchId = String(rawBatch.clientBatchId || '').trim();
    const clientBatchIndex = Number(rawBatch.clientBatchIndex);
    const clientBatchSize = Number(rawBatch.clientBatchSize);

    if (clientBatchId) {
        batch.clientBatchId = clientBatchId.slice(0, 120);
    }
    if (Number.isInteger(clientBatchIndex) && clientBatchIndex >= 0) {
        batch.clientBatchIndex = clientBatchIndex;
    }
    if (Number.isInteger(clientBatchSize) && clientBatchSize > 1 && clientBatchSize <= 10) {
        batch.clientBatchSize = clientBatchSize;
    }

    if (!batch.clientBatchId || !batch.clientBatchSize) {
        return null;
    }

    return batch;
};

const normalizeMentionEntry = (mention) => {
    const userId = String(mention?.userId || '').trim();
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return null;
    }

    return {
        userId,
        displayName: typeof mention?.displayName === 'string' ? mention.displayName.trim().slice(0, 120) : '',
        offset: Number.isFinite(Number(mention?.offset)) ? Math.max(0, Math.trunc(Number(mention.offset))) : 0,
        length: Number.isFinite(Number(mention?.length)) ? Math.max(0, Math.trunc(Number(mention.length))) : 0,
    };
};

const buildValidMentions = (conversation, rawMentions) => {
    const participants = new Set(
        (conversation?.participants || []).map((participant) => participant.userId.toString())
    );
    const seen = new Set();
    const mentions = [];

    for (const mention of rawMentions) {
        const normalized = normalizeMentionEntry(mention);
        if (!normalized) {
            continue;
        }

        if (!participants.has(normalized.userId) || seen.has(normalized.userId)) {
            continue;
        }

        seen.add(normalized.userId);
        mentions.push({
            ...normalized,
            userId: new mongoose.Types.ObjectId(normalized.userId),
        });
    }

    return mentions;
};

const saveConversationForNewMessage = async ({ conversationId, message, senderId, mentions = [] }) => {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            const error = new Error('Conversation not found.');
            error.statusCode = 404;
            throw error;
        }

        if (Array.isArray(mentions) && mentions.length > 0) {
            const mentionedUserIds = new Set(
                mentions
                    .map((mention) => mention.userId.toString())
                    .filter((mentionUserId) => mentionUserId !== senderId.toString())
            );

            if (mentionedUserIds.size > 0) {
                conversation.participants.forEach((participant) => {
                    const participantId = participant.userId.toString();
                    if (mentionedUserIds.has(participantId)) {
                        participant.unreadMentionCount = (participant.unreadMentionCount || 0) + 1;
                    }
                });
                conversation.markModified('participants');
            }
        }

        updateConversationLastMessage(conversation, message, senderId);

        try {
            await conversation.save();
            return conversation;
        } catch (error) {
            if (error?.name === 'VersionError' && attempt < maxAttempts) {
                continue;
            }
            throw error;
        }
    }

    const error = new Error('Could not update conversation after sending message.');
    error.statusCode = 409;
    throw error;
};

export async function sendMessage(req, res) {
    try {
        const senderId = req.user._id;
        const { type = 'text', recipientId, content, replyTo } = req.body;
        const uploadedFile = req.file;
        const rawMentions = parseMentionPayload(req.body.mentions);
        const metadata = parseMessageMetadata(req.body.metadata);

        let conversation = req.conversation;
        let createdDirectConversation = false;

        if (!conversation && req.messageTarget === 'direct') {
            if (!recipientId) {
                return res.status(400).json({ message: 'recipientId is required for direct messages.' });
            }
            conversation = await Conversation.create({
                type: 'direct',
                participants: [
                    { userId: senderId, joinedAt: new Date() },
                    { userId: recipientId, joinedAt: new Date() },
                ],
            });
            createdDirectConversation = true;
        }

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        const mentions = buildValidMentions(conversation, rawMentions);

        const messageData = {
            conversationId: conversation._id,
            senderId,
            senderInfo: {
                displayName: req.user.displayName,
                avatarUrl: req.user.avatarUrl
            },
            type,
            mentions,
        };

        if (Object.keys(metadata).length > 0) {
            messageData.metadata = metadata;
        }

        switch (type) {
            case 'text': {
                if (!content || !content.trim()) {
                    return res.status(400).json({ message: 'Content is required for text messages.' });
                }

                const trimmedContent = content.trim();
                if (trimmedContent.length > MAX_TEXT_MESSAGE_LENGTH) {
                    return res.status(400).json({ message: `Tin nhắn không được vượt quá ${MAX_TEXT_MESSAGE_LENGTH} ký tự.` });
                }

                const moderationResult = await moderateTextMessage(trimmedContent);

                if (moderationResult.blocked) {
                    return res.status(400).json({
                        message: 'Tin nhắn vi phạm tiêu chuẩn cộng đồng.',
                        moderation: {
                            category: moderationResult.category,
                            reason: moderationResult.reason,
                            source: moderationResult.source,
                            confidence: moderationResult.confidence ?? null,
                        },
                    });
                }

                messageData.content = trimmedContent;
                break;
            }

            case 'link': {
                if (!content || !content.trim()) {
                    return res.status(400).json({ message: 'URL is required for link messages.' });
                }

                const trimmedLink = content.trim();
                const moderationResult = await moderateLinkMessage(trimmedLink);

                if (moderationResult.blocked) {
                    return res.status(400).json({
                        message: 'Link vi phạm tiêu chuẩn cộng đồng.',
                        moderation: {
                            category: moderationResult.category,
                            reason: moderationResult.reason,
                            source: moderationResult.source,
                            confidence: moderationResult.confidence ?? null,
                        },
                    });
                }

                let normalizedUrl = trimmedLink;
                try {
                    normalizedUrl = new URL(trimmedLink).toString();
                } catch {
                    normalizedUrl = new URL(`https://${trimmedLink}`).toString();
                }

                messageData.content = normalizedUrl;

                const preview = await fetchLinkPreview(normalizedUrl);
                messageData.metadata = {
                    ...(messageData.metadata || {}),
                    linkPreview: preview,
                };

                break;
            }

            case 'image': {
                if (!uploadedFile) {
                    return res.status(400).json({ message: 'Image file is required.' });
                }
                if (!uploadedFile.mimetype.startsWith('image/')) {
                    return res.status(400).json({ message: 'Uploaded file is not an image.' });
                }
                if (uploadedFile.size > MAX_IMAGE_SIZE) {
                    return res.status(413).json({
                        message: `Ảnh quá lớn. Kích thước tối đa là ${MAX_IMAGE_SIZE / 1024 / 1024}MB.`,
                    });
                }

                const imageBuffer = uploadedFile.buffer;
                const mimeType = uploadedFile.mimetype;

                const moderationResult = await moderateImageMessage(imageBuffer, mimeType);

                if (moderationResult.blocked) {
                    return res.status(400).json({
                        message: 'Ảnh vi phạm tiêu chuẩn cộng đồng.',
                        moderation: {
                            category: moderationResult.category,
                            reason: moderationResult.reason,
                            source: moderationResult.source,
                            confidence: moderationResult.confidence ?? null,
                        },
                    });
                }

                const result = await safeUpload(uploadChatImageFromBuffer, uploadedFile.buffer);
                messageData.filePublicId = result.public_id;
                messageData.fileName = uploadedFile.originalname;
                messageData.fileSize = uploadedFile.size;
                messageData.mimeType = uploadedFile.mimetype;
                if (content?.trim()) messageData.content = content.trim();
                break;
            }

            case 'file': {
                if (!uploadedFile) {
                    return res.status(400).json({ message: 'File is required.' });
                }
                if (uploadedFile.size > MAX_FILE_SIZE) {
                    return res.status(413).json({
                        message: `File quá lớn. Kích thước tối đa là ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
                    });
                }

                const result = await safeUpload(
                    uploadRawFileFromBuffer,
                    uploadedFile.buffer,
                    uploadedFile.originalname
                );
                messageData.filePublicId = result.public_id;
                messageData.fileName = uploadedFile.originalname;
                messageData.fileSize = uploadedFile.size;
                messageData.mimeType = uploadedFile.mimetype;
                if (content?.trim()) messageData.content = content.trim();
                break;
            }

            case 'audio': {
                if (!uploadedFile) {
                    return res.status(400).json({
                        message: 'Audio file is required.',
                    });
                }

                if (uploadedFile.mimetype !== 'audio/webm') {
                    return res.status(400).json({
                        message: 'Chỉ hỗ trợ định dạng audio/webm.',
                    });
                }

                if (uploadedFile.size > MAX_FILE_SIZE) {
                    return res.status(413).json({
                        message: `File quá lớn. Kích thước tối đa là ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
                    });
                }

                const transcript = await transcribeAudioFromBuffer(
                    uploadedFile.buffer,
                    uploadedFile.originalname || 'voice_message.webm',
                    uploadedFile.mimetype || 'audio/webm'
                );

                const cleanTranscript = transcript;

                if (!cleanTranscript) {
                    return res.status(400).json({
                        message: 'Không thể chuyển audio thành văn bản để kiểm duyệt.',
                    });
                }

                const moderationResult = await moderateTextMessage(cleanTranscript);

                if (moderationResult.blocked) {
                    return res.status(400).json({
                        message: 'Tin nhắn vi phạm tiêu chuẩn cộng đồng.',
                        moderation: {
                            category: moderationResult.category,
                            reason: moderationResult.reason,
                            source: moderationResult.source,
                            confidence: moderationResult.confidence ?? null,
                        },
                    });
                }

                const result = await safeUpload(
                    uploadAudioFromBuffer,
                    uploadedFile.buffer,
                    uploadedFile.originalname || 'voice_message.webm'
                );

                messageData.filePublicId = result.public_id;
                messageData.fileName = uploadedFile.originalname || 'voice_message.webm';
                messageData.fileSize = uploadedFile.size;
                messageData.mimeType = uploadedFile.mimetype;
                messageData.content = cleanTranscript;

                break;
            }

            case 'sticker': {
                if (!content || !content.trim()) {
                    return res.status(400).json({ message: 'Sticker URL is required.' });
                }
                messageData.content = content.trim();
                break;
            }

            default:
                return res.status(400).json({ message: `Unsupported message type: ${type}` });
        }

        if (replyTo) {
            const repliedMessage = await Message.findById(replyTo);
            if (!repliedMessage || repliedMessage.conversationId.toString() !== conversation._id.toString()) {
                return res.status(400).json({ message: 'Tin nhắn trả lời không hợp lệ.' });
            }
            messageData.replyTo = replyTo;
        }

        let message = await Message.create(messageData);

        if (message.replyTo) {
            message = await message.populate({
                path: 'replyTo',
                select: '_id senderId type content fileName isRecalled',
                populate: { path: 'senderId', select: 'displayName' },
            });
        }

        conversation = await saveConversationForNewMessage({
            conversationId: conversation._id,
            message,
            senderId,
            mentions,
        });

        if (createdDirectConversation) {
            const populatedConversation = await Conversation.findById(conversation._id).populate({
                path: 'participants.userId',
                select: 'displayName avatarUrl nickname email bio phone status lastSeen',
            });

            for (const participant of conversation.participants) {
                const participantId = (participant.userId._id || participant.userId).toString();
                joinUserSocketsToRoom(participantId, conversation._id.toString());
                emitToUser(participantId, 'new-conversation', {
                    conversation: populatedConversation || conversation,
                });
            }

            conversation = populatedConversation || conversation;
        }

        const signedUrl = generateSignedUrl(message.filePublicId, message.type);
        emitNewMessage(io, conversation, message, signedUrl);

        if (Array.isArray(message.mentions) && message.mentions.length > 0) {
            const cleanContent = replaceMentionTags(message.content, message.mentions);
            const preview = cleanContent?.substring(0, 100) ?? '';
            const conversationUrl = `${process.env.FRONTEND_URL}/chat?conversationId=${conversation._id}&messageId=${message._id}`;
            const mentionTargets = new Set();

            for (const mention of message.mentions) {
                const mentionUserId = mention.userId.toString();
                if (mentionUserId === senderId.toString() || mentionTargets.has(mentionUserId)) {
                    continue;
                }

                mentionTargets.add(mentionUserId);

                const delivered = emitToUser(mentionUserId, 'user_mentioned', {
                    messageId: message._id,
                    conversationId: message.conversationId,
                    mentionedBy: {
                        userId: senderId,
                        displayName: req.user.displayName,
                        avatarUrl: req.user.avatarUrl,
                    },
                    preview,
                    createdAt: message.createdAt,
                });

                if (!delivered) {
                    await createNotification(
                        mention.userId,
                        'Bạn được nhắc đến',
                        `${req.user.displayName}${preview ? `: "${preview}"` : ''}`,
                        conversationUrl,
                        {
                            type: 'mention',
                            targetId: message._id,
                            actorId: senderId,
                            recipientId: mention.userId,
                            metadata: {
                                conversationId: conversation._id.toString(),
                                preview,
                            },
                        }
                    );

                    try {
                        await sendPushToUser(mentionUserId, {
                            title: 'Bạn được nhắc đến',
                            body: `${req.user.displayName}${preview ? `: ${preview}` : ''}`,
                            url: conversationUrl,
                        });
                    } catch (pushError) {
                        console.error('Error sending mention push notification:', pushError);
                    }
                }
            }
        }

        return res.status(201).json({ message, signedUrl });
    } catch (error) {
        console.error('Error sending message:', error);
        const statusCode = error.statusCode ?? 500;
        const message = statusCode !== 500 ? error.message : 'Internal server error.';
        return res.status(statusCode).json({ message });
    }
}

export async function createReminderSystemMessage(req, res) {
    try {
        const senderId = req.user._id;
        const { reminderId, reminderContent, remindAt } = req.body;
        const conversation = req.conversation;

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        const normalizedReminderId = String(reminderId || '').trim();
        const normalizedReminderContent = String(reminderContent || '').trim();
        const normalizedRemindAt = String(remindAt || '').trim();

        const metadata = {
            visibleToUserIds: [senderId.toString()],
            ...(normalizedReminderId ? { reminderId: normalizedReminderId } : {}),
            ...(normalizedReminderContent ? { reminderContent: normalizedReminderContent } : {}),
            ...(normalizedRemindAt ? { remindAt: normalizedRemindAt } : {}),
        };

        const messageData = {
            conversationId: conversation._id,
            senderId,
            senderInfo: {
                displayName: req.user.displayName,
                avatarUrl: req.user.avatarUrl,
            },
            type: 'system',
            systemType: 'reminder_created_local',
            content: 'Bạn đã tạo nhắc hẹn mới',
            metadata,
        };

        const message = await Message.create(messageData);

        updateConversationLastMessage(conversation, message, senderId);
        await conversation.save();

        const payloadMessage = typeof message.toObject === 'function' ? message.toObject() : { ...message };
        if (payloadMessage.metadata instanceof Map) {
            payloadMessage.metadata = Object.fromEntries(payloadMessage.metadata);
        }

        const lastMsgRaw = conversation.lastMessage?.toObject?.() || conversation.lastMessage;
        const lastMsgPayload = { ...lastMsgRaw };
        if (lastMsgPayload?.metadata instanceof Map) {
            lastMsgPayload.metadata = Object.fromEntries(lastMsgPayload.metadata);
        }

        const payload = {
            message: payloadMessage,
            conversation: {
                _id: conversation._id,
                lastMessage: lastMsgPayload,
                lastMessageAt: conversation.lastMessage?.createdAt || conversation.updatedAt,
            },
            unreadCounts: conversation.unreadCounts,
        };

        emitToUser(senderId.toString(), 'new-message', payload);

        return res.status(201).json(payload);
    } catch (error) {
        console.error('Error creating reminder system message:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function recallMessage(req, res) {
    try {
        const { messageId } = req.body;
        const senderId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn.' });
        }
        if (message.senderId.toString() !== senderId.toString()) {
            return res.status(403).json({ message: 'Bạn chỉ có thể thu hồi tin nhắn của chính mình.' });
        }
        if (message.isRecalled) {
            return res.status(400).json({ message: 'Tin nhắn đã được thu hồi.' });
        }
        if (message.createdAt.getTime() < Date.now() - 60 * 60 * 1000) {
            return res.status(400).json({ message: 'Bạn chỉ có thể thu hồi tin nhắn trong vòng 1 giờ.' });
        }

        const conversation = await Conversation.findById(message.conversationId);

        const lastMsg = conversation.lastMessage;
        if (
            lastMsg?.createdAt &&
            lastMsg.createdAt.getTime() === message.createdAt.getTime()
        ) {
            const recalledContent = 'Tin nhắn này đã được thu hồi';
            updateConversationLastMessage(
                conversation,
                { ...message.toObject(), content: recalledContent, createdAt: new Date() },
                senderId
            );
            await conversation.save();
        }

        if (message.filePublicId) {
            try {
                const resourceType = message.type === 'audio' || message.type === 'file' ? 'raw' : 'image';
                await deleteCloudinaryResource(message.filePublicId, resourceType, 'authenticated');
            } catch (cloudErr) {
                console.warn('Cloudinary delete warning:', cloudErr?.message);
            }
        }

        const wasPin = message.isPinned;
        message.isRecalled = true;
        message.filePublicId = undefined;
        if (message.isPinned) {
            message.isPinned = false;
            message.pinnedAt = null;
        }
        await message.save();

        const conversationRoom = message.conversationId.toString();

        io.to(conversationRoom).emit('recall-message', {
            conversationId: conversationRoom,
            messageId: message._id.toString(),
            content: 'Tin nhắn này đã được thu hồi',
            isRecalled: true,
        });

        if (wasPin) {
            io.to(conversationRoom).emit('pin-message', {
                conversationId: conversationRoom,
                pinnedMessageId: null,
                unpinnedMessageId: message._id.toString(),
                isPinned: false,
                pinnedAt: null,
            });
        }

        return res.status(200).json({ success: true, message: 'Message recalled successfully.' });
    } catch (error) {
        console.error('Error recalling message:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function pinMessage(req, res) {
    try {
        const { messageId } = req.body;

        const message = req.message || await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn.' });
        }

        const conversation = req.conversation || await Conversation.findById(message.conversationId);
        if (!conversation) {
            return res.status(404).json({ message: 'Không tìm thấy cuộc trò chuyện.' });
        }

        const senderInfo = {
            displayName: req.user.displayName,
            avatarUrl: req.user.avatarUrl,
        };
        const actionByName = req.user.displayName || 'Một thành viên';
        const conversationRoom = conversation._id.toString();

        // Nếu đã ghim thì bỏ ghim
        if (message.isPinned) {
            message.isPinned = false;
            message.pinnedAt = null;
            await message.save();

            const payload = {
                conversationId: conversationRoom,
                pinnedMessageId: null,
                unpinnedMessageId: message._id.toString(),
                isPinned: false,
                pinnedAt: null,
            };

            io.to(conversationRoom).emit('pin-message', payload);

            const systemMessage = await Message.create({
                conversationId: conversation._id,
                senderId: req.user._id,
                senderInfo,
                type: 'system',
                systemType: 'message_unpinned',
                content: `${actionByName} đã bỏ ghim một tin nhắn`,
                metadata: {
                    actionBy: req.user._id,
                    actionByName,
                    targetMessageId: message._id,
                    targetMessageType: message.type,
                },
            });

            updateConversationLastMessage(conversation, systemMessage, req.user._id);
            await conversation.save();
            emitNewMessage(io, conversation, systemMessage);

            return res.status(200).json({
                message: 'Bỏ ghim tin nhắn thành công.',
                data: payload,
            });
        }

        // Giới hạn tối đa 3 tin nhắn ghim — bỏ ghim tin cũ nhất nếu vượt
        const pinnedMessages = await Message.find({
            conversationId: conversation._id,
            isPinned: true,
        }).sort({ pinnedAt: 1, createdAt: 1 });

        let unpinnedMessageId = null;

        if (pinnedMessages.length >= 3) {
            const oldest = pinnedMessages[0];
            oldest.isPinned = false;
            oldest.pinnedAt = null;
            await oldest.save();
            unpinnedMessageId = oldest._id.toString();
        }

        message.isPinned = true;
        message.pinnedAt = new Date();
        await message.save();

        const payload = {
            conversationId: conversationRoom,
            pinnedMessageId: message._id.toString(),
            unpinnedMessageId,
            isPinned: true,
            pinnedAt: message.pinnedAt,
        };

        io.to(conversationRoom).emit('pin-message', payload);

        const systemMessage = await Message.create({
            conversationId: conversation._id,
            senderId: req.user._id,
            senderInfo,
            type: 'system',
            systemType: 'message_pinned',
            content: `${actionByName} đã ghim một tin nhắn`,
            metadata: {
                actionBy: req.user._id,
                actionByName,
                targetMessageId: message._id,
                targetMessageType: message.type,
            },
        });

        updateConversationLastMessage(conversation, systemMessage, req.user._id);
        await conversation.save();
        emitNewMessage(io, conversation, systemMessage);

        return res.status(200).json({
            message: 'Ghim tin nhắn thành công.',
            data: payload,
        });
    } catch (error) {
        console.error('Error pinning message:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function searchMessages(req, res) {
    try {
        const { conversationId, senderId, fromDate, toDate } = req.query;
        const q = req.query.keyword || req.query.q;
        const userId = req.user._id.toString();

        if (!q || !q.trim()) {
            return res.status(400).json({ message: 'ChÆ°a nháº­p tá»« khÃ³a tÃ¬m kiáº¿m.' });
        }

        if (!conversationId) {
            return res.status(400).json({ message: 'Thiáº¿u conversationId.' });
        }

        // Build base filter
        const filter = {
            conversationId,
            searchContent: { $regex: normalizeVietnamese(q), $options: 'i' },
            isRecalled: { $ne: true },
            $or: [
                { 'metadata.visibleToUserIds': { $exists: false } },
                { 'metadata.visibleToUserIds': { $size: 0 } },
                { 'metadata.visibleToUserIds': userId },
            ],
        };

        // Optional: filter by sender
        if (senderId) {
            filter.senderId = senderId;
        }

        // Optional: filter by date range
        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) {
                // Include the entire toDate day (set to end of day)
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        const messages = await Message.find(filter)
            .sort({ createdAt: -1 })
            .populate('senderId', 'displayName avatarUrl')
            .populate({
                path: 'replyTo',
                select: '_id senderId type content fileName isRecalled',
                populate: { path: 'senderId', select: 'displayName' },
            })
            .lean();

        return res.status(200).json({ messages });
    } catch (error) {
        console.error('Error searching messages:', error);
        return res.status(500).json({ message: 'Lá»—i mÃ¡y chá»§ ná»™i bá»™.' });
    }
}

export async function getMentionMessages(req, res) {
    try {
        const userId = req.user._id.toString();
        const { before, limit = 20 } = req.query;
        const limitNumber = Math.max(1, Math.min(100, Number(limit) || 20));

        const accessibleConversations = await Conversation.find({ 'participants.userId': userId })
            .select('_id')
            .lean();

        const conversationIds = accessibleConversations.map((conversation) => conversation._id);

        if (!conversationIds.length) {
            return res.status(200).json({ data: [], nextCursor: null });
        }

        const query = {
            conversationId: { $in: conversationIds },
            'mentions.userId': userId,
        };

        if (before) {
            let beforeDate = null;
            let beforeId = null;

            if (mongoose.Types.ObjectId.isValid(before)) {
                const cursorMessage = await Message.findById(before).select('_id createdAt').lean();
                if (cursorMessage?.createdAt) {
                    beforeDate = cursorMessage.createdAt;
                    beforeId = cursorMessage._id;
                }
            }

            if (!beforeDate) {
                const parsedDate = new Date(before);
                if (!Number.isNaN(parsedDate.getTime())) {
                    beforeDate = parsedDate;
                }
            }

            if (beforeDate) {
                if (beforeId) {
                    query.$or = [
                        { createdAt: { $lt: beforeDate } },
                        { createdAt: beforeDate, _id: { $lt: beforeId } },
                    ];
                } else {
                    query.createdAt = { $lt: beforeDate };
                }
            }
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limitNumber + 1)
            .populate('conversationId', 'type group.name group.avatarUrl')
            .populate('senderId', 'displayName avatarUrl')
            .lean();

        const hasMore = messages.length > limitNumber;
        const items = hasMore ? messages.slice(0, limitNumber) : messages;
        const nextCursor = hasMore ? items[items.length - 1]?._id?.toString() || null : null;

        return res.status(200).json({
            data: items.map((message) => ({
                _id: message._id,
                content: replaceMentionTags(message.content, message.mentions) || '',
                createdAt: message.createdAt,
                conversation: {
                    _id: message.conversationId?._id,
                    name: message.conversationId?.group?.name || null,
                    type: message.conversationId?.type || null,
                    avatarUrl: message.conversationId?.group?.avatarUrl || null,
                },
                sender: message.senderId
                    ? {
                        _id: message.senderId._id,
                        displayName: message.senderId.displayName || message.senderInfo?.displayName || 'Người dùng đã xóa',
                        avatarUrl: message.senderId.avatarUrl || message.senderInfo?.avatarUrl || null,
                    }
                    : {
                        _id: null,
                        displayName: message.senderInfo?.displayName || 'Người dùng đã xóa',
                        avatarUrl: message.senderInfo?.avatarUrl || null,
                    },
                mentions: message.mentions || [],
            })),
            nextCursor,
        });
    } catch (error) {
        console.error('Error fetching mention messages:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
export async function reactToMessage(req, res) {
    try {
        const { emoji } = req.body;
        const userId = req.user._id;

        if (!emoji) {
            return res.status(400).json({ message: 'Emoji is required.' });
        }

        const { message, conversation } = req;

        const existingReactionIndex = message.reactions.findIndex(
            (r) => r.userId.toString() === userId.toString()
        );

        if (existingReactionIndex !== -1) {
            const existingReaction = message.reactions[existingReactionIndex];
            if (existingReaction.emoji === emoji) {
                message.reactions.splice(existingReactionIndex, 1);
            } else {
                message.reactions[existingReactionIndex].emoji = emoji;
            }
        } else {
            message.reactions.push({ userId, emoji });
        }

        await message.save();
        conversation.participants.forEach((p) => {
            const socketId = getReceiverSocketId(p.userId._id?.toString() ?? p.userId.toString());
            if (socketId) {
                io.to(socketId).emit('message-reaction', {
                    conversationId: conversation._id.toString(),
                    messageId: message._id.toString(),
                    reactions: message.reactions,
                });
            }
        });

        return res.status(200).json({ reactions: message.reactions });
    } catch (error) {
        console.error('Error reacting to message:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}


export async function getSignedMediaUrl(req, res) {
    try {
        const { messageId } = req.params;
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Tin nhắn không tồn tại.' });
        }
        if (!message.filePublicId) {
            return res.status(404).json({ message: 'Tin nhắn không có file đính kèm.' });
        }

        const conversation = await Conversation.findOne({
            _id: message.conversationId,
            'participants.userId': req.user._id
        });

        if (!conversation) {
            return res.status(403).json({ message: 'Bạn không có quyền xem ảnh này.' });
        }

        const signedUrl = generateSignedUrl(message.filePublicId, message.type);

        return res.status(200).json({ url: signedUrl });
    } catch (error) {
        console.error('Error generating signed URL:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function forwardMessage(req, res) {
    try {
        const senderId = req.user._id;
        const { messageId } = req.params;
        const { targetConversationIds, forwardBatch } = req.body;
        const forwardBatchMetadata = parseForwardBatch(forwardBatch);

        if (!Array.isArray(targetConversationIds) || targetConversationIds.length === 0) {
            return res.status(400).json({ message: 'targetConversationIds is required and must be a non-empty array.' });
        }

        if (targetConversationIds.length > 10) {
            return res.status(400).json({ message: 'Bạn chỉ có thể chuyển tiếp đến tối đa 10 cuộc trò chuyện cùng lúc.' });
        }

        // Load the source message
        const source = await Message.findById(messageId);
        if (!source) {
            return res.status(404).json({ message: 'Tin nhắn không tồn tại.' });
        }
        if (source.isRecalled) {
            return res.status(400).json({ message: 'Không thể chuyển tiếp tin nhắn đã thu hồi.' });
        }
        if (source.type === 'system') {
            return res.status(400).json({ message: 'Không thể chuyển tiếp tin nhắn hệ thống.' });
        }
        const sourceConvo = await Conversation.findById(source.conversationId);
        if (!sourceConvo) {
            return res.status(404).json({ message: 'Cuộc trò chuyện gốc không tồn tại.' });
        }
        const isMemberOfSource = sourceConvo.participants.some(
            (p) => p.userId.toString() === senderId.toString()
        );
        if (!isMemberOfSource) {
            return res.status(403).json({ message: 'Bạn không có quyền truy cập tin nhắn này.' });
        }
        const sourceMetadata = source.metadata instanceof Map
            ? Object.fromEntries(source.metadata)
            : (source.metadata || {});
        const forwardedFrom = {
            messageId: source._id.toString(),
            conversationId: source.conversationId.toString(),
            senderDisplayName: source.senderInfo?.displayName || null,
            type: source.type,
        };

        const results = [];
        const errors = [];

        for (const targetConvoId of targetConversationIds) {
            try {
                const targetConvo = await Conversation.findById(targetConvoId);
                if (!targetConvo) {
                    errors.push({ conversationId: targetConvoId, reason: 'Conversation not found.' });
                    continue;
                }

                if (targetConvo.disbanded === true) {
                    errors.push({ conversationId: targetConvoId, reason: 'Nhóm đã bị giải tán.' });
                    continue;
                }

                const isMember = targetConvo.participants.some(
                    (p) => p.userId.toString() === senderId.toString()
                );
                if (!isMember) {
                    errors.push({ conversationId: targetConvoId, reason: 'Bạn không phải thành viên.' });
                    continue;
                }
                const forwardedMetadata = {
                    ...(sourceMetadata.linkPreview ? { linkPreview: sourceMetadata.linkPreview } : {}),
                    forwardedFrom,
                    ...(forwardBatchMetadata ? forwardBatchMetadata : {}),
                };

                const msgData = {
                    conversationId: targetConvo._id,
                    senderId,
                    senderInfo: {
                        displayName: req.user.displayName,
                        avatarUrl: req.user.avatarUrl,
                    },
                    type: source.type,
                    ...(source.content != null ? { content: source.content } : {}),
                    ...(source.filePublicId ? { filePublicId: source.filePublicId } : {}),
                    ...(source.fileName ? { fileName: source.fileName } : {}),
                    ...(source.fileSize ? { fileSize: source.fileSize } : {}),
                    ...(source.mimeType ? { mimeType: source.mimeType } : {}),
                    metadata: forwardedMetadata,
                };

                const newMsg = await Message.create(msgData);

                const savedTargetConvo = await saveConversationForNewMessage({
                    conversationId: targetConvo._id,
                    message: newMsg,
                    senderId,
                });

                const signedUrl = generateSignedUrl(newMsg.filePublicId, newMsg.type);
                emitNewMessage(io, savedTargetConvo, newMsg, signedUrl);

                results.push({
                    conversationId: targetConvoId,
                    message: newMsg,
                    signedUrl,
                });
            } catch (innerErr) {
                console.error(`Forward error for convo ${targetConvoId}:`, innerErr);
                errors.push({ conversationId: targetConvoId, reason: 'Internal error.' });
            }
        }

        return res.status(200).json({
            forwarded: results.length,
            results,
            errors,
        });
    } catch (error) {
        console.error('Error forwarding message:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
