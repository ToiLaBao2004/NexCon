import User from '../models/userModel.js';
import BlockUser from "../models/blockUserModel.js";

export async function blockUser(req, res) {
    try {
        const fromUserId = req.user._id;
        const { toUserId } = req.params;
        if (fromUserId.equals(toUserId)) {
            return res.status(400).json({ message: "You cannot block yourself." });
        }
        const targetUser = await User.findById(toUserId).select("displayName email");
        if (!targetUser) {
            return res.status(404).json({ message: "User not found." });
        }
        const existingBlock = await BlockUser.findOne({ from: fromUserId, to: toUserId });
        if (existingBlock) {
            return res.status(400).json({ message: `User ${targetUser.displayName} is already blocked.` });
        }
        await BlockUser.create({ from: fromUserId, to: toUserId });
        return res.status(200).json({ message: `User ${targetUser.displayName} is now blocked.` });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                message: "User is already blocked."
            });
        }
        console.error('Block user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function getCurrentUser(req, res) {
    try {
        const user = req.user;
        return res.status(200).json({ user });
    } catch (error) {
        console.error('Get current user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}