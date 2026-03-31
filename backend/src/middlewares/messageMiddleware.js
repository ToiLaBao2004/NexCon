import Conversation from '../models/conversationModel.js';
import Friend from '../models/friendModel.js';
import Message from '../models/messageModel.js';

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

            if (conversation.type === 'group' && conversation.disbanded === true) {
                return res.status(403).json({ message: 'Nhóm này đã bị giải tán, bạn không thể thực hiện thao tác.' });
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

export async function checkConversationMembership(req, res, next) {
    try {
        const messageId = req.params.messageId || req.body.messageId;
        const userId = req.user._id.toString();

        if (!messageId) {
            return res.status(400).json({ message: 'messageId is required.' });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Message not found.' });
        }

        const conversation = await Conversation.findById(message.conversationId);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        if (conversation.type === 'group' && conversation.disbanded === true) {
            return res.status(403).json({ message: 'Nhóm này đã bị giải tán, bạn không thể thực hiện thao tác.' });
        }

        const isMember = conversation.participants.some(
            (p) => p.userId.toString() === userId
        );
        if (!isMember) {
            return res.status(403).json({ message: 'You are not a member of this conversation.' });
        }
        req.message = message;
        req.conversation = conversation;
        return next();
    } catch (error) {
        console.error('Error in checkConversationMembership:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
