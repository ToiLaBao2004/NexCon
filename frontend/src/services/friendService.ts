import api from '@/lib/axios';

export const friendService = {
	setNickName: async (friendId: string, nickname: string) => {
		const response = await api.post(`/friends/set-nickname/${friendId}`, { nickname }, { withCredentials: true });
		return response.data;
	}
};