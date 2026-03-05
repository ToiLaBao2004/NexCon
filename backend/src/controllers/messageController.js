import Message from '../models/messageModel.js';
import Conversation from '../models/conversationModel.js';
import { emitNewMessage, updateConversationLastMessage } from '../utils/messageHelper.js';
import { io, getReceiverSocketId } from '../socket/index.js';
export async function sendDirectMessage(req, res) {
    try {
        const senderId = req.user._id;
        const { recipientId, content, conversationId } = req.body;
        if (!content) {
            return res.status(400).json({ message: 'Content are required' });
        }
        let conversation = await Conversation.findOne({ type: 'direct', 'participants.userId': { $all: [senderId, recipientId] } });

        if (!conversation) {
            // Create new conversation if it doesn't exist
            conversation = new Conversation({
                type: 'direct',
                participants: [
                    { userId: senderId, joinedAt: new Date() },
                    { userId: recipientId, joinedAt: new Date() }
                ]
            });
            conversation = await Conversation.create(conversation);
        }
        const message = new Message({
            conversationId: conversation._id,
            senderId: senderId,
            content: content
        });
        await Message.create(message);
        updateConversationLastMessage(conversation, message, senderId);
        await conversation.save();
        emitNewMessage(io, conversation, message);
        res.status(201).json({ message: 'Message sent successfully', message });
    } catch (error) {
        console.error('Error sending direct message:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function sendGroupMessage(req, res) {
    try {
        const { conversationId, content } = req.body;
        const senderId = req.user._id;
        const conversation = req.conversation;
        if (!content) {
            return res.status(400).json("Missing content");
        }
        const message = await Message.create({
            conversationId,
            senderId,
            content
        });
        updateConversationLastMessage(conversation, message, senderId);
        await conversation.save();
        emitNewMessage(io, conversation, message);
        return res.status(201).json({ message });
    } catch (error) {
        console.error("An error occurred while sending a group message", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

export async function recallMessagge(req, res) {
    try {
        const { messageId } = req.body;
        const senderId = req.user._id;
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        if (message.senderId.toString() !== senderId.toString()) {
            return res.status(403).json({ message: 'You can only recall your own messages' });
        }
        if (message.isRecalled) {
            return res.status(400).json({ message: 'Message already recalled' });
        }
        if (message.createdAt.getTime() < Date.now() - 60 * 60 * 1000) {
            return res.status(400).json({ message: 'You can only recall messages within 1 hour' });
        }
        const conversation = await Conversation.findById(message.conversationId);
        if (conversation.lastMessage.content === message.content && conversation.lastMessage.createdAt.getTime() === message.createdAt.getTime()) {
            message.content = 'Tin nhắn này đã được thu hồi';
            updateConversationLastMessage(conversation, message, senderId);
            await conversation.save();
        }
        message.content = 'Tin nhắn này đã được thu hồi';
        message.isRecalled = true;
        await message.save();
        conversation.participants.forEach(p => {
            const receiverSocketId = getReceiverSocketId(p.userId._id.toString());
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("recall-message", {
                    conversationId: message.conversationId.toString(),
                    messageId: message._id.toString(),
                    content: "Tin nhắn này đã được thu hồi",
                    isRecalled: true,
                });
            }
        });
        return res.status(200).json({
            success: true,
            message: 'Message recalled successfully'
        });
    } catch (error) {
        console.error('Error recalling message:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}