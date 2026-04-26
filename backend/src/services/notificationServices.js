import Notification from '../models/notificationModel.js';
import { emitToUser } from '../socket/index.js';

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

    emitToUser(userId.toString(), 'new-notification', { notification });

    return notification;
};