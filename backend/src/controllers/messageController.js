import mongoose from 'mongoose';
import Message from '../models/messageModel.js';
import User from '../models/userModel.js';
import BlockUser from '../models/blockUserModel.js';
import Conversation from '../models/conversationModel.js';
import {
    emitNewMessage,
    getParticipantUserId,
    pruneInvalidConversationParticipants,
    updateConversationLastMessage,
    generateSignedUrl,
    replaceMentionTags,
} from '../utils/messageHelper.js';
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
import { sendFCMToUser } from '../services/fcmService.js';
import { transcribeAudioFromBuffer } from '../services/audio/transcribeAudio.js';
import { moderateImageMessage } from '../services/moderation/imageModerationService.js';
import { maskLockedUserDoc } from '../utils/lockedUser.js';
import { isMuted } from '../utils/isMuted.js';
import { decryptConversationPayload, decryptMessagePayload } from '../utils/messageCrypto.js';
import { buildMentionsForContent, parseMentionPayload } from '../utils/mentions.js';
import {
    buildDirectConversationLookup,
    getDirectConversationKey,
    isDuplicateDirectConversationError,
} from '../utils/directConversation.js';
import {
    buildUnexpiredMessageFilter,
    DISAPPEARED_MESSAGE_PLACEHOLDER,
    getMessageExpirationFields,
    isMessageExpired,
    sanitizeExpiredMessageForClient,
} from '../utils/disappearingMessages.js';
import { cacheMessageCountdown } from '../services/disappearingMessageService.js';

const MAX_TEXT_MESSAGE_LENGTH = 1000;
const MAX_REMINDER_SYSTEM_CONTENT_LENGTH = 1200;
const MAX_SEARCH_QUERY_LENGTH = 100;
const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LIMIT = 100;
const SEARCH_SCAN_BATCH_SIZE = 100;
const MESSAGE_MODERATION_STATUS_PENDING = 'pending_review';
const MEDIA_CLEANUP_RETRY_DELAYS_MS = [0, 500, 2000];
const REPLY_TO_SELECT = '_id senderId type metadata content fileName fileUrl filePublicId isRecalled isExpired expiresAt reportStatus mentions';

const FILENAME_MOJIBAKE_PATTERN = /(?:[\u00C2-\u00C4][\u0080-\u00BF])|(?:\u00E1[\u00BA-\u00BF][\u0080-\u00BF])|(?:\u00C3[\u0080-\u00BF])/;
const FILENAME_MOJIBAKE_SCORE_PATTERN = /[\u0080-\u009F\u00C2-\u00C4]|\u00E1[\u00BA-\u00BF]/g;

function filenameMojibakeScore(value) {
    return value.match(FILENAME_MOJIBAKE_SCORE_PATTERN)?.length || 0;
}

function decodeMojibakeFileName(value) {
    if (!value || !FILENAME_MOJIBAKE_PATTERN.test(value)) return value || '';

    try {
        const decoded = Buffer.from(value, 'latin1').toString('utf8');
        return filenameMojibakeScore(decoded) < filenameMojibakeScore(value) ? decoded : value;
    } catch {
        return value;
    }
}

function normalizeUploadedFileName(...candidates) {
    const rawName = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
    const fileName = decodeMojibakeFileName(String(rawName || 'file').trim());
    return fileName.slice(0, 255);
}

function clampSearchLimit(value) {
    const parsed = Number(value);
    return Math.max(1, Math.min(SEARCH_MAX_LIMIT, Number.isFinite(parsed) ? parsed : SEARCH_DEFAULT_LIMIT));
}

function maskPopulatedSender(message) {
    const raw = sanitizeExpiredMessageForClient(decryptMessagePayload(message));
    if (!raw?.senderId || typeof raw.senderId !== 'object') return raw;
    return {
        ...raw,
        senderId: maskLockedUserDoc(raw.senderId),
    };
}

function sanitizeModeratedReply(replyTo) {
    const raw = maskPopulatedSender(replyTo);
    if (!raw?.reportStatus) return raw;
    return {
        ...raw,
        content: 'Tin nhắn vi phạm tiêu chuẩn cộng đồng',
        filePublicId: undefined,
        fileUrl: undefined,
        fileName: undefined,
    };
}

function getMessageSearchableText(message) {
    const parts = [
        message.searchContent || normalizeVietnamese(message.content || ''),
    ];

    if (message.type === 'file' && message.fileName) {
        parts.push(normalizeVietnamese(message.fileName));
    }

    return parts.filter(Boolean).join(' ');
}

function getMessageVisibleToUserIds(message) {
    const metadata = message?.metadata instanceof Map
        ? Object.fromEntries(message.metadata)
        : (message?.metadata || {});
    return Array.isArray(metadata.visibleToUserIds)
        ? metadata.visibleToUserIds.map((id) => id.toString())
        : [];
}

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

function participantUserId(participant) {
    const userId = participant?.userId;
    return (userId?._id || userId)?.toString?.() || null;
}

function messageMetadataObject(message) {
    if (message?.metadata instanceof Map) {
        return Object.fromEntries(message.metadata);
    }
    return message?.metadata || {};
}

