import Notification from '../models/notificationModel.js';
import { emitToUser } from '../socket/index.js';
import { sendFCMToUser } from './fcmService.js';

export async function createNotification(userId, title, content, linkUrl, options = {}) {
    const notification = new Notification({
        userId,
        title,
        content,
        linkUrl,
        type: options.type || 'generic',
        targetId: options.targetId,
        actorId: options.actorId,
        recipientId: options.recipientId || userId,
        metadata: options.metadata,
        isRead: false
    });
    await notification.save();

    await notification.populate('actorId', 'displayName avatarUrl');

    const delivered = await emitToUser(userId.toString(), 'new-notification', { notification });

    if (!delivered) {
        await sendFCMToUser(userId, {
            title,
            body: content || 'Ban co mot thong bao moi',
            data: {
                url: linkUrl || '/notification',
                notificationId: notification._id.toString(),
                type: notification.type,
            },
        });
    }

    return notification;
};
