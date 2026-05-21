import api from '@/lib/axios';
import type { ConversationResponse, Message } from '@/types/chat';
import type { SendMessagePayload } from '@/types/store';

interface FetchMessagesParams {
	conversationId: string;
	cursor?: string;
	before?: string;
	after?: string;
	aroundId?: string;
	limit?: number;
}

interface FetchMessageProps {
	messages: Message[];
	cursor?: string;
	pinnedMessages: Message[];
	hasMore?: boolean;
}

const pageLimit = 20;

function resolveErrorMessage(error: any): string {
	const status = error?.response?.status;
	const serverMsg = error?.response?.data?.message ?? '';
	const normalizedServerMsg = String(serverMsg).trim().toLowerCase();

	if (!navigator.onLine) return 'Không có kết nối mạng.';
	if (normalizedServerMsg.includes('not friends')) {
		return 'Bạn chỉ có thể nhắn tin cho bạn bè. Hãy kết bạn trước khi gửi tin nhắn.';
	}
	if (normalizedServerMsg.includes('not in this group') || normalizedServerMsg.includes('not a member')) {
		return 'Bạn không còn là thành viên của cuộc trò chuyện này.';
	}
	if (normalizedServerMsg.includes('conversation not found')) {
		return 'Không tìm thấy cuộc trò chuyện này.';
	}
	if (normalizedServerMsg.includes('recipientid') || normalizedServerMsg.includes('conversationid')) {
		return 'Thiếu thông tin người nhận. Vui lòng thử lại.';
	}
	if (serverMsg) return serverMsg;
	if (status === 403) return 'Bạn không có quyền gửi tin nhắn tới người này.';
	if (status === 413) return 'File quá lớn — vui lòng chọn file nhỏ hơn 10MB.';
	if (status === 400) return 'Dữ liệu gửi lên không hợp lệ.';
	return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

export const chatService = {
	async fetchConversations(params?: { limit?: number; cursor?: string }): Promise<ConversationResponse> {
		const query = new URLSearchParams();
		if (params?.limit) query.append('limit', String(params.limit));
		if (params?.cursor) query.append('cursor', params.cursor);
		const res = await api.get(`/conversations/get-conversations?${query}`);
		return res.data;
	},

	async fetchGroups(params?: { limit?: number; cursor?: string; search?: string }) {
		const query = new URLSearchParams();
		if (params?.limit) query.append('limit', String(params.limit));
		if (params?.cursor) query.append('cursor', params.cursor);
		if (params?.search) query.append('search', params.search);
		const res = await api.get(`/conversations/get-groups?${query}`);
		return res.data as { groups: any[]; hasMore: boolean; nextCursor: string | null };
	},

	async fetchMessages(params: FetchMessagesParams): Promise<FetchMessageProps & { anchorId?: string, hasMoreOlder?: boolean, hasMoreNewer?: boolean }> {
		const { conversationId, cursor, before, after, aroundId, limit = pageLimit } = params;
		const query = new URLSearchParams();
		query.append('limit', String(limit));
		if (cursor) query.append('cursor', cursor);
		if (before) query.append('before', before);
		if (after) query.append('after', after);
		if (aroundId) query.append('aroundId', aroundId);

		const res = await api.get(`/conversations/${conversationId}/messages?${query.toString()}`);
		return {
			messages: res.data.messages,
			cursor: res.data.nextCursor,
			pinnedMessages: res.data.pinnedMessages,
			anchorId: res.data.anchorId,
			hasMoreOlder: res.data.hasMoreOlder,
			hasMoreNewer: res.data.hasMoreNewer,
			hasMore: res.data.hasMore
		} as any;
	},


	async sendMessage(
		payload: SendMessagePayload,
		onProgress?: (percent: number) => void,
	): Promise<{ message: Message; signedUrl?: string }> {
		const { type, recipientId, conversationId, content, file, replyToMessageId, mentions, metadata } = payload;

		const formData = new FormData();
		formData.append('type', type);
		if (recipientId) formData.append('recipientId', recipientId);
		if (conversationId) formData.append('conversationId', conversationId);
		if (content) formData.append('content', content);
		if (file) formData.append('file', file);
		if (replyToMessageId) formData.append('replyTo', replyToMessageId);
		if (Array.isArray(mentions) && mentions.length > 0) {
			formData.append('mentions', JSON.stringify(mentions));
		}
		if (metadata && Object.keys(metadata).length > 0) {
			formData.append('metadata', JSON.stringify(metadata));
		}

		try {
			const res = await api.post('/messages/send', formData, {
				headers: { 'Content-Type': 'multipart/form-data' },
				onUploadProgress: (e) => {
					if (!onProgress || !e.total) return;
					onProgress(Math.round((e.loaded * 100) / e.total));
				},
				timeout: 300_000,
			});
			return { message: res.data.message, signedUrl: res.data.signedUrl };
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async createReminderSystemMessage(payload: {
		conversationId: string;
		reminderId?: string;
		reminderContent?: string;
		remindAt?: string;
	}) {
		const res = await api.post('/messages/system/reminder-created', payload);
		return res.data as {
			message: Message;
			conversation: {
				_id: string;
				lastMessage: any;
				lastMessageAt?: string;
			};
			unreadCounts: Record<string, number>;
		};
	},

	async fetchMedia(conversationId: string, type: 'image' | 'file' | 'link', limit = 8, cursor?: string) {
		const params = new URLSearchParams({ type, limit: String(limit) });
		if (cursor) params.append('cursor', cursor);
		const res = await api.get(`/conversations/${conversationId}/media?${params}`);
		return res.data as { messages: Message[]; nextCursor: string | null };
	},

	async markAsSeen(conversationId: string) {
		const res = await api.patch(`/conversations/${conversationId}/mark-seen`);
		return res.data;
	},

	async markAsUnread(conversationId: string) {
		const res = await api.patch(`/conversations/${conversationId}/mark-unread`);
		return res.data;
	},

	async toggleConversationPin(conversationId: string) {
		const res = await api.patch(`/conversations/${conversationId}/pin`);
		return res.data as {
			message: string;
			conversation: {
				_id: string;
				isPinned: boolean;
				pinnedAt: string | null;
			};
		};
	},

	async updateGroupName(conversationId: string, name: string) {
		const res = await api.put(`/conversations/${conversationId}/update-group-name`, { name });
		return res.data;
	},

	async updateGroupAvatar(conversationId: string, file: File, onProgress?: (percent: number) => void) {
		const formData = new FormData();
		formData.append('file', file);

		const res = await api.post(`/conversations/${conversationId}/update-group-avatar`, formData, {
			headers: { 'Content-Type': 'multipart/form-data' },
			onUploadProgress: (event) => {
				if (!onProgress || !event.total) return;
				onProgress(Math.round((event.loaded * 100) / event.total));
			},
		});

		return res.data;
	},

	async createConversation(type: 'direct' | 'group', memberIds: string[], name?: string) {
		const res = await api.post('/conversations/create-conversation', { type, memberIds, name });
		return res.data;
	},

	async disbandGroup(conversationId: string) {
		try {
			const res = await api.delete(`/conversations/${conversationId}/disband-group`);
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async clearConversation(conversationId: string) {
		try {
			const res = await api.delete(`/conversations/${conversationId}/clear`);
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async recallMessage(messageId: string) {
		try {
			const res = await api.put('/messages/recall', { messageId });
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async pinMessage(messageId: string) {
		try {
			const res = await api.put('/messages/pin', { messageId });
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async searchMessages(
		conversationId: string,
		keyword: string,
		filters?: { senderId?: string; fromDate?: string; toDate?: string },
		options?: { limit?: number; cursor?: string | null }
	) {
		const params = new URLSearchParams({ conversationId, keyword });
		if (filters?.senderId) params.set('senderId', filters.senderId);
		if (filters?.fromDate) params.set('fromDate', filters.fromDate);
		if (filters?.toDate) params.set('toDate', filters.toDate);
		if (options?.limit) params.set('limit', String(options.limit));
		if (options?.cursor) params.set('cursor', options.cursor);
		const res = await api.get(`/messages/search?${params.toString()}`);
		return res.data as { messages: Message[]; hasMore?: boolean; nextCursor?: string | null };
	},

	async reactToMessage(messageId: string, emoji: string) {
		try {
			const res = await api.put(`/messages/${messageId}/react`, { emoji });
			return res.data as { reactions: { userId: string; emoji: string }[] };
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async getSignedMediaUrl(messageId: string) {
		try {
			const res = await api.get(`/messages/${messageId}/media-url`);
			return res.data as { url: string };
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async addMembers(conversationId: string, userIds: string[]) {
		try {
			const res = await api.post(`/conversations/${conversationId}/add-members`, { userIds });
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async updateGroupSettings(
		conversationId: string,
		settings: {
			isApprovalRequired?: boolean;
			allowMembersChangeAvatar?: boolean;
			allowMembersCreateSharedReminder?: boolean;
		}
	) {
		try {
			const res = await api.patch(`/conversations/${conversationId}/settings`, settings);
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async getApprovalQueue(conversationId: string) {
		try {
			const res = await api.get(`/conversations/${conversationId}/approvals`);
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async handleApproval(conversationId: string, userId: string, action: 'approve' | 'reject') {
		try {
			const res = await api.post(`/conversations/${conversationId}/approvals`, { userId, action });
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async removeMember(conversationId: string, memberId: string) {
		try {
			const res = await api.delete(`/conversations/${conversationId}/members/${memberId}`);
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},
	async transferAdminRole(conversationId: string, memberId: string) {
		try {
			const res = await api.patch(`/conversations/${conversationId}/admins/${memberId}`);
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async leaveGroup(conversationId: string, silent: boolean = false, newAdminId?: string) {
		try {
			const res = await api.delete(`/conversations/${conversationId}/leave`, { data: { silent, newAdminId } });
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async forwardMessage(
		messageId: string,
		targetConversationIds: string[],
		forwardBatch?: { clientBatchId?: string | null; clientBatchIndex?: number; clientBatchSize?: number }
	): Promise<{ forwarded: number; results: any[]; errors: { conversationId: string; reason: string }[] }> {
		try {
			const res = await api.post(`/messages/${messageId}/forward`, {
				targetConversationIds,
				...(forwardBatch ? { forwardBatch } : {}),
			});
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},

	async updateConversationMute(
		conversationId: string,
		target: 'messages' | 'meetings' | 'both',
		duration: '1h' | '8h' | '24h' | 'forever' | 'off'
	) {
		try {
			const res = await api.patch(`/conversations/${conversationId}/mute`, { target, duration });
			return res.data;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
	},
};
