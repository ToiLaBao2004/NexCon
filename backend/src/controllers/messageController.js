import Message from '../models/messageModel.js';
import Conversation from '../models/conversationModel.js';
import { emitNewMessage, updateConversationLastMessage } from '../utils/messageHelper.js';
import { io } from '../socket/index.js';
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