import Friend from '../models/friendModel.js';

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

export async function checkFriendship(req, res, next) {
    try {
        const senderId = req.user._id.toString();
        const recipientId = req.body?.recipientId ?? null;
        const memberIds = req.body?.memberIds ?? req.body?.userIds ?? [];

        if (!recipientId && memberIds.length === 0) {
            return res.status(400).json({ message: 'Recipient ID or Member ID is required.' });
        }
        if (recipientId) {
            const [userA, userB] = pair(senderId, recipientId);
            const friendship = await Friend.findOne({ userA, userB });
            if (!friendship) {
                return res.status(403).json({ message: 'You are not friends with this user.' });
            }
            return next();
        }
        const friendChecks = memberIds.map(async(memberId) => {
            const [userA, userB] = pair(senderId, memberId);
            const friend = await Friend.findOne({userA, userB});
            return friend ? null : memberId;
        });
        
        const results = await Promise.all(friendChecks);
        const notFriends = results.filter(Boolean);

        if (notFriends.length > 0 ) {
            return res.status(403).json({message:"You can only add your friends to the group", notFriends});
        }

        next();
    } catch (error) {
        console.error('Error checking friendship:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}