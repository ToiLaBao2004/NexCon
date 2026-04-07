import Notification from '../models/notificationModel.js';
import { emitToUser } from '../socket/index.js';

export async function createNotification(userId, title, content, linkUrl) {
    const notification = new Notification({
        userId,
        title,
        content,
        linkUrl,
        isRead: false
    });
    await notification.save();

    emitToUser(userId.toString(), 'new-notification', { notification });

    return notification;
};