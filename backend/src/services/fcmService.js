import { fcm } from '../config/firebase.js';
import User from '../models/userModel.js';

function normalizeData(data = {}) {
    return Object.fromEntries(
        Object.entries(data)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, typeof value === 'string' ? value : String(value)])
    );
}

export async function sendFCMToUser(userId, { title, body, data = {}, dataOnly = false }) {
    try {
        const user = await User.findById(userId).select('fcmTokens');
        if (!user?.fcmTokens?.length) return;

        const validTokens = user.fcmTokens.filter(Boolean);
        if (!validTokens.length) return;
        const isCallPush = data?.type === 'direct-call' || data?.type === 'group-call';

        const androidConfig = {
            priority: 'high',
            ...(isCallPush ? { ttl: 30_000, collapseKey: data.roomName || data.callId || data.conversationId } : {}),
        };

        if (!isCallPush) {
            androidConfig.notification = {
                sound: 'default',
                channelId: 'messages',
            };
        }

        const message = {
            data: normalizeData({
                ...data,
                ...(dataOnly ? { title, body } : {}),
            }),
            android: androidConfig,
            tokens: validTokens,
        };

        if (!dataOnly) {
            message.notification = { title, body };
        }

        const response = await fcm.sendEachForMulticast(message);

        // Xóa token không hợp lệ
        const invalidTokens = [];
        response.responses.forEach((resp, index) => {
            if (!resp.success) {
                const code = resp.error?.code;
                if (
                    code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/registration-token-not-registered'
                ) {
                    invalidTokens.push(validTokens[index]);
                }
            }
        });

        if (invalidTokens.length > 0) {
            await User.updateOne(
                { _id: userId },
                { $pull: { fcmTokens: { $in: invalidTokens } } }
            );
        }
    } catch (error) {
        console.error('FCM send error:', error);
    }
}
