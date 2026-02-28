import User from '../models/userModel.js';

export async function getCurrentUser(req, res) {
    try {
        const user = req.user;
        return res.status(200).json({ user });
    } catch (error) {
        console.error('Get current user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function searchUserByEmailAndPhone (req, res) {
    try {
        const { email, phone } = req.query;

        if (!email && !phone) {
            return res.status(400).json({ message: "Email or phone is required." });
        }
        
        const query = email ? { email } : { phone };

        const user = await User.findOne(query).select('_id displayName email avatarUrl bio phone');
        return res.status(200).json({ user });
    } catch (error) {
        console.error('Search user by email/phone error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}