function isMessageVisibleToUser(message, userId) {
    const metadata = messageMetadataObject(message);
    if (!Array.isArray(metadata.visibleToUserIds) || metadata.visibleToUserIds.length === 0) {
        return true;
    }
    return metadata.visibleToUserIds.map((id) => id.toString()).includes(userId.toString());
}

function buildMessagePushPreview(message) {
    switch (message.type) {
        case 'image':
            return message.content || 'Đã gửi một ảnh';
        case 'file':
            return message.fileName ? `Đã gửi tập tin ${message.fileName}` : 'Đã gửi một tập tin';
        case 'audio':
            return 'Tin nhắn thoại';
        case 'sticker':
            return 'Đã gửi một sticker';
        case 'link':
            return message.content || 'Đã gửi một liên kết';
        default:
            return replaceMentionTags(message.content || '', message.mentions).trim() || 'Tin nhắn mới';
    }
}

async function sendOfflineMessagePushes({ conversation, message, senderId, senderName, skipUserIds = new Set() }) {
    const preview = buildMessagePushPreview(message).slice(0, 160);
    const conversationId = conversation._id.toString();
    const messageId = message._id.toString();
    const url = `/chat?conversationId=${conversationId}&messageId=${messageId}`;
    const title = conversation.type === 'group'
        ? conversation.group?.name || 'Tin nhắn nhóm'
        : senderName || 'Tin nhắn mới';
    const body = conversation.type === 'group'
        ? `${senderName || 'Thành viên'}: ${preview}`
        : preview;

    await Promise.all((conversation.participants || []).map(async (participant) => {
        const recipientId = participantUserId(participant);
        if (!recipientId) return;
        if (recipientId === senderId.toString()) return;
        if (skipUserIds.has(recipientId)) return;
        if (!isMessageVisibleToUser(message, recipientId)) return;
        if (isMuted(participant.mute, 'messages')) return;
        await sendFCMToUser(recipientId, {
            title,
            body,
            data: {
                type: 'message',
                url,
                conversationId,
                messageId,
                chatType: conversation.type,
            },
        });
    }));
}

function getModerationMediaResourceType(messageType) {
    return messageType === 'image' ? 'image' : 'raw';
}

function isMessageModerationPending(metadata = {}) {
    return metadata.moderationStatus === MESSAGE_MODERATION_STATUS_PENDING
        || metadata.imageModerationStatus === MESSAGE_MODERATION_STATUS_PENDING;
}

function markMessageModerationPending(messageData, extraMetadata = {}) {
    messageData.metadata = {
        ...(messageData.metadata || {}),
        moderationStatus: MESSAGE_MODERATION_STATUS_PENDING,
        ...extraMetadata,
    };
}

function skippedModerationResult(category, reason) {
    return {
        allowed: true,
        blocked: false,
        category,
        confidence: 0,
        reason,
        userMessage: null,
        source: 'system',
        moderationSkipped: true,
    };
}

function selectModerationResult(results = []) {
    const availableResults = results.filter(Boolean);
    return availableResults.find((result) => result.blocked)
        || availableResults.find((result) => result.moderationSkipped || result.error || result.skipped)
        || availableResults[0]
        || skippedModerationResult('missing_content', 'Không có nội dung để kiểm duyệt.');
}

function getFileMetadataForModeration({ content, fileName, mimeType }) {
    return [
        content ? `Caption/content: ${content}` : '',
        fileName ? `File name: ${fileName}` : '',
        mimeType ? `MIME type: ${mimeType}` : '',
    ].filter(Boolean).join('\n');
}

async function reviewDeliveredMessage({
    type,
    content,
    mediaBuffer,
    fileName,
    mimeType,
}) {
    switch (type) {
        case 'text':
            return {
                result: await moderateTextMessage(replaceMentionTags(content || ''), { modality: 'text' }),
            };

        case 'link':
            return {
                result: await moderateLinkMessage(content || ''),
            };

        case 'image': {
            const results = await Promise.all([
                moderateImageMessage(mediaBuffer, mimeType || 'image/jpeg'),
                content?.trim()
                    ? moderateTextMessage(replaceMentionTags(content), { modality: 'image_caption' })
                    : null,
            ]);
            return { result: selectModerationResult(results) };
        }

        case 'audio': {
            const transcript = await transcribeAudioFromBuffer(
                mediaBuffer,
                fileName || 'voice_message.webm',
                mimeType || 'audio/webm'
            );

            if (!transcript) {
                return {
                    result: skippedModerationResult(
                        'transcription_unavailable',
                        'Không thể chuyển tin nhắn thoại thành văn bản.'
                    ),
                    transcript: '',
                    transcriptStatus: 'unavailable',
                };
            }

            return {
                result: await moderateTextMessage(transcript, { modality: 'voice_transcript' }),
                transcript,
                transcriptStatus: 'completed',
            };
        }

        case 'file': {
            const metadataText = getFileMetadataForModeration({ content, fileName, mimeType });
            const results = await Promise.all([
                mimeType?.startsWith?.('image/') && mediaBuffer
                    ? moderateImageMessage(mediaBuffer, mimeType)
                    : null,
                metadataText
                    ? moderateTextMessage(metadataText, { modality: 'file_metadata' })
                    : null,
            ]);
            return { result: selectModerationResult(results) };
        }

        default:
            return {
                result: skippedModerationResult('unsupported_type', `Loại tin nhắn ${type || 'không rõ'} chưa hỗ trợ kiểm duyệt.`),
            };
    }
}

