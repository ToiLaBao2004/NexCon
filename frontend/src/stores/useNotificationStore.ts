import { create } from 'zustand';
import { toast } from 'sonner';
import { notificationService } from '@/services/notificationService';
import type { Notification, NotificationState } from '@/types/store';

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    loading: false,
    unreadCount: 0,

    reset: () => {
        set({
            notifications: [],
            loading: false,
            unreadCount: 0,
        });
    },

    fetchNotifications: async () => {
        try {
            set({ loading: true });
            const notifications = await notificationService.getNotifications();
            const unreadCount = notifications.filter((n: Notification) => !n.isRead).length;
            set({ notifications, unreadCount });
        } catch (error: any) {
            console.error('Fetch notifications error:', error);
            toast.error('Failed to fetch notifications');
        } finally {
            set({ loading: false });
        }
    },

    markAsRead: async (id: string) => {
        try {
            await notificationService.markAsRead(id);
            const { notifications, unreadCount } = get();
            const updatedNotifications = notifications.map((n) =>
                n._id === id ? { ...n, isRead: true } : n
            );
            set({
                notifications: updatedNotifications,
                unreadCount: Math.max(0, unreadCount - 1)
            });
        } catch (error: any) {
            console.error('Mark as read error:', error);
            toast.error('Failed to mark notification as read');
        }
    },

    markAllAsRead: async () => {
        try {
            await notificationService.markAllAsRead();
            const { notifications } = get();
            const updatedNotifications = notifications.map((n) => ({ ...n, isRead: true }));
            set({ notifications: updatedNotifications, unreadCount: 0 });
            toast.success('All notifications marked as read');
        } catch (error: any) {
            console.error('Mark all as read error:', error);
            toast.error('Failed to mark all notifications as read');
        }
    },

    addNotification: (notification: Notification) => {
        const { notifications, unreadCount } = get();
        set({
            notifications: [notification, ...notifications],
            unreadCount: unreadCount + 1,
        });
    },

    setUnreadCount: (count: number) => {
        set({ unreadCount: count });
    },
}));
