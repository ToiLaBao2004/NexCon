import api from '@/lib/axios';
import type { UserMusic, UserPresenceStatus, UserStatusMode } from '@/types/user';

export const userService = {
    updateProfile: async (data: { displayName?: string; bio?: string; phone?: string }) => {
        const response = await api.put('/users/update-profile', data);
        return response.data;
    },

    updateAvatar: async (file: File, onProgress?: (percent: number) => void) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/users/update-avatar', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (event) => {
                if (!onProgress || !event.total) return;
                onProgress(Math.round((event.loaded * 100) / event.total));
            },
        });
        return response.data;
    },

    fetchMe: async () => {
        const response = await api.get('/users/me');
        return response.data.user;
    },

    fetchMyStatus: async () => {
        const response = await api.get('/users/me/status');
        return response.data.presence;
    },

    updateMyStatus: async (data: {
        status_mode?: UserStatusMode;
        manual_status?: Exclude<UserPresenceStatus, 'offline'>;
        show_activity?: boolean;
    }) => {
        const response = await api.patch('/users/me/status', data);
        return response.data.presence;
    },

    changePassword: async (data: { currentPassword?: string; newPassword?: string; confirmNewPassword?: string }) => {
        const response = await api.put('/users/change-password', data);
        return response.data;
    },

    searchMusic: async (q: string): Promise<UserMusic[]> => {
        const response = await api.get('/users/music/search', {
            params: { q },
        });

        return response.data.tracks;
    },

    updateMusic: async (music: UserMusic) => {
        const response = await api.put('/users/me/music', music);
        return response.data;
    },

    removeMusic: async () => {
        const response = await api.delete('/users/me/music');
        return response.data;
    },

    searchUsers: async (keyword: string) => {
        const response = await api.get('/users/search', { params: { keyword } });
        return response.data;
    },

    getUserById: async (id: string) => {
        const response = await api.get(`/users/get-user-by-id/${id}`);
        return response.data.user;
    }
};
