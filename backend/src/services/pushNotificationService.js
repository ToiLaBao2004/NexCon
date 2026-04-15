import webpush from 'web-push';
import PushSubscription from '../models/pushSubscriptionModel.js';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidMailto = process.env.VAPID_MAILTO;

if (vapidPublicKey && vapidPrivateKey && vapidMailto) {
    webpush.setVapidDetails(vapidMailto, vapidPublicKey, vapidPrivateKey);
} else {
    console.warn('[push] Missing VAPID env vars. Web push delivery is disabled.');
}

export async function sendPushToUser(userId, payload) {
    if (!vapidPublicKey || !vapidPrivateKey || !vapidMailto) {
        return;
    }

    const subscriptions = await PushSubscription.find({ userId }).lean();
    if (!subscriptions.length) {
        return;
    }

    const message = JSON.stringify({
        title: payload?.title || 'NexCon',
        body: payload?.body || '',
        url: payload?.url || '/',
    });

    for (const subscription of subscriptions) {
        try {
            await webpush.sendNotification(
                {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.keys?.p256dh,
                        auth: subscription.keys?.auth,
                    },
                },
                message
            );
        } catch (error) {
            const statusCode = error?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
                continue;
            }
            console.error(`[push] Send failed for endpoint ${subscription.endpoint}:`, error);
        }
    }
}

export async function saveSubscription(userId, subscription) {
    return PushSubscription.findOneAndUpdate(
        { endpoint: subscription.endpoint },
        {
            $set: {
                userId,
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.keys?.p256dh,
                    auth: subscription.keys?.auth,
                },
                userAgent: subscription.userAgent,
            },
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }
    );
}

export async function removeSubscription(endpoint) {
    return PushSubscription.deleteOne({ endpoint });
}
