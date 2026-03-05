import { create } from 'zustand';
import { toast } from 'sonner';
import { friendService } from '@/services/friendService';
import type { FriendState } from '@/types/store';

export const useFriendStore = create<FriendState>((set) => ({
	loading: false,
	sendingRequest: false,
	friends: [],
	incomingRequests: [],
	sentRequests: [],

	fetchFriends: async () => {
		try {
			const data = await friendService.fetchFriends();
			set({ friends: data.listedFriends || [] });
		} catch (error) {
			console.error('Fetch friends error:', error);
		}
	},

	fetchIncomingRequests: async () => {
		try {
			const data = await friendService.fetchIncomingRequests();
			set({ incomingRequests: data.friendRequests || [] });
		} catch (error) {
			console.error('Fetch incoming requests error:', error);
		}
	},

	fetchSentRequests: async () => {
		try {
			const data = await friendService.fetchSentRequests();
			set({ sentRequests: data.friendRequests || [] });
		} catch (error) {
			console.error('Fetch sent requests error:', error);
		}
	},

	setNickName: async (friendId: string, nickName: string) => {
		try {
			set({ loading: true });
			await friendService.setNickName(friendId, nickName);
			toast.success('Nickname updated.');
		} catch (error: any) {
			console.error('Set nickname error:', error);
			toast.error(
				error.response?.data?.message || 'Failed to update nickname. Please try again.'
			);
			throw error;
		} finally {
			set({ loading: false });
		}
	},

	sendFriendRequest: async (email: string, message?: string) => {
		try {
			set({ sendingRequest: true });
			const data = await friendService.sendFriendRequest(email, message);
			toast.success(data.message || 'Đã gửi lời mời kết bạn!');
		} catch (error: any) {
			console.error('Send friend request error:', error);
			toast.error(
				error.response?.data?.message || 'Gửi lời mời kết bạn thất bại.'
			);
			throw error;
		} finally {
			set({ sendingRequest: false });
		}
	},

	cancelFriendRequest: async (requestId: string) => {
		try {
			set({ loading: true });
			const data = await friendService.cancelFriendRequest(requestId);
			set((state) => ({
				sentRequests: state.sentRequests.filter((r) => r._id !== requestId)
			}));
			toast.success(data.message || 'Đã hủy lời mời kết bạn.');
		} catch (error: any) {
			console.error('Cancel friend request error:', error);
			toast.error(
				error.response?.data?.message || 'Hủy lời mời thất bại.'
			);
			throw error;
		} finally {
			set({ loading: false });
		}
	},

	acceptFriendRequest: async (requestId: string) => {
		try {
			set({ loading: true });
			const data = await friendService.acceptFriendRequest(requestId);
			set((state) => ({
				incomingRequests: state.incomingRequests.filter((r) => r._id !== requestId),
				friends: data.newFriend ? [data.newFriend, ...state.friends] : state.friends
			}));
			toast.success(data.message || 'Đã chấp nhận lời mời kết bạn!');
		} catch (error: any) {
			console.error('Accept friend request error:', error);
			toast.error(
				error.response?.data?.message || 'Chấp nhận lời mời thất bại.'
			);
			throw error;
		} finally {
			set({ loading: false });
		}
	},

	rejectFriendRequest: async (requestId: string) => {
		try {
			set({ loading: true });
			const data = await friendService.rejectFriendRequest(requestId);
			set((state) => ({
				incomingRequests: state.incomingRequests.filter((r) => r._id !== requestId)
			}));
			toast.success(data.message || 'Đã từ chối lời mời kết bạn.');
		} catch (error: any) {
			console.error('Reject friend request error:', error);
			toast.error(
				error.response?.data?.message || 'Từ chối lời mời thất bại.'
			);
			throw error;
		} finally {
			set({ loading: false });
		}
	},

	addIncomingRequest: (request) => {
		set((state) => {
			const exists = state.incomingRequests.some((r) => r._id === request._id);
			if (exists) return state;
			return { incomingRequests: [request, ...state.incomingRequests] };
		});
	},

	removeIncomingRequest: (requestId: string) => {
		set((state) => ({
			incomingRequests: state.incomingRequests.filter((r) => r._id !== requestId)
		}));
	},

	addSentRequest: (request) => {
		set((state) => {
			const exists = state.sentRequests.some((r) => r._id === request._id);
			if (exists) return state;
			return { sentRequests: [request, ...state.sentRequests] };
		});
	},

	removeSentRequest: (requestId: string) => {
		set((state) => ({
			sentRequests: state.sentRequests.filter((r) => r._id !== requestId)
		}));
	},

	addFriend: (friend) => {
		set((state) => {
			const exists = state.friends.some((f) => f.friendId === friend.friendId);
			if (exists) return state;
			return { friends: [friend, ...state.friends] };
		});
	},

	removeFriend: (friendId) => {
		set((state) => ({
			friends: state.friends.filter((f) => f.friendId !== friendId)
		}));
	},

	unfriendUser: async (friendId) => {
		try {
			set({ loading: true });
			const data = await friendService.unfriendUser(friendId);
			set((state) => ({
				friends: state.friends.filter((f) => f.friendId !== friendId)
			}));
			toast.success(data.message || 'Đã hủy kết bạn.');
		} catch (error: any) {
			console.error('Unfriend error:', error);
			toast.error(
				error.response?.data?.message || 'Hủy kết bạn thất bại.'
			);
			throw error;
		} finally {
			set({ loading: false });
		}
	},
}));