function getModerationStatus(result) {
    if (result.blocked) return 'rejected';
    if (result.moderationSkipped || result.error || result.skipped) return 'skipped';
    return 'approved';
}

function buildModerationUpdate({ type, result, transcript, transcriptStatus }) {
    const moderationStatus = getModerationStatus(result);
    const fields = {
        'metadata.moderationStatus': moderationStatus,
        'metadata.moderationCategory': result.category || (result.blocked ? 'unknown' : 'safe'),
    };

    if (result.reason && moderationStatus !== 'approved') {
        fields['metadata.moderationReason'] = String(result.reason).slice(0, 1000);
    }

    if (type === 'image') {
        fields['metadata.imageModerationStatus'] = moderationStatus;
        fields['metadata.imageModerationCategory'] = fields['metadata.moderationCategory'];
        if (fields['metadata.moderationReason']) {
            fields['metadata.imageModerationReason'] = fields['metadata.moderationReason'];
        }
    }

    if (type === 'audio') {
        fields['metadata.transcriptStatus'] = transcriptStatus || 'unavailable';
        if (!result.blocked && transcript) {
            fields.content = transcript;
            fields.searchContent = normalizeVietnamese(transcript);
        }
    }

    return fields;
}

function getMatchedCount(updateResult) {
    return updateResult.matchedCount ?? updateResult.n ?? 0;
}

async function cleanupRejectedMedia(publicId, resourceType) {
    if (!publicId) return;

    for (let index = 0; index < MEDIA_CLEANUP_RETRY_DELAYS_MS.length; index += 1) {
        const delay = MEDIA_CLEANUP_RETRY_DELAYS_MS[index];
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        try {
            await deleteCloudinaryResource(publicId, resourceType, 'authenticated');
            return;
        } catch (error) {
            const isLastAttempt = index === MEDIA_CLEANUP_RETRY_DELAYS_MS.length - 1;
            console.error(
                `[Moderation] Cannot delete rejected asset${isLastAttempt ? '' : ', retrying'}:`,
                publicId,
                error?.message || error
            );
        }
    }
}

async function moderateDeliveredMessage({
    messageId,
    conversationId,
    type,
    publicId,
    mediaBuffer,
    content,
    fileName,
    mimeType,
    notificationPayload,
}) {
    try {
        const review = await reviewDeliveredMessage({
            type,
            content,
            mediaBuffer,
            fileName,
            mimeType,
        });
        const updateFields = buildModerationUpdate({ type, ...review });
        const result = review.result;

        if (!result.blocked) {
            const updateResult = await Message.updateOne(
                {
                    _id: messageId,
                    isRecalled: { $ne: true },
                    reportStatus: { $ne: true },
                    'metadata.moderationStatus': MESSAGE_MODERATION_STATUS_PENDING,
                },
                {
                    $set: updateFields,
                }
            );

            if (getMatchedCount(updateResult) > 0) {
                if (type === 'audio') {
                    io.to(conversationId.toString()).emit('message-moderation-updated', {
                        conversationId: conversationId.toString(),
                        messageId: messageId.toString(),
                        content: review.transcript || null,
                        metadata: {
                            moderationStatus: updateFields['metadata.moderationStatus'],
                            moderationCategory: updateFields['metadata.moderationCategory'],
                            transcriptStatus: updateFields['metadata.transcriptStatus'],
                        },
                    });
                }

                if (notificationPayload) {
                    schedulePostMessageNotifications(notificationPayload);
                }
            }
            return;
        }

        const moderatedMessage = await Message.findOneAndUpdate(
            {
                _id: messageId,
                isRecalled: { $ne: true },
                reportStatus: { $ne: true },
                'metadata.moderationStatus': MESSAGE_MODERATION_STATUS_PENDING,
            },
            {
                $set: {
                    reportStatus: true,
                    ...updateFields,
                },
            },
            { new: true }
        ).lean();

        if (publicId) {
            await cleanupRejectedMedia(publicId, getModerationMediaResourceType(type));
        }

        if (!moderatedMessage) return;

        const conversation = await Conversation.findById(conversationId);
        if (conversation?.lastMessage?._id?.toString?.() === messageId.toString()) {
            conversation.lastMessage.content = 'Tin nhắn vi phạm tiêu chuẩn cộng đồng';
            await conversation.save();
        }

        io.to(conversationId.toString()).emit('message-moderated', {
            conversationId: conversationId.toString(),
            messageId: messageId.toString(),
            reportStatus: true,
            content: 'Tin nhắn vi phạm tiêu chuẩn cộng đồng',
        });
    } catch (error) {
        console.error('[Moderation] Background review failed:', error);

        try {
            const skippedFields = buildModerationUpdate({
                type,
                result: skippedModerationResult('moderation_error', 'Không thể hoàn tất kiểm duyệt nền.'),
                transcriptStatus: type === 'audio' ? 'unavailable' : undefined,
            });
            const updateResult = await Message.updateOne(
                {
                    _id: messageId,
                    isRecalled: { $ne: true },
                    reportStatus: { $ne: true },
                    'metadata.moderationStatus': MESSAGE_MODERATION_STATUS_PENDING,
                },
                {
                    $set: skippedFields,
                }
            );

            if (getMatchedCount(updateResult) > 0) {
                if (type === 'audio') {
                    io.to(conversationId.toString()).emit('message-moderation-updated', {
                        conversationId: conversationId.toString(),
                        messageId: messageId.toString(),
                        content: null,
                        metadata: {
                            moderationStatus: skippedFields['metadata.moderationStatus'],
                            moderationCategory: skippedFields['metadata.moderationCategory'],
                            transcriptStatus: skippedFields['metadata.transcriptStatus'],
                        },
                    });
                }

                if (notificationPayload) {
                    schedulePostMessageNotifications(notificationPayload);
                }
            }
        } catch (updateError) {
            console.error('[Moderation] Cannot mark failed background review as skipped:', updateError);
        }
    }
}

