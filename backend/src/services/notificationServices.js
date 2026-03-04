import Notification from '../models/notificationModel.js';
import { io, getReceiverSocketId } from '../socket/index.js';

export async function createNotification(userId, title, content, linkUrl) {
    const notification = new Notification({
        userId,
        title,
        content,
        linkUrl,
        isRead: false
    });
    await notification.save();

    const receiverSocketId = getReceiverSocketId(userId.toString());
    if (receiverSocketId) {
        io.to(receiverSocketId).emit("new-notification", { notification });
    }

    return notification;
};