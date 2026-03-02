import api from '@/lib/axios';

export const friendService = {
	sendFriendRequest: async (email: string, message?: string) => {
		const response = await api.post('/friends/send-request', { email, message });
		return response.data;
	},

	cancelFriendRequest: async (requestId: string) => {
		const response = await api.delete(`/friends/cancel-request/${requestId}`);
		return response.data;
	},

	acceptFriendRequest: async (requestId: string) => {
		const response = await api.post(`/friends/accept-request/${requestId}`);
		return response.data;
	},

	rejectFriendRequest: async (requestId: string) => {
		const response = await api.post(`/friends/reject-request/${requestId}`);
		return response.data;
	},

	fetchIncomingRequests: async () => {
		const response = await api.get('/friends/requests');
		return response.data;
	},

	fetchSentRequests: async () => {
		const response = await api.get('/friends/requests-sended');
		return response.data;
	},

	fetchFriends: async () => {
		const response = await api.get('/friends/get-friends');
		return response.data;
	},

	setNickName: async (friendId: string, nickname: string) => {
		const response = await api.post(`/friends/set-nickname/${friendId}`, { nickname });
		return response.data;
	}
};