function scheduleMessageModeration(payload) {
    setImmediate(() => {
        void moderateDeliveredMessage(payload);
    });
}

async function sendPostMessageNotifications({ conversation, message, senderId, senderName, senderAvatarUrl }) {
    const mentionTargetIds = new Set(
        (message.mentions || [])
            .map((mention) => mention.userId.toString())
            .filter((mentionUserId) => mentionUserId !== senderId.toString())
    );

    try {
        await sendOfflineMessagePushes({
            conversation,
            message,
            senderId,
            senderName,
            skipUserIds: mentionTargetIds,
        });
    } catch (error) {
        console.error('Error sending offline message pushes:', error);
    }

    if (!Array.isArray(message.mentions) || message.mentions.length === 0) return;

    const cleanContent = replaceMentionTags(message.content, message.mentions);
    const preview = cleanContent?.substring(0, 100) ?? '';
    const conversationUrl = `${process.env.FRONTEND_URL}/chat?conversationId=${conversation._id}&messageId=${message._id}`;
    const mentionTargets = new Set();

    for (const mention of message.mentions) {
        const mentionUserId = mention.userId.toString();
        if (mentionUserId === senderId.toString() || mentionTargets.has(mentionUserId)) continue;

        mentionTargets.add(mentionUserId);

        const delivered = await emitToUser(mentionUserId, 'user_mentioned', {
            messageId: message._id,
            conversationId: message.conversationId,
            mentionedBy: {
                userId: senderId,
                displayName: senderName,
                avatarUrl: senderAvatarUrl,
            },
            preview,
            createdAt: message.createdAt,
        });

        if (delivered) continue;

        await createNotification(
            mention.userId,
            'Bạn được nhắc đến',
            `${senderName}${preview ? `: "${preview}"` : ''}`,
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
                body: `${senderName}${preview ? `: ${preview}` : ''}`,
                url: conversationUrl,
            });
        } catch (pushError) {
            console.error('Error sending mention push notification:', pushError);
        }
    }
}

function schedulePostMessageNotifications(payload) {
    setImmediate(() => {
        void sendPostMessageNotifications(payload).catch((error) => {
            console.error('Error sending post-message notifications:', error);
        });
    });
}

