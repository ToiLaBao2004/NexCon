import api from '@/lib/axios';

export const notificationService = {
    getNotifications: async () => {
        const response = await api.get('/notifications', { withCredentials: true });
        return response.data.notifications;
    },

    markAsRead: async (id: string) => {
        const response = await api.put(`/notifications/${id}/mark-as-read`, {}, { withCredentials: true });
        return response.data;
    },

    markAllAsRead: async () => {
        const response = await api.patch('/notifications/mark-all-as-read', {}, { withCredentials: true });
        return response.data;
    },
};
