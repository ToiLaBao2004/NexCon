import api from '@/lib/axios';
import type { ConversationResponse, Message } from '@/types/chat';
import type { SendMessagePayload } from '@/types/store';

interface FetchMessageProps {
	messages: Message[];
	cursor?: string;
	pinnedMessages: Message[];
}

const pageLimit = 20;

function resolveErrorMessage(error: any): string {
	const status = error?.response?.status;
	const serverMsg = error?.response?.data?.message ?? '';

	if (!navigator.onLine) return 'Không có kết nối mạng.';
	if (serverMsg) return serverMsg;
	if (status === 403) return 'Bạn không có quyền gửi tin nhắn tới người này.';
	if (status === 413) return 'File quá lớn — vui lòng chọn file nhỏ hơn 10MB.';
	if (status === 400) return 'Dữ liệu gửi lên không hợp lệ.';
	return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

export const chatService = {
	async fetchConversations(): Promise<ConversationResponse> {
		const res = await api.get('/conversations/get-conversations');
		return res.data;
	},

	async fetchMessages(id: string, cursor?: string): Promise<FetchMessageProps> {
		const res = await api.get(`/conversations/${id}/messages?limit=${pageLimit}&cursor=${cursor}`);
		return { messages: res.data.messages, cursor: res.data.nextCursor, pinnedMessages: res.data.pinnedMessages };
	},

	async sendMessage(
		payload: SendMessagePayload,
		onProgress?: (percent: number) => void,
	): Promise<{ message: Message; signedUrl?: string }> {
		const { type, recipientId, conversationId, content, file, replyToMessageId } = payload;

		const formData = new FormData();
		formData.append('type', type);
		if (recipientId) formData.append('recipientId', recipientId);
		if (conversationId) formData.append('conversationId', conversationId);
		if (content) formData.append('content', content);
		if (file) formData.append('file', file);
		if (replyToMessageId) formData.append('replyTo', replyToMessageId);

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

	async updateGroupName(conversationId: string, name: string) {
		const res = await api.put(`/conversations/${conversationId}/update-group-name`, { name });
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
		filters?: { senderId?: string; fromDate?: string; toDate?: string }
	) {
		const params = new URLSearchParams({ conversationId, keyword });
		if (filters?.senderId) params.set('senderId', filters.senderId);
		if (filters?.fromDate) params.set('fromDate', filters.fromDate);
		if (filters?.toDate) params.set('toDate', filters.toDate);
		const res = await api.get(`/messages/search?${params.toString()}`);
		return res.data as { messages: Message[] };
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

	async updateGroupSettings(conversationId: string, isApprovalRequired: boolean) {
		try {
			const res = await api.patch(`/conversations/${conversationId}/settings`, { isApprovalRequired });
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
};