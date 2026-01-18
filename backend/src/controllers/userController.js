export async function getCurrentUser(req, res) {
    try {
        const user = req.user;
        return res.status(200).json({ user });
    } catch (error) {
        console.error('Get current user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function test(req, res) {
    return res.sendStatus(204);
}