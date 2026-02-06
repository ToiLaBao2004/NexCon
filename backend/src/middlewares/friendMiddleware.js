import Friend from '../models/friendModel.js';

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

export async function checkFriendship(req, res, next) {
    try {
        const senderId = req.user._id.toString();
        const recipientId = req.body?.recipientId ?? null;
        if (!recipientId) {
            return res.status(400).json({ message: 'Recipient ID is required.' });
        }
        if (recipientId) {
            const [userA, userB] = pair(senderId, recipientId);
            const friendship = await Friend.findOne({ userA, userB });
            if (!friendship) {
                return res.status(403).json({ message: 'You are not friends with this user.' });
            }
            return next();
        }
    } catch (error) {
        console.error('Error checking friendship:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}