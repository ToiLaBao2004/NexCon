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

export async function searchUserByEmailAndPhone(socket, { query }) {
    if (!query || !query.trim()) {
        socket.emit('search-user-result', { user: null, status: 'empty' });
        return;
    }

    try {
        const isEmail = query.includes('@');
        const searchQuery = isEmail ? { email: query.trim() } : { phone: query.trim() };

        const foundUser = await User.findOne(searchQuery).select('_id displayName email avatarUrl bio phone');

        if (foundUser) {
            socket.emit('search-user-result', { user: foundUser, status: 'found' });
        } else {
            socket.emit('search-user-result', { user: null, status: 'not-found' });
        }
    } catch (error) {
        console.error('Search user by email/phone error:', error);
        socket.emit('search-user-result', { user: null, status: 'error' });
    }
}