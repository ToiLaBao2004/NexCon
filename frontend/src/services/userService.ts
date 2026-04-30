import api from '@/lib/axios';

export const userService = {
    updateProfile: async (data: { displayName?: string; bio?: string; phone?: string }) => {
        const response = await api.put('/users/update-profile', data);
        return response.data;
    },

    updateAvatar: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/users/update-avatar', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    fetchMe: async () => {
        const response = await api.get('/users/me');
        return response.data.user;
    },

    changePassword: async (data: { currentPassword?: string; newPassword?: string }) => {
        const response = await api.put('/users/change-password', data);
        return response.data;
    },

    searchUsers: async (keyword: string) => {
        const response = await api.get('/users/search', { params: { keyword } });
        return response.data;
    }
};
