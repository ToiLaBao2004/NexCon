import Notification from '../models/notificationModel.js';

export async function getNotifications(req, res) {
    try {
        const userId = req.user._id;
        const notifications = await Notification.find({ userId: userId }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, notifications });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
}

export async function markAsRead(req, res) {
    try {
        const notificationId = req.params.id;
        const notification = await Notification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        notification.isRead = true;
        await notification.save();
        res.status(200).json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
    }
}

export async function markAllAsRead(req, res) {
    try {
        const userId = req.user._id;
        await Notification.updateMany({ userId: userId, isRead: false }, { isRead: true });
        res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
    }
}

export async function markAsUnread(req, res) {
    try {
        const notificationId = req.params.id;
        const notification = await Notification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        notification.isRead = false;
        await notification.save();
        res.status(200).json({ success: true, message: 'Notification marked as unread' });
    } catch (error) {
        console.error('Error marking notification as unread:', error);
        res.status(500).json({ success: false, message: 'Failed to mark notification as unread' });
    }
}