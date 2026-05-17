import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';

export async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization; // Bearer <token>
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Authorization header missing or malformed.' });
        }
        const token = authHeader.split(' ')[1];
        const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(payload.userId).select('-password');
        if (!user) {
            return res.status(401).json({ message: 'User not found.' });
        }
        if (user.lock?.isLocked) {
            return res.status(423).json({
                success: false,
                locked: true,
                message: user.lock.reason || 'Tài khoản của bạn đang bị khóa.',
            });
        }
        const session = await Session.findById(payload.sessionId);
        if (!session || session.expiresAt < Date.now()) {
            return res.status(401).json({ message: 'Session expired or not found.' });
        }
        req.user = user;
        req.session = session;
        req.sessionId = session._id.toString();
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired' });
        }
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
}
