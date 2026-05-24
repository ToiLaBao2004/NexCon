import { create } from 'zustand';
import { toast } from 'sonner';
import { friendService } from '@/services/friendService';
import type { FriendState } from '@/types/store';
import { checkFieldFormat } from '@/lib/fieldFormat';
import { getApiErrorMessage, getApiSuccessMessage } from '@/lib/apiMessage';

const MAX_FRIENDS = 500;
const FRIEND_LIMIT_MESSAGE = `Mỗi người chỉ có thể có tối đa ${MAX_FRIENDS} bạn bè.`;
const MAX_PENDING_SENT_REQUESTS = 100;
const PENDING_REQUEST_LIMIT_MESSAGE = `Bạn chỉ có thể có tối đa ${MAX_PENDING_SENT_REQUESTS} lời mời kết bạn đang chờ xử lý.`;
const MAX_FRIEND_REQUEST_MESSAGE_LENGTH = 300;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const useFriendStore = create<FriendState>((set, get) => ({
	loading: false,
	sendingRequest: false,
	friends: [],
	friendsFetched: false,
	friendSuggestions: [],
	friendSuggestionsFetched: false,
	fetchingFriendSuggestions: false,
	incomingRequests: [],
	incomingRequestsFetched: false,
	fetchingIncomingRequests: false,
	sentRequests: [],
	sentRequestsFetched: false,
	fetchingSentRequests: false,
	blockedUsers: [],
	blockedUsersFetched: false,
	fetchingBlockedUsers: false,
	blockedBy: [],

	reset: () => {
		set({
			loading: false,
			sendingRequest: false,
			friends: [],
			friendsFetched: false,
			friendSuggestions: [],
			friendSuggestionsFetched: false,
			fetchingFriendSuggestions: false,
			incomingRequests: [],
			incomingRequestsFetched: false,
			sentRequests: [],
			sentRequestsFetched: false,
			blockedUsers: [],
			blockedUsersFetched: false,
			fetchingBlockedUsers: false,
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

	fetchFriendSuggestions: async (force = false) => {
		try {
			if (!force && (get().friendSuggestionsFetched || get().fetchingFriendSuggestions)) {
				return;
			}

			set({ fetchingFriendSuggestions: true });
			const data = await friendService.fetchFriendSuggestions();
			set({ friendSuggestions: data.suggestions || [], friendSuggestionsFetched: true });
		} catch (error) {
			console.error('Lỗi khi tải gợi ý kết bạn:', error);
		} finally {
			set({ fetchingFriendSuggestions: false });
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
			toast.error(getApiErrorMessage(error, 'Cập nhật biệt danh thất bại. Vui lòng thử lại.'));
			throw error;
		} finally {
			set({ loading: false });
		}
	},

	sendFriendRequest: async (email: string, message?: string) => {
		const normalizedEmail = String(email || '').trim().toLowerCase();
		const normalizedMessage = String(message || '').trim();
		if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
			toast.error('Email không hợp lệ.');
			return;
		}
		if (normalizedMessage.length > MAX_FRIEND_REQUEST_MESSAGE_LENGTH) {
			toast.error(`Lời nhắn kết bạn không được vượt quá ${MAX_FRIEND_REQUEST_MESSAGE_LENGTH} ký tự.`);
			return;
		}
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
			const data = await friendService.sendFriendRequest(normalizedEmail, normalizedMessage || undefined);
			set((state) => ({
				blockedUsers: state.blockedUsers.filter(u => u.email.toLowerCase() !== normalizedEmail),
				friendSuggestions: state.friendSuggestions.filter((suggestion) => suggestion.email.toLowerCase() !== normalizedEmail)
			}));

			toast.success(getApiSuccessMessage(data, 'Đã gửi lời mời kết bạn!'));
		} catch (error: any) {
			console.error('Lỗi khi gửi lời mời kết bạn:', error);
			toast.error(getApiErrorMessage(error, 'Gửi lời mời kết bạn thất bại.'));
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
				sentRequests: state.sentRequests.filter((r) => r._id !== requestId),
				friendSuggestionsFetched: false
			}));
			toast.success(getApiSuccessMessage(data, 'Đã hủy lời mời kết bạn.'));
		} catch (error: any) {
			console.error('Lỗi khi hủy lời mời kết bạn:', error);
			toast.error(getApiErrorMessage(error, 'Hủy lời mời thất bại.'));
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
			toast.error(getApiErrorMessage(error, 'Chấp nhận lời mời thất bại.'));
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
			toast.success(getApiSuccessMessage(data, 'Đã từ chối lời mời kết bạn.'));
		} catch (error: any) {
			console.error('Lỗi khi từ chối kết bạn:', error);
			toast.error(getApiErrorMessage(error, 'Từ chối lời mời thất bại.'));
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
					incomingRequests: state.incomingRequests.map((r) => r._id === request._id ? request : r),
					friendSuggestions: state.friendSuggestions.filter((suggestion) => suggestion._id !== request.from._id)
				};
			}
			return {
				incomingRequests: [request, ...state.incomingRequests],
				friendSuggestions: state.friendSuggestions.filter((suggestion) => suggestion._id !== request.from._id)
			};
		});
	},

	removeIncomingRequest: (requestId: string) => {
		set((state) => ({
			incomingRequests: state.incomingRequests.filter((r) => r._id !== requestId),
			friendSuggestionsFetched: false
		}));
	},

	addSentRequest: (request) => {
		set((state) => {
			const exists = state.sentRequests.some((r) => r._id === request._id);
			if (exists) {
				return {
					sentRequests: state.sentRequests.map((r) => r._id === request._id ? request : r),
					friendSuggestions: state.friendSuggestions.filter((suggestion) => suggestion._id !== request.to._id)
				};
			}
			return {
				sentRequests: [request, ...state.sentRequests],
				friendSuggestions: state.friendSuggestions.filter((suggestion) => suggestion._id !== request.to._id)
			};
		});
	},

	removeSentRequest: (requestId: string) => {
		set((state) => ({
			sentRequests: state.sentRequests.filter((r) => r._id !== requestId),
			friendSuggestionsFetched: false
		}));
	},

	addFriend: (friend) => {
		set((state) => {
			const exists = state.friends.some((f) => f.friendId === friend.friendId);
			if (exists) return state;
			return {
				friends: [friend, ...state.friends],
				friendSuggestions: state.friendSuggestions.filter((suggestion) => suggestion._id !== friend.friendId)
			};
		});
	},

	removeFriend: (friendId) => {
		set((state) => ({
			friends: state.friends.filter((f) => f.friendId !== friendId),
			friendSuggestions: state.friendSuggestions.filter((suggestion) => suggestion._id !== friendId),
			friendSuggestionsFetched: false
		}));
	},

	unfriendUser: async (friendId) => {
		try {
			set({ loading: true });
			const data = await friendService.unfriendUser(friendId);
			set((state) => ({
				friends: state.friends.filter((f) => f.friendId !== friendId),
				friendSuggestionsFetched: false
			}));
			toast.success(getApiSuccessMessage(data, 'Đã hủy kết bạn.'));
		} catch (error: any) {
			console.error('Lỗi khi hủy kết bạn:', error);
			toast.error(getApiErrorMessage(error, 'Hủy kết bạn thất bại.'));
			throw error;
		} finally {
			set({ loading: false });
		}
	},

	fetchBlockedList: async (force = false) => {
		try {
			if (!force && (get().blockedUsersFetched || get().fetchingBlockedUsers)) {
				return;
			}

			set({ fetchingBlockedUsers: true });
			const data = await friendService.fetchBlockedList();
			set({
				blockedUsers: data.blockedUsers || [],
				blockedBy: (data.blockedBy || []).map((id: string) => id.toString()),
				blockedUsersFetched: true
			});
		} catch (error) {
			console.error('Lỗi khi tải danh sách chặn:', error);
		} finally {
			set({ fetchingBlockedUsers: false });
		}
	},

	blockUser: async (userId) => {
		try {
			set({ loading: true });
			const data = await friendService.blockUser(userId);
			set((state) => ({
				blockedUsers: state.blockedUsers.some(u => u._id === userId)
					? state.blockedUsers.map(u => u._id === userId ? data.blockedUser : u)
					: [...state.blockedUsers, data.blockedUser],
				blockedUsersFetched: true,
				friends: state.friends.filter(f => f.friendId !== userId),
				friendSuggestions: state.friendSuggestions.filter((suggestion) => suggestion._id !== userId)
			}));
			toast.success(getApiSuccessMessage(data, 'Đã chặn.'));
		} catch (error: any) {
			console.error('Lỗi khi chặn người dùng:', error);
			toast.error(getApiErrorMessage(error, 'Chặn thất bại.'));
		} finally {
			set({ loading: false });
		}
	},

	unblockUser: async (userId) => {
		try {
			set({ loading: true });
			const data = await friendService.unblockUser(userId);
			set((state) => ({
				blockedUsers: state.blockedUsers.filter(u => u._id !== userId),
				blockedUsersFetched: true,
			}));
			toast.success(getApiSuccessMessage(data, 'Đã bỏ chặn.'));
		} catch (error: any) {
			console.error('Lỗi khi bỏ chặn người dùng:', error);
			toast.error(getApiErrorMessage(error, 'Bỏ chặn thất bại.'));
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
