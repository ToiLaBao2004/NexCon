import api from '@/lib/axios';

export const notificationService = {
    getNotifications: async (params?: { limit?: number; cursor?: string }) => {
        const query = new URLSearchParams();
        if (params?.limit) query.append('limit', String(params.limit));
        if (params?.cursor) query.append('cursor', params.cursor);
        const response = await api.get(`/notifications?${query}`, { withCredentials: true });
        return response.data as { notifications: any[]; hasMore: boolean; nextCursor: string | null; totalUnreadCount?: number; totalCount?: number };
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
