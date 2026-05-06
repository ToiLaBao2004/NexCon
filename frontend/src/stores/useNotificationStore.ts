import { create } from 'zustand';
import { toast } from 'sonner';
import { notificationService } from '@/services/notificationService';
import type { Notification, NotificationState } from '@/types/store';

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    loading: false,
    notificationsFetched: false,
    unreadCount: 0,
    pendingReadIds: [],
    markAllPending: false,

    reset: () => {
        set({
            notifications: [],
            loading: false,
            notificationsFetched: false,
            unreadCount: 0,
            pendingReadIds: [],
            markAllPending: false,
        });
    },

    fetchNotifications: async (force = false) => {
        try {
            if (!force && get().notificationsFetched) {
                return;
            }

            set({ loading: true });
            const notifications = await notificationService.getNotifications();
            const unreadCount = notifications.filter((n: Notification) => !n.isRead).length;
            set({ notifications, notificationsFetched: true, unreadCount, pendingReadIds: [], markAllPending: false });
        } catch (error: any) {
            console.error('Lỗi khi tải thông báo:', error);
            toast.error('Không thể lấy thông báo');
        } finally {
            set({ loading: false });
        }
    },

    markAsRead: async (id: string) => {
        const { notifications, unreadCount, pendingReadIds, markAllPending } = get();
        const targetNotification = notifications.find((notification) => notification._id === id);

        if (!targetNotification || targetNotification.isRead || markAllPending || pendingReadIds.includes(id)) {
            return;
        }

        const wasUnreadBeforeUpdate = !targetNotification.isRead;

        set({
            notifications: notifications.map((notification) =>
                notification._id === id ? { ...notification, isRead: true } : notification
            ),
            unreadCount: Math.max(0, unreadCount - 1),
            pendingReadIds: [...pendingReadIds, id],
        });

        try {
            await notificationService.markAsRead(id);
        } catch (error: any) {
            console.error('Lỗi khi đánh dấu là đã đọc:', error);
            toast.error('Không thể đánh dấu thông báo là đã đọc');
            set((state) => {
                const shouldRollback =
                    wasUnreadBeforeUpdate &&
                    state.notifications.some((notification) => notification._id === id && notification.isRead);

                if (!shouldRollback) {
                    return {};
                }

                return {
                    notifications: state.notifications.map((notification) =>
                        notification._id === id ? { ...notification, isRead: false } : notification
                    ),
                    unreadCount: state.unreadCount + 1,
                };
            });
        } finally {
            set((state) => ({
                pendingReadIds: state.pendingReadIds.filter((pendingId) => pendingId !== id),
            }));
        }
    },

    markAllAsRead: async () => {
        const { notifications, pendingReadIds, markAllPending } = get();
        const unreadIds = notifications.filter((notification) => !notification.isRead).map((notification) => notification._id);

        if (markAllPending || unreadIds.length === 0) {
            return;
        }

        set({
            notifications: notifications.map((notification) => ({ ...notification, isRead: true })),
            unreadCount: 0,
            markAllPending: true,
            pendingReadIds: Array.from(new Set([...pendingReadIds, ...unreadIds])),
        });

        try {
            await notificationService.markAllAsRead();
            toast.success('Đã đánh dấu tất cả thông báo là đã đọc');
        } catch (error: any) {
            console.error('Lỗi khi đánh dấu tất cả là đã đọc:', error);
            toast.error('Không thể đánh dấu tất cả thông báo là đã đọc');
            await get().fetchNotifications(true);
        } finally {
            set((state) => ({
                markAllPending: false,
                pendingReadIds: state.pendingReadIds.filter((pendingId) => !unreadIds.includes(pendingId)),
            }));
        }
    },

    addNotification: (notification: Notification) => {
        const { notifications, unreadCount } = get();

        if (notifications.some((existingNotification) => existingNotification._id === notification._id)) {
            return;
        }

        set({
            notifications: [notification, ...notifications],
            unreadCount: notification.isRead ? unreadCount : unreadCount + 1,
        });
    },

    setUnreadCount: (count: number) => {
        set({ unreadCount: count });
    },
}));
