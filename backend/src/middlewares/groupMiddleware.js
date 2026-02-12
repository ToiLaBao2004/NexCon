import Conversation from '../models/conversationModel.js';

export async function checkGroupMembership (req, res, next) {
    try {
        const {conversationId} = req.body;
        const userId = req.user._id;

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        const isMember = conversation.participants.some(
            (p) => p.userId.toString() === userId.toString()
        );

        if (!isMember) {
            return res.status(403).json({ message: "You are not in this group." });
        }

        req.conversation = conversation;

        next();

    } catch (error) {
        console.error("Error in checkGroupMembership:", error);
        return res.status(500).json({ message: "System error" });
    }
}