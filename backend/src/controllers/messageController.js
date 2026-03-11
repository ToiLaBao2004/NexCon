import Message from '../models/messageModel.js';
import Conversation from '../models/conversationModel.js';
import { emitNewMessage, updateConversationLastMessage } from '../utils/messageHelper.js';
import { io, getReceiverSocketId } from '../socket/index.js';
import {
    uploadChatImageFromBuffer,
    uploadRawFileFromBuffer,
    deleteCloudinaryResource,
    MAX_FILE_SIZE,
    MAX_IMAGE_SIZE,
} from '../middlewares/uploadMiddleware.js';

async function safeUpload(uploadFn, ...args) {
    try {
        return await uploadFn(...args);
    } catch (err) {
        const msg = err?.message ?? '';
        if (msg.includes('File size too large') || msg.includes('exceeds') || err?.http_code === 400) {
            const e = new Error('File quá lớn để upload lên cloud. Vui lòng chọn file nhỏ hơn.');
            e.statusCode = 413;
            throw e;
        }
        throw err;
    }
}

export async function sendMessage(req, res) {
    try {
        const senderId = req.user._id;
        const { type = 'text', recipientId, content } = req.body;
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
                    new URL(content.trim());
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
                messageData.fileUrl = result.secure_url;
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
                messageData.fileUrl = result.secure_url;
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

        const message = await Message.create(messageData);

        updateConversationLastMessage(conversation, message, senderId);
        await conversation.save();

        emitNewMessage(io, conversation, message);

        return res.status(201).json({ message });
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
            return res.status(404).json({ message: 'Message not found.' });
        }
        if (message.senderId.toString() !== senderId.toString()) {
            return res.status(403).json({ message: 'You can only recall your own messages.' });
        }
        if (message.isRecalled) {
            return res.status(400).json({ message: 'Message already recalled.' });
        }
        if (message.createdAt.getTime() < Date.now() - 60 * 60 * 1000) {
            return res.status(400).json({ message: 'You can only recall messages within 1 hour.' });
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
                await deleteCloudinaryResource(message.filePublicId, resourceType);
            } catch (cloudErr) {
                console.warn('Cloudinary delete warning:', cloudErr?.message);
            }
        }

        message.isRecalled = true;
        message.fileUrl = undefined;
        message.filePublicId = undefined;
        if (message.isPinned) message.isPinned = false;
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
            return res.status(404).json({ message: 'Message not found.' });
        }

        const conversation = await Conversation.findById(message.conversationId);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        if (message.isPinned) {
            return res.status(200).json({
                message: 'Message already pinned.',
                data: {
                    conversationId: message.conversationId.toString(),
                    pinnedMessageId: message._id.toString(),
                    unpinnedMessageId: null,
                    pinnedAt: message.pinnedAt,
                },
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
            const socketId = getReceiverSocketId(p.userId._id?.toString() ?? p.userId.toString());
            if (socketId) {
                io.to(socketId).emit('pin-message', payload);
            }
        });

        return res.status(200).json({ message: 'Message pinned successfully.', data: payload });
    } catch (error) {
        console.error('Error pinning message:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}