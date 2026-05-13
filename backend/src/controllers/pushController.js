import { removeSubscription, saveSubscription } from '../services/pushNotificationService.js';
import User from '../models/userModel.js';

export async function saveFcmToken(req, res) {
    try {
        const token = String(req.body?.token || '').trim();
        if (!token) return res.status(400).json({ message: 'token is required.' });

        await User.updateMany(
            { _id: { $ne: req.user._id } },
            { $pull: { fcmTokens: token } }
        );
        await User.updateOne(
            { _id: req.user._id },
            { $addToSet: { fcmTokens: token } }
        );

        return res.status(200).json({ message: 'FCM token saved.' });
    } catch (error) {
        console.error('Save FCM token error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function removeFcmToken(req, res) {
    try {
        const token = String(req.body?.token || '').trim();
        if (!token) return res.status(400).json({ message: 'token is required.' });

        await User.updateOne(
            { _id: req.user._id },
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

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ message: 'Invalid subscription payload.' });
        }

        await saveSubscription(userId, { endpoint, keys, userAgent });
        return res.status(201).json({ message: 'Push subscription saved.' });
    } catch (error) {
        console.error('Subscribe push error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function unsubscribePush(req, res) {
    try {
        const endpoint = req.body?.endpoint;
        if (!endpoint) {
            return res.status(400).json({ message: 'endpoint is required.' });
        }

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
