import { removeSubscription, saveSubscription } from '../services/pushNotificationService.js';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';
import { verifyCallActionToken } from '../utils/callActionToken.js';
import { handlePushCallAction } from '../socket/index.js';

const MAX_FCM_TOKEN_LENGTH = 4096;
const FCM_TOKEN_PATTERN = /^[A-Za-z0-9:_-]+$/;
const MAX_PUSH_ENDPOINT_LENGTH = 2048;
const MAX_PUSH_KEY_LENGTH = 512;
const MAX_PUSH_USER_AGENT_LENGTH = 512;
const PUSH_KEY_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

function normalizeFcmToken(rawToken) {
    const token = String(rawToken || '').trim();
    if (!token) return { error: 'token is required.' };
    if (token.length > MAX_FCM_TOKEN_LENGTH || !FCM_TOKEN_PATTERN.test(token)) {
        return { error: 'Invalid FCM token format.' };
    }
    return { token };
}

function normalizePushEndpoint(rawEndpoint, { required = true } = {}) {
    const endpoint = String(rawEndpoint || '').trim();
    if (!endpoint) {
        return required ? { error: 'endpoint is required.' } : { endpoint: '' };
    }
    if (endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) {
        return { error: `endpoint cannot exceed ${MAX_PUSH_ENDPOINT_LENGTH} characters.` };
    }
    try {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:') {
            return { error: 'endpoint must be a valid HTTPS URL.' };
        }
    } catch {
        return { error: 'endpoint must be a valid HTTPS URL.' };
    }
    return { endpoint };
}

function normalizePushKey(rawKey, fieldName) {
    const value = String(rawKey || '').trim();
    if (!value) return { error: `${fieldName} is required.` };
    if (value.length > MAX_PUSH_KEY_LENGTH || !PUSH_KEY_PATTERN.test(value)) {
        return { error: `Invalid ${fieldName} format.` };
    }
    return { value };
}

function normalizeUserAgent(rawUserAgent) {
    const value = String(rawUserAgent || '').trim();
    return value.slice(0, MAX_PUSH_USER_AGENT_LENGTH);
}

export async function saveFcmToken(req, res) {
    try {
        const { token, error } = normalizeFcmToken(req.body?.token);
        if (error) return res.status(400).json({ message: error });

        await User.updateMany(
            { _id: { $ne: req.user._id } },
            { $pull: { fcmTokens: token } }
        );
        await User.updateOne(
            { _id: req.user._id },
            { $addToSet: { fcmTokens: token } }
        );
        if (req.session?._id) {
            await Session.updateMany(
                { _id: { $ne: req.session._id }, fcmTokens: token },
                { $pull: { fcmTokens: token } }
            );
            await Session.updateOne(
                { _id: req.session._id, userId: req.user._id },
                { $addToSet: { fcmTokens: token } }
            );
        }

        return res.status(200).json({ message: 'FCM token saved.' });
    } catch (error) {
        console.error('Save FCM token error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function removeFcmToken(req, res) {
    try {
        const { token, error } = normalizeFcmToken(req.body?.token);
        if (error) return res.status(400).json({ message: error });

        await User.updateOne(
            { _id: req.user._id },
            { $pull: { fcmTokens: token } }
        );
        await Session.updateMany(
            { userId: req.user._id },
            { $pull: { fcmTokens: token } }
        );

        return res.status(200).json({ message: 'FCM token removed.' });
    } catch (error) {
        console.error('Remove FCM token error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function subscribePush(req, res) {
    try {
        const userId = req.user?._id;
        const { endpoint, keys, userAgent } = req.body || {};

        const endpointResult = normalizePushEndpoint(endpoint);
        if (endpointResult.error) return res.status(400).json({ message: endpointResult.error });

        const p256dhResult = normalizePushKey(keys?.p256dh, 'keys.p256dh');
        if (p256dhResult.error) return res.status(400).json({ message: p256dhResult.error });

        const authResult = normalizePushKey(keys?.auth, 'keys.auth');
        if (authResult.error) return res.status(400).json({ message: authResult.error });

        await saveSubscription(userId, {
            endpoint: endpointResult.endpoint,
            keys: {
                p256dh: p256dhResult.value,
                auth: authResult.value,
            },
            userAgent: normalizeUserAgent(userAgent),
        });
        return res.status(201).json({ message: 'Push subscription saved.' });
    } catch (error) {
        console.error('Subscribe push error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function unsubscribePush(req, res) {
    try {
        const { endpoint, error } = normalizePushEndpoint(req.body?.endpoint);
        if (error) return res.status(400).json({ message: error });

        await removeSubscription(endpoint);
        return res.status(200).json({ message: 'Push subscription removed.' });
    } catch (error) {
        console.error('Unsubscribe push error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export function getVapidPublicKey(req, res) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
        return res.status(503).json({ message: 'VAPID public key is not configured.' });
    }

    return res.status(200).json({ publicKey });
}

export async function handleCallAction(req, res) {
    try {
        const token = String(req.body?.token || '').trim();
        const action = String(req.body?.action || '').trim();
        if (!token || action !== 'decline') {
            return res.status(400).json({ message: 'Invalid call action payload.' });
        }

        const payload = verifyCallActionToken(token);
        if (!payload) {
            return res.status(401).json({ message: 'Invalid or expired call action token.' });
        }

        const handled = await handlePushCallAction(payload, action);
        return res.status(200).json({ handled });
    } catch (error) {
        console.error('Call action error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
