import Notification from '../models/notificationModel.js';

export async function createNotification(userId, title, content, linkUrl) {
    const notification = new Notification({
        userId,
        title,
        content,
        linkUrl,
        isRead: false
    });
    await notification.save();
    return notification;
};