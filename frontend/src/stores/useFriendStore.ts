import { create } from 'zustand';
import { toast } from 'sonner';
import { friendService } from '@/services/friendService';
import type { FriendState } from '@/types/store';
import { checkFieldFormat } from '@/lib/fieldFormat';

const MAX_FRIENDS = 500;
const FRIEND_LIMIT_MESSAGE = `Mỗi người chỉ có thể có tối đa ${MAX_FRIENDS} bạn bè.`;
const MAX_PENDING_SENT_REQUESTS = 100;
const PENDING_REQUEST_LIMIT_MESSAGE = `Bạn chỉ có thể có tối đa ${MAX_PENDING_SENT_REQUESTS} lời mời kết bạn đang chờ xử lý.`;

export const useFriendStore = create<FriendState>((set, get) => ({
	loading: false,
	sendingRequest: false,
	friends: [],
	friendsFetched: false,
	incomingRequests: [],
	incomingRequestsFetched: false,
	fetchingIncomingRequests: false,
	sentRequests: [],
	sentRequestsFetched: false,
	fetchingSentRequests: false,
	blockedUsers: [],
	blockedUsersFetched: false,
	blockedBy: [],

	reset: () => {
		set({
			loading: false,
			sendingRequest: false,
			friends: [],
			friendsFetched: false,
			incomingRequests: [],
			incomingRequestsFetched: false,
			sentRequests: [],
			sentRequestsFetched: false,
			blockedUsers: [],
			blockedUsersFetched: false,
			blockedBy: [],
		});
	},

	fetchFriends: async (force = false) => {
		try {
			if (!force && get().friendsFetched) {
				return;
			}

			const data = await friendService.fetchFriends();
			set({ friends: data.listedFriends || [], friendsFetched: true });
		} catch (error) {
			console.error('Lỗi khi tải danh sách bạn bè:', error);
		}
	},

	fetchIncomingRequests: async (force = false) => {
		try {
			if (!force && (get().incomingRequestsFetched || get().fetchingIncomingRequests)) {
				return;
			}

			set({ fetchingIncomingRequests: true });
			const data = await friendService.fetchIncomingRequests();
			set({ incomingRequests: data.friendRequests || [], incomingRequestsFetched: true });
		} catch (error) {
			console.error('Lỗi khi tải lời mời kết bạn đến:', error);
		} finally {
			set({ fetchingIncomingRequests: false });
		}
	},

	fetchSentRequests: async (force = false) => {
		try {
			if (!force && (get().sentRequestsFetched || get().fetchingSentRequests)) {
				return;
			}

			set({ fetchingSentRequests: true });
			const data = await friendService.fetchSentRequests();
			set({ sentRequests: data.friendRequests || [], sentRequestsFetched: true });
		} catch (error) {
			console.error('Lỗi khi tải lời mời kết bạn đi:', error);
		} finally {
			set({ fetchingSentRequests: false });
		}
	},

	setNickName: async (friendId: string, nickName: string) => {
		const nicknameError = checkFieldFormat('nickname', nickName);
		if (nicknameError) {
			toast.error(nicknameError);
			return;
		}

		try {
			set({ loading: true });
			await friendService.setNickName(friendId, nickName);
			toast.success('Biệt danh đã được cập nhật.');
		} catch (error: any) {
			console.error('Lỗi khi đặt biệt danh:', error);
			toast.error(
				error.response?.data?.message || 'Cập nhật biệt danh thất bại. Vui lòng thử lại.'
			);
			throw error;
		} finally {
			set({ loading: false });
		}
	},

	sendFriendRequest: async (email: string, message?: string) => {
		if (get().friends.length >= MAX_FRIENDS) {
			toast.error(FRIEND_LIMIT_MESSAGE);
			return;
		}
		if (get().sentRequests.length >= MAX_PENDING_SENT_REQUESTS) {
			toast.error(PENDING_REQUEST_LIMIT_MESSAGE);
			return;
		}

		try {
			set({ sendingRequest: true });
			const data = await friendService.sendFriendRequest(email, message);
			set((state) => ({
				blockedUsers: state.blockedUsers.filter(u => u.email.toLowerCase() !== email.toLowerCase())
			}));

			toast.success(data.message || 'Đã gửi lời mời kết bạn!');
		} catch (error: any) {
			console.error('Lỗi khi gửi lời mời kết bạn:', error);
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
			console.error('Lỗi khi hủy lời mời kết bạn:', error);
			toast.error(
				error.response?.data?.message || 'Hủy lời mời thất bại.'
			);
			throw error;
		} finally {
			set({ loading: false });
		}
	},

	acceptFriendRequest: async (requestId: string) => {
		if (get().friends.length >= MAX_FRIENDS) {
			toast.error(FRIEND_LIMIT_MESSAGE);
			return;
		}

		try {
			set({ loading: true });
			const data = await friendService.acceptFriendRequest(requestId);
			set((state) => ({
				incomingRequests: state.incomingRequests.filter((r) => r._id !== requestId),
				friends: data.newFriend ? [data.newFriend, ...state.friends] : state.friends
			}));
		} catch (error: any) {
			console.error('Lỗi khi chấp nhận kết bạn:', error);
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
			console.error('Lỗi khi từ chối kết bạn:', error);
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
			if (exists) {
				return {
					incomingRequests: state.incomingRequests.map((r) => r._id === request._id ? request : r)
				};
			}
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
			if (exists) {
				return {
					sentRequests: state.sentRequests.map((r) => r._id === request._id ? request : r)
				};
			}
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
			console.error('Lỗi khi hủy kết bạn:', error);
			toast.error(
				error.response?.data?.message || 'Hủy kết bạn thất bại.'
			);
			throw error;
		} finally {
			set({ loading: false });
		}
	},

	fetchBlockedList: async (force = false) => {
		try {
			if (!force && get().blockedUsersFetched) {
				return;
			}

			const data = await friendService.fetchBlockedList();
			set({ blockedUsers: data.blockedUsers || [], blockedUsersFetched: true });
		} catch (error) {
			console.error('Lỗi khi tải danh sách chặn:', error);
		}
	},

	blockUser: async (userId) => {
		try {
			set({ loading: true });
			const data = await friendService.blockUser(userId);
			set((state) => ({
				blockedUsers: [...state.blockedUsers, data.blockedUser],
				friends: state.friends.filter(f => f.friendId !== userId)
			}));
			toast.success(data.message || 'Đã chặn.');
		} catch (error: any) {
			console.error('Lỗi khi chặn người dùng:', error);
			toast.error(error.response?.data?.message || 'Chặn thất bại.');
		} finally {
			set({ loading: false });
		}
	},

	unblockUser: async (userId) => {
		try {
			set({ loading: true });
			const data = await friendService.unblockUser(userId);
			set((state) => ({
				blockedUsers: state.blockedUsers.filter(u => u._id !== userId)
			}));
			toast.success(data.message || 'Đã bỏ chặn.');
		} catch (error: any) {
			console.error('Lỗi khi bỏ chặn người dùng:', error);
			toast.error(error.response?.data?.message || 'Bỏ chặn thất bại.');
		} finally {
			set({ loading: false });
		}
	},

	addBlockedBy: (userId) => {
		set((state) => ({
			blockedBy: state.blockedBy.includes(userId) ? state.blockedBy : [...state.blockedBy, userId]
		}));
	},

	removeBlockedBy: (userId) => {
		set((state) => ({
			blockedBy: state.blockedBy.filter(id => id !== userId)
		}));
	},
}));
