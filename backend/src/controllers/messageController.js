import Message from '../models/messageModel.js';
import Conversation from '../models/conversationModel.js';
import { updateConversationLastMessage } from '../utils/messageHelper.js';

export async function sendDirectMessage(req, res) {
    try {
        const senderId = req.user._id;
        const { recipientId, content, conversationId } = req.body;
        if (!content) {
            return res.status(400).json({ message: 'Content are required' });
        }
        let conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            // Create new conversation if it doesn't exist
            conversation = new Conversation({
                type: 'direct',
                participants: [
                    { userId: senderId, joinedAt: new Date() },
                    { userId: recipientId, joinedAt: new Date() }
                ]
            });
            await Conversation.save(conversation);
        }
        const message = new Message({
            conversationId: conversation._id,
            senderId: senderId,
            content: content
        });
        await Message.save(message);
        updateConversationLastMessage(conversation, message, senderId);
        await Conversation.save(conversation);
        res.status(201).json({ message: 'Message sent successfully', message });
    } catch (error) {
        console.error('Error sending direct message:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}