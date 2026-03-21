import Message from '../models/messageModel.js';
import Conversation from '../models/conversationModel.js';
import { emitNewMessage, updateConversationLastMessage, generateSignedUrl } from '../utils/messageHelper.js';
import { io, getReceiverSocketId } from '../socket/index.js';
import { normalizeVietnamese } from '../utils/vietnameseHelper.js';
import {
    uploadChatImageFromBuffer,
    uploadRawFileFromBuffer,
    deleteCloudinaryResource,
    MAX_FILE_SIZE,
    MAX_IMAGE_SIZE,
} from '../middlewares/uploadMiddleware.js';
import { safeUpload } from '../utils/messageHelper.js';
import { v2 as cloudinary } from 'cloudinary';



export async function sendMessage(req, res) {
    try {
        const senderId = req.user._id;
        const { type = 'text', recipientId, content, replyTo } = req.body;
        const uploadedFile = req.file;

        let conversation = req.conversation;

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
        }

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        const messageData = {
            conversationId: conversation._id,
            senderId,
            type,
        };

        switch (type) {
            case 'text': {
                if (!content || !content.trim()) {
                    return res.status(400).json({ message: 'Content is required for text messages.' });
                }
                messageData.content = content.trim();
                break;
            }

            case 'link': {
                if (!content || !content.trim()) {
                    return res.status(400).json({ message: 'URL is required for link messages.' });
                }
                try {
                    try {
                        new URL(content.trim());
                    } catch {
                        new URL('https://' + content.trim());
                    }
                } catch {
                    return res.status(400).json({ message: 'Invalid URL format.' });
                }
                messageData.content = content.trim();
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

        updateConversationLastMessage(conversation, message, senderId);
        await conversation.save();

        const signedUrl = generateSignedUrl(message.filePublicId, message.type);
        emitNewMessage(io, conversation, message, signedUrl);

        return res.status(201).json({ message, signedUrl });
    } catch (error) {
        console.error('Error sending message:', error);
        const statusCode = error.statusCode ?? 500;
        const message = statusCode !== 500 ? error.message : 'Internal server error.';
        return res.status(statusCode).json({ message });
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
                const resourceType = message.type === 'file' ? 'raw' : 'image';
                await deleteCloudinaryResource(message.filePublicId, resourceType, 'authenticated');
            } catch (cloudErr) {
                console.warn('Cloudinary delete warning:', cloudErr?.message);
            }
        }

        message.isRecalled = true;
        message.filePublicId = undefined;
        if (message.isPinned) {
            message.isPinned = false;
            message.pinnedAt = null;
        }
        await message.save();

        conversation.participants.forEach((p) => {
            const socketId = getReceiverSocketId(p.userId._id?.toString() ?? p.userId.toString());
            if (socketId) {
                io.to(socketId).emit('recall-message', {
                    conversationId: message.conversationId.toString(),
                    messageId: message._id.toString(),
                    content: 'Tin nhắn này đã được thu hồi',
                    isRecalled: true,
                });
            }
            if (message.isPinned === false) {
                const payload = {
                    conversationId: message.conversationId.toString(),
                    pinnedMessageId: null,
                    unpinnedMessageId: message._id.toString(),
                    isPinned: false,
                    pinnedAt: null,
                };

                conversation.participants.forEach((p) => {
                    const socketId = getReceiverSocketId(
                        p.userId._id?.toString() ?? p.userId.toString()
                    );
                    if (socketId) {
                        io.to(socketId).emit('pin-message', payload);
                    }
                });
            }
        });

        return res.status(200).json({ success: true, message: 'Message recalled successfully.' });
    } catch (error) {
        console.error('Error recalling message:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function pinMessage(req, res) {
    try {
        const { messageId } = req.body;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Không tìm thấy tin nhắn.' });
        }

        const conversation = await Conversation.findById(message.conversationId);
        if (!conversation) {
            return res.status(404).json({ message: 'Không tìm thấy cuộc trò chuyện.' });
        }

        // Nếu đã ghim thì bỏ ghim luôn
        if (message.isPinned) {
            message.isPinned = false;
            message.pinnedAt = null;
            await message.save();

            const payload = {
                conversationId: message.conversationId.toString(),
                pinnedMessageId: null,
                unpinnedMessageId: message._id.toString(),
                isPinned: false,
                pinnedAt: null,
            };

            conversation.participants.forEach((p) => {
                const socketId = getReceiverSocketId(
                    p.userId._id?.toString() ?? p.userId.toString()
                );
                if (socketId) {
                    io.to(socketId).emit('pin-message', payload);
                }
            });

            return res.status(200).json({
                message: 'Bỏ ghim tin nhắn thành công.',
                data: payload,
            });
        }

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
            conversationId: message.conversationId.toString(),
            pinnedMessageId: message._id.toString(),
            unpinnedMessageId,
            isPinned: true,
            pinnedAt: message.pinnedAt,
        };

        conversation.participants.forEach((p) => {
            const socketId = getReceiverSocketId(
                p.userId._id?.toString() ?? p.userId.toString()
            );
            if (socketId) {
                io.to(socketId).emit('pin-message', payload);
            }
        });

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