const saveConversationForNewMessage = async ({ conversationId, message, senderId, mentions = [] }) => {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            const error = new Error('Conversation not found.');
            error.statusCode = 404;
            throw error;
        }

        pruneInvalidConversationParticipants(conversation);

        if (Array.isArray(mentions) && mentions.length > 0) {
            const mentionedUserIds = new Set(
                mentions
                    .map((mention) => mention.userId.toString())
                    .filter((mentionUserId) => mentionUserId !== senderId.toString())
            );

            if (mentionedUserIds.size > 0) {
                conversation.participants.forEach((participant) => {
                    const participantId = getParticipantUserId(participant);
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
    let pendingModeration = null;
    const deliveryStartedAt = new Date();

    try {
        const senderId = req.user._id;
        const { type = 'text', recipientId, content, replyTo } = req.body;
        const uploadedFile = req.file;
        const uploadedFileName = uploadedFile
            ? normalizeUploadedFileName(req.body.fileName, uploadedFile.originalname, type === 'audio' ? 'voice_message.webm' : 'file')
            : '';
        parseMentionPayload(req.body.mentions);
        const metadata = parseMessageMetadata(req.body.metadata);

        let conversation = req.conversation;
        let createdDirectConversation = false;

        if (!conversation && req.messageTarget === 'direct') {
            if (!recipientId) {
                return res.status(400).json({ message: 'recipientId is required for direct messages.' });
            }
            try {
                conversation = await Conversation.create({
                    type: 'direct',
                    directKey: getDirectConversationKey(senderId, recipientId),
                    participants: [
                        { userId: senderId, joinedAt: new Date() },
                        { userId: recipientId, joinedAt: new Date() },
                    ],
                });
                createdDirectConversation = true;
            } catch (error) {
                if (!isDuplicateDirectConversationError(error)) {
                    throw error;
                }

                conversation = await Conversation.findOne(buildDirectConversationLookup(senderId, recipientId));
                if (!conversation) {
                    throw error;
                }
            }
        }

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        const messageData = {
            conversationId: conversation._id,
            senderId,
            senderInfo: {
                displayName: req.user.displayName,
                avatarUrl: req.user.avatarUrl
            },
            type,
            ...getMessageExpirationFields({
                conversation,
                deliveredAt: deliveryStartedAt,
            }),
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

                messageData.content = trimmedContent;
                markMessageModerationPending(messageData);
                pendingModeration = {
                    type,
                    content: trimmedContent,
                };
                break;
            }

            case 'link': {
                if (!content || !content.trim()) {
                    return res.status(400).json({ message: 'URL is required for link messages.' });
                }

                const trimmedLink = content.trim();
                let normalizedUrl = trimmedLink;
                try {
                    normalizedUrl = new URL(trimmedLink).toString();
                } catch {
                    try {
                        normalizedUrl = new URL(`https://${trimmedLink}`).toString();
                    } catch {
                        return res.status(400).json({ message: 'Link không hợp lệ.' });
                    }
                }

                const normalizedProtocol = new URL(normalizedUrl).protocol.toLowerCase();
                if (!['http:', 'https:'].includes(normalizedProtocol)) {
                    return res.status(400).json({ message: 'Chỉ cho phép link http hoặc https.' });
                }

                messageData.content = normalizedUrl;

                const preview = await fetchLinkPreview(normalizedUrl);
                messageData.metadata = {
                    ...(messageData.metadata || {}),
                    linkPreview: preview,
                };

                markMessageModerationPending(messageData);
                pendingModeration = {
                    type,
                    content: normalizedUrl,
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

                const result = await safeUpload(uploadChatImageFromBuffer, uploadedFile.buffer);
                messageData.filePublicId = result.public_id;
                messageData.fileName = uploadedFileName;
                messageData.fileSize = uploadedFile.size;
                messageData.mimeType = uploadedFile.mimetype;
                markMessageModerationPending(messageData, {
                    imageModerationStatus: MESSAGE_MODERATION_STATUS_PENDING,
                });
                pendingModeration = {
                    type,
                    publicId: result.public_id,
                    mediaBuffer: imageBuffer,
                    content: content?.trim() || '',
                    fileName: uploadedFileName,
                    mimeType,
                };
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
                    uploadedFileName
                );
                messageData.filePublicId = result.public_id;
                messageData.fileName = uploadedFileName;
                messageData.fileSize = uploadedFile.size;
                messageData.mimeType = uploadedFile.mimetype;
                if (content?.trim()) messageData.content = content.trim();
                markMessageModerationPending(messageData);
                pendingModeration = {
                    type,
                    publicId: result.public_id,
                    mediaBuffer: uploadedFile.buffer,
                    content: content?.trim() || '',
                    fileName: uploadedFileName,
                    mimeType: uploadedFile.mimetype,
                };
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

                const result = await safeUpload(
                    uploadAudioFromBuffer,
                    uploadedFile.buffer,
                    uploadedFileName || 'voice_message.webm'
                );

                messageData.filePublicId = result.public_id;
                messageData.fileName = uploadedFileName || 'voice_message.webm';
                messageData.fileSize = uploadedFile.size;
                messageData.mimeType = uploadedFile.mimetype;
                markMessageModerationPending(messageData, {
                    transcriptStatus: 'pending',
                });
                pendingModeration = {
                    type,
                    publicId: result.public_id,
                    mediaBuffer: uploadedFile.buffer,
                    fileName: uploadedFileName || 'voice_message.webm',
                    mimeType: uploadedFile.mimetype,
                };

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

        const mentionableTypes = new Set(['text', 'link', 'image', 'file']);
        if (messageData.content && mentionableTypes.has(type)) {
            const mentionResult = await buildMentionsForContent({
                content: messageData.content,
                conversation,
                UserModel: User,
            });
            messageData.content = mentionResult.content;
            if (mentionResult.mentions.length > 0) {
                messageData.mentions = mentionResult.mentions;
            }
        }

        const mentions = messageData.mentions || [];

        if (replyTo) {
            const repliedMessage = await Message.findById(replyTo);
            if (!repliedMessage || repliedMessage.conversationId.toString() !== conversation._id.toString()) {
                if (pendingModeration?.publicId) {
                    void cleanupRejectedMedia(pendingModeration.publicId, getModerationMediaResourceType(type));
                    pendingModeration = null;
                }
                return res.status(400).json({ message: 'Tin nhắn trả lời không hợp lệ.' });
            }
            if (repliedMessage.isRecalled || repliedMessage.reportStatus || isMessageExpired(repliedMessage)) {
                if (pendingModeration?.publicId) {
                    void cleanupRejectedMedia(pendingModeration.publicId, getModerationMediaResourceType(type));
                    pendingModeration = null;
                }
                return res.status(400).json({ message: 'Không thể trả lời tin nhắn đã bị ẩn.' });
            }
            messageData.replyTo = replyTo;
        }

        let message = await Message.create(messageData);
        await cacheMessageCountdown(message);

        if (message.replyTo) {
            message = await message.populate({
                path: 'replyTo',
                select: REPLY_TO_SELECT,
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
                select: 'displayName avatarUrl nickname profileVisibility status lastSeen',
            });

            for (const participant of conversation.participants) {
                const participantId = getParticipantUserId(participant);
                if (!participantId) continue;
                joinUserSocketsToRoom(participantId, conversation._id.toString());
                emitToUser(participantId, 'new-conversation', {
                    conversation: populatedConversation || conversation,
                });
            }

            conversation = populatedConversation || conversation;
        }

        const signedUrl = generateSignedUrl(message.filePublicId, message.type);
        emitNewMessage(io, conversation, message, signedUrl);

        const notificationPayload = {
            conversation,
            message,
            senderId,
            senderName: req.user.displayName,
            senderAvatarUrl: req.user.avatarUrl,
        };

        if (pendingModeration) {
            scheduleMessageModeration({
                ...pendingModeration,
                messageId: message._id,
                conversationId: conversation._id,
                notificationPayload,
            });
            pendingModeration = null;
        } else {
            schedulePostMessageNotifications(notificationPayload);
        }

        return res.status(201).json({ message, signedUrl });
    } catch (error) {
        if (pendingModeration?.publicId) {
            void cleanupRejectedMedia(pendingModeration.publicId, getModerationMediaResourceType(pendingModeration.type));
        }
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

        if (normalizedReminderId && !mongoose.Types.ObjectId.isValid(normalizedReminderId)) {
            return res.status(400).json({ message: 'Invalid reminderId.' });
        }

        if (normalizedReminderContent.length > MAX_REMINDER_SYSTEM_CONTENT_LENGTH) {
            return res.status(400).json({
                message: `Reminder content cannot exceed ${MAX_REMINDER_SYSTEM_CONTENT_LENGTH} characters.`,
            });
        }

        let normalizedRemindAtIso = '';
        if (normalizedRemindAt) {
            const remindAtDate = new Date(normalizedRemindAt);
            if (Number.isNaN(remindAtDate.getTime())) {
                return res.status(400).json({ message: 'remindAt must be a valid date.' });
            }
            normalizedRemindAtIso = remindAtDate.toISOString();
        }

        const metadata = {
            visibleToUserIds: [senderId.toString()],
            ...(normalizedReminderId ? { reminderId: normalizedReminderId } : {}),
            ...(normalizedReminderContent ? { reminderContent: normalizedReminderContent } : {}),
            ...(normalizedRemindAtIso ? { remindAt: normalizedRemindAtIso } : {}),
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

        const payloadMessage = decryptMessagePayload(message);

        const safeConversation = decryptConversationPayload(conversation);
        const lastMsgPayload = safeConversation.lastMessage
            ? { ...safeConversation.lastMessage }
            : safeConversation.lastMessage;

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
        if (message.type === 'system' || isMessageExpired(message)) {
            return res.status(400).json({ message: 'This message cannot be recalled.' });
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

        if (message.reportStatus) {
            return res.status(403).json({ message: 'Không thể ghim tin nhắn đã bị xác nhận vi phạm.' });
        }
        if (message.type === 'system' || message.isExpired || message.expiresAt) {
            return res.status(400).json({ message: 'Disappearing and system messages cannot be pinned.' });
        }

        const conversation = req.conversation || await Conversation.findById(message.conversationId);
        if (!conversation) {
            return res.status(404).json({ message: 'Không tìm thấy cuộc trò chuyện.' });
        }

        if (conversation.type === 'direct') {
            const otherParticipant = conversation.participants.find(p => {
                const participantId = getParticipantUserId(p);
                return participantId && participantId !== req.user._id.toString();
            });
            if (otherParticipant) {
                const otherParticipantId = getParticipantUserId(otherParticipant);
                const blockExists = await BlockUser.findOne({
                    $or: [
                        { from: req.user._id, to: otherParticipantId },
                        { from: otherParticipantId, to: req.user._id }
                    ]
                });
                if (blockExists) {
                    return res.status(403).json({ message: 'Không thể ghim tin nhắn khi đang bị chặn.' });
                }
            }
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
        const { conversationId, senderId, fromDate, toDate, cursor } = req.query;
        const rawKeyword = req.query.keyword ?? req.query.q ?? '';
        const q = String(Array.isArray(rawKeyword) ? rawKeyword[0] : rawKeyword).trim();
        const userId = req.user._id.toString();
        const limitNumber = clampSearchLimit(req.query.limit);

        if (!q) {
            return res.status(400).json({ message: 'Chưa nhập từ khóa tìm kiếm.' });
        }
        if (q.length > MAX_SEARCH_QUERY_LENGTH) {
            return res.status(400).json({ message: `Search query must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters.` });
        }

        if (!conversationId) {
            return res.status(400).json({ message: 'Thiếu conversationId.' });
        }

        const conversation = await Conversation.findById(conversationId).select('participants').lean();
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }
        const isMember = conversation.participants?.some(
            (participant) => getParticipantUserId(participant) === userId
        );
        if (!isMember) {
            return res.status(403).json({ message: 'You are not a participant in this conversation.' });
        }

        const normalizedKeyword = normalizeVietnamese(q);

        // Build base filter. searchContent is encrypted at rest, so keyword matching happens after decrypting.
        const filter = {
            conversationId,
            type: { $ne: 'sticker' },
            isRecalled: { $ne: true },
            isExpired: { $ne: true },
            reportStatus: { $ne: true },
            $and: [buildUnexpiredMessageFilter()],
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

        let scanCursor = null;
        if (cursor) {
            scanCursor = new Date(cursor);
            if (Number.isNaN(scanCursor.getTime())) {
                return res.status(400).json({ message: 'Invalid cursor.' });
            }
        }

        const matchedMessageIds = [];
        let hasMore = false;
        let nextCursor = null;
        let exhausted = false;
        const batchSize = Math.max(limitNumber, SEARCH_SCAN_BATCH_SIZE);

        while (matchedMessageIds.length < limitNumber && !exhausted) {
            const pageFilter = { ...filter };
            if (scanCursor) {
                pageFilter.createdAt = { ...(pageFilter.createdAt || {}), $lt: scanCursor };
            }

            const rawBatch = await Message.find(pageFilter)
                .select('+searchContent')
                .sort({ createdAt: -1 })
                .limit(batchSize + 1)
                .lean();

            const hasExtra = rawBatch.length > batchSize;
            const pageMessages = hasExtra ? rawBatch.slice(0, batchSize) : rawBatch;

            if (!pageMessages.length) {
                exhausted = true;
                nextCursor = null;
                break;
            }

            let reachedLimit = false;
            for (let index = 0; index < pageMessages.length; index += 1) {
                const rawMessage = pageMessages[index];
                const message = decryptMessagePayload(rawMessage);
                if (message.type === 'sticker') continue;

                const searchableText = getMessageSearchableText(message);
                if (!searchableText.includes(normalizedKeyword)) continue;

                matchedMessageIds.push(rawMessage._id);
                scanCursor = rawMessage.createdAt;
                nextCursor = rawMessage.createdAt?.toISOString?.() || rawMessage.createdAt;

                if (matchedMessageIds.length >= limitNumber) {
                    reachedLimit = true;
                    hasMore = index < pageMessages.length - 1 || hasExtra;
                    break;
                }
            }

            if (reachedLimit) {
                break;
            }

            const lastScanned = pageMessages[pageMessages.length - 1];
            scanCursor = lastScanned.createdAt;
            nextCursor = lastScanned.createdAt?.toISOString?.() || lastScanned.createdAt;

            if (!hasExtra) {
                exhausted = true;
                nextCursor = null;
                break;
            }
        }

        let matchedMessages = [];
        if (matchedMessageIds.length) {
            const populatedMessages = await Message.find({ _id: { $in: matchedMessageIds } })
                .select('+searchContent')
                .populate('senderId', 'displayName avatarUrl lock')
                .populate({
                    path: 'replyTo',
                    select: REPLY_TO_SELECT,
                    populate: { path: 'senderId', select: 'displayName avatarUrl lock' },
                })
                .lean();

            const messageMap = new Map(populatedMessages.map((message) => [message._id.toString(), message]));
            matchedMessages = matchedMessageIds
                .map((messageId) => messageMap.get(messageId.toString()))
                .filter(Boolean)
                .filter((message) => !isMessageExpired(message))
                .map((message) => ({
                    ...maskPopulatedSender(message),
                    replyTo: message.replyTo ? sanitizeModeratedReply(message.replyTo) : message.replyTo,
                }))
                .map(({ searchContent, ...message }) => message);
        }

        return res.status(200).json({
            messages: matchedMessages,
            hasMore,
            nextCursor: hasMore ? nextCursor : null,
        });
    } catch (error) {
        console.error('Error searching messages:', error);
        return res.status(500).json({ message: 'Lỗi máy chủ nội bộ.' });
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
            isExpired: { $ne: true },
            reportStatus: { $ne: true },
            $and: [buildUnexpiredMessageFilter()],
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
            .populate('senderId', 'displayName avatarUrl lock')
            .lean();

        const hasMore = messages.length > limitNumber;
        const items = (hasMore ? messages.slice(0, limitNumber) : messages).map(maskPopulatedSender);
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
        if (message.reportStatus) {
            return res.status(403).json({ message: 'Không thể tương tác với tin nhắn đã bị xác nhận vi phạm.' });
        }
        if (isMessageExpired(message)) {
            return res.status(410).json({ message: DISAPPEARED_MESSAGE_PLACEHOLDER });
        }

        if (conversation.type === 'direct') {
            const otherParticipant = conversation.participants.find(p => {
                const participantId = getParticipantUserId(p);
                return participantId && participantId !== req.user._id.toString();
            });
            if (otherParticipant) {
                const otherParticipantId = getParticipantUserId(otherParticipant);
                const blockExists = await BlockUser.findOne({
                    $or: [
                        { from: req.user._id, to: otherParticipantId },
                        { from: otherParticipantId, to: req.user._id }
                    ]
                });
                if (blockExists) {
                    return res.status(403).json({ message: 'Không thể thả cảm xúc khi đang bị chặn.' });
                }
            }
        }

        if (!Array.isArray(message.reactions)) {
            message.reactions = [];
        }

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

        const reactionsForClient = [...message.reactions];
        if (reactionsForClient.length === 0) {
            message.reactions = undefined;
        }

        await message.save();
        conversation.participants.forEach((p) => {
            const participantId = getParticipantUserId(p);
            if (!participantId) return;
            const socketId = getReceiverSocketId(participantId);
            if (socketId) {
                io.to(socketId).emit('message-reaction', {
                    conversationId: conversation._id.toString(),
                    messageId: message._id.toString(),
                    reactions: reactionsForClient,
                });
            }
        });

        return res.status(200).json({ reactions: reactionsForClient });
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

        if (message.reportStatus) {
            return res.status(403).json({ message: 'Tài nguyên này đã bị ẩn do vi phạm tiêu chuẩn cộng đồng.' });
        }
        if (isMessageExpired(message)) {
            return res.status(410).json({ message: DISAPPEARED_MESSAGE_PLACEHOLDER });
        }

        const conversation = await Conversation.findOne({
            _id: message.conversationId,
            'participants.userId': req.user._id
        });

        if (!conversation) {
            return res.status(403).json({ message: 'Bạn không có quyền xem ảnh này.' });
        }

        const userId = req.user._id.toString();
        const participant = conversation.participants.find((p) => getParticipantUserId(p) === userId);
        if (participant?.clearedAt && new Date(message.createdAt).getTime() <= new Date(participant.clearedAt).getTime()) {
            return res.status(404).json({ message: 'Tài nguyên không còn tồn tại trong cuộc trò chuyện của bạn.' });
        }

        const visibleToUserIds = getMessageVisibleToUserIds(message);
        if (visibleToUserIds.length > 0 && !visibleToUserIds.includes(userId)) {
            return res.status(403).json({ message: 'Bạn không có quyền xem tài nguyên này.' });
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
        if (isMessageExpired(source)) {
            return res.status(410).json({ message: DISAPPEARED_MESSAGE_PLACEHOLDER });
        }
        if (source.reportStatus) {
            return res.status(403).json({ message: 'Không thể chuyển tiếp tin nhắn đã bị xác nhận vi phạm.' });
        }
        if (source.type === 'system') {
            return res.status(400).json({ message: 'Không thể chuyển tiếp tin nhắn hệ thống.' });
        }
        const sourceConvo = await Conversation.findById(source.conversationId);
        if (!sourceConvo) {
            return res.status(404).json({ message: 'Cuộc trò chuyện gốc không tồn tại.' });
        }
        const isMemberOfSource = sourceConvo.participants.some(
            (p) => getParticipantUserId(p) === senderId.toString()
        );
        if (!isMemberOfSource) {
            return res.status(403).json({ message: 'Bạn không có quyền truy cập tin nhắn này.' });
        }
        const sourceMetadata = source.metadata instanceof Map
            ? Object.fromEntries(source.metadata)
            : (source.metadata || {});
        if (isMessageModerationPending(sourceMetadata)) {
            return res.status(409).json({ message: 'Tin nhắn đang được kiểm duyệt. Vui lòng thử lại sau.' });
        }
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
                    (p) => getParticipantUserId(p) === senderId.toString()
                );
                if (!isMember) {
                    errors.push({ conversationId: targetConvoId, reason: 'Bạn không phải thành viên.' });
                    continue;
                }

                if (targetConvo.type === 'direct') {
                    const otherParticipant = targetConvo.participants.find(p => {
                        const participantId = getParticipantUserId(p);
                        return participantId && participantId !== senderId.toString();
                    });
                    if (otherParticipant) {
                        const otherParticipantId = getParticipantUserId(otherParticipant);
                        const recipient = await User.findById(otherParticipantId).select('lock').lean();
                        if (recipient?.lock?.isLocked) {
                            errors.push({ conversationId: targetConvoId, reason: 'Không thể chuyển tiếp tới tài khoản đã bị khóa.' });
                            continue;
                        }
                        const blockExists = await BlockUser.findOne({
                            $or: [
                                { from: senderId, to: otherParticipantId },
                                { from: otherParticipantId, to: senderId }
                            ]
                        });
                        if (blockExists) {
                            errors.push({ conversationId: targetConvoId, reason: 'Không thể chuyển tiếp vào cuộc trò chuyện đang bị chặn.' });
                            continue;
                        }
                    }
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
                    ...getMessageExpirationFields({
                        conversation: targetConvo,
                        inheritedDisappearing: Boolean(source.expiresAt),
                        deliveredAt: new Date(),
                    }),
                };

                const mentionableTypes = new Set(['text', 'link', 'image', 'file']);
                if (msgData.content && mentionableTypes.has(source.type)) {
                    const mentionResult = await buildMentionsForContent({
                        content: msgData.content,
                        conversation: targetConvo,
                        UserModel: User,
                    });
                    msgData.content = mentionResult.content;
                    if (mentionResult.mentions.length > 0) {
                        msgData.mentions = mentionResult.mentions;
                    }
                }

                const newMsg = await Message.create(msgData);
                await cacheMessageCountdown(newMsg);

                const savedTargetConvo = await saveConversationForNewMessage({
                    conversationId: targetConvo._id,
                    message: newMsg,
                    senderId,
                    mentions: msgData.mentions || [],
                });

                const signedUrl = generateSignedUrl(newMsg.filePublicId, newMsg.type);
                emitNewMessage(io, savedTargetConvo, newMsg, signedUrl);

                await sendOfflineMessagePushes({
                    conversation: savedTargetConvo,
                    message: newMsg,
                    senderId,
                    senderName: req.user.displayName,
                });

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
