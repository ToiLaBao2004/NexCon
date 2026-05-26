import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';
import { getUserModerationDetails } from '../services/moderation/violationService.js';

const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS || 5000);
const AUTH_CACHE_MAX_ENTRIES = Number(process.env.AUTH_CACHE_MAX_ENTRIES || 5000);
const userCache = new Map();
const sessionCache = new Map();

function getCached(cache, key) {
    if (!AUTH_CACHE_TTL_MS || AUTH_CACHE_TTL_MS < 1) return null;

    const cached = cache.get(key);
    if (!cached || cached.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }

    return cached.value;
}

function setCached(cache, key, value) {
    if (!AUTH_CACHE_TTL_MS || AUTH_CACHE_TTL_MS < 1 || !value) return value;

    if (cache.size >= AUTH_CACHE_MAX_ENTRIES) {
        cache.clear();
    }

    cache.set(key, {
        value,
        expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    });
    return value;
}

async function getAuthenticatedUser(userId) {
    const key = userId?.toString?.() || String(userId || '');
    const cached = getCached(userCache, key);
    if (cached) return cached;

    const user = await User.findById(userId).select('-password').lean();
    return setCached(userCache, key, user);
}

async function getAuthenticatedSession(userId, sessionId) {
    const key = `${userId}:${sessionId}`;
    const cached = getCached(sessionCache, key);
    if (cached) return cached;

    const session = await Session.findOne({
        _id: sessionId,
        userId,
    }).select('_id userId expiresAt').lean();
    return setCached(sessionCache, key, session);
}

export async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization; // Bearer <token>
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Authorization header missing or malformed.' });
        }
        const token = authHeader.split(' ')[1];
        const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const [user, session] = await Promise.all([
            getAuthenticatedUser(payload.userId),
            getAuthenticatedSession(payload.userId, payload.sessionId),
        ]);
        if (!user) {
            return res.status(401).json({ message: 'User not found.' });
        }
        if (user.lock?.isLocked) {
            const moderation = await getUserModerationDetails(user._id, { limit: 10 });
            return res.status(423).json({
                success: false,
                locked: true,
                title: 'Tài khoản đang bị hạn chế',
                message: moderation.restriction.reason || user.lock.reason || 'Tài khoản của bạn đang bị khóa.',
                restriction: moderation.restriction,
                violationSummary: moderation.summary,
                violationHistory: moderation.history,
                appeal: moderation.appeal,
            });
        }
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
