import Notification from '../models/notificationModel.js';
import { emitToUser } from '../socket/index.js';

export async function getNotifications(req, res) {
    try {
        const userId = req.user._id;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const cursor = req.query.cursor;

        const query = { userId };
        if (cursor) {
            const d = new Date(cursor);
            if (!isNaN(d.getTime())) query.createdAt = { $lt: d };
        }

        const [raw, totalUnreadCount, totalCount] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .limit(limit + 1)
                .lean(),
            Notification.countDocuments({ userId, isRead: false }),
            Notification.countDocuments({ userId }),
        ]);

        const hasMore = raw.length > limit;
        if (hasMore) raw.pop();
        const nextCursor = hasMore && raw.length > 0
            ? raw[raw.length - 1].createdAt
            : null;

        res.status(200).json({ success: true, notifications: raw, hasMore, nextCursor, totalUnreadCount, totalCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
}

export async function markAsRead(req, res) {
    try {
        const notificationId = req.params.id;
        const userId = req.user._id.toString();
        const notification = await Notification.findOne({ _id: notificationId, userId });
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        notification.isRead = true;
        await notification.save();
        emitToUser(userId, 'notification-updated', { notification });
        res.status(200).json({ success: true, message: 'Notification marked as read', notification });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
    }
}

export async function markAllAsRead(req, res) {
    try {
        const userId = req.user._id.toString();
        await Notification.updateMany({ userId: userId, isRead: false }, { isRead: true });
        emitToUser(userId, 'notifications-all-read', {});
        res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
    }
}

export async function markAsUnread(req, res) {
    try {
        const notificationId = req.params.id;
        const userId = req.user._id.toString();
        const notification = await Notification.findOne({ _id: notificationId, userId });
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        notification.isRead = false;
        await notification.save();
        emitToUser(userId, 'notification-updated', { notification });
        res.status(200).json({ success: true, message: 'Notification marked as unread', notification });
    } catch (error) {
        console.error('Error marking notification as unread:', error);
        res.status(500).json({ success: false, message: 'Failed to mark notification as unread' });
    }
}

export async function deleteNotification(req, res) {
    try {
        const notificationId = req.params.id;
        const userId = req.user._id.toString();
        const notification = await Notification.findOne({ _id: notificationId, userId });
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        await Notification.deleteOne({ _id: notificationId });
        emitToUser(userId, 'notification-deleted', { id: notificationId });
        res.status(200).json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ success: false, message: 'Failed to delete notification' });
    }
}
