import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import Friend from '../models/friendModel.js';

export async function createConversation(req, res) {
    try {
        const { type, name, memberIds } = req.body;
        const userId = req.user._id;
        if (!type || (type === 'group' && (!name || name.trim() === '')) || 
            !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ message: 'Group name and members are required.' });
        }
        let conversation;
        if (type === 'direct') {
            const participantId = memberIds[0];
            conversation = await Conversation.findOne({type: 'direct','participants.userId': { $all: [userId, participantId] }});
            if (!conversation) {
                conversation = new Conversation({
                    type: 'direct',
                    participants: [
                        { userId: userId, joinedAt: new Date() }, 
                        { userId: participantId, joinedAt: new Date() }
                    ]});
                conversation = await Conversation.create(conversation);
            }
        }
        if (type === 'group') {
            const participants = memberIds.map(id => ({ userId: id, joinedAt: new Date() }));
            participants.push({ userId: userId, joinedAt: new Date() });
            conversation = new Conversation({
                type: 'group',
                group: { name: name, createdBy: userId },
                participants: participants
            });
            conversation = await Conversation.create(conversation);
        }
        if (!conversation) {
            return res.status(400).json({ message: 'Failed to create conversation.' });
        }
        await conversation.populate([
            { path: 'participants.userId', select: 'displayName avatarUrl' },
            { path: 'seenBy', select: 'displayName avatarUrl' },
            { path: 'lastMessage.senderId', select: 'displayName avatarUrl' }
        ]);
        res.status(201).json({conversation});
    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function getConversations(req, res) {

}

export async function getMessages(req, res) {

}