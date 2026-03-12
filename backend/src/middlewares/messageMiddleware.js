import Conversation from '../models/conversationModel.js';
import Friend from '../models/friendModel.js';

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

export async function checkMessagePermission(req, res, next) {
    try {
        const senderId = req.user._id.toString();
        const { recipientId, conversationId } = req.body;

        if (recipientId) {
            const [userA, userB] = pair(senderId, recipientId);
            const friendship = await Friend.findOne({ userA, userB });
            if (!friendship) {
                return res.status(403).json({ message: 'You are not friends with this user.' });
            }

            const conversation = await Conversation.findOne({
                type: 'direct',
                'participants.userId': { $all: [senderId, recipientId] },
            });
            req.conversation = conversation ?? null;
            req.messageTarget = 'direct';
            return next();
        }

        if (conversationId) {
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found.' });
            }

            const isMember = conversation.participants.some(
                (p) => p.userId.toString() === senderId
            );
            if (!isMember) {
                return res.status(403).json({ message: 'You are not in this group.' });
            }

            req.conversation = conversation;
            req.messageTarget = 'group';
            return next();
        }

        return res.status(400).json({
            message: 'Either recipientId (direct) or conversationId (group) is required.',
        });
    } catch (error) {
        console.error('Error in checkMessagePermission:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
