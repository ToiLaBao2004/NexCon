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
	): Promise<Message> {
		const { type, recipientId, conversationId, content, file } = payload;

		const formData = new FormData();
		formData.append('type', type);
		if (recipientId) formData.append('recipientId', recipientId);
		if (conversationId) formData.append('conversationId', conversationId);
		if (content) formData.append('content', content);
		if (file) formData.append('file', file);

		try {
			const res = await api.post('/messages/send', formData, {
				headers: { 'Content-Type': 'multipart/form-data' },
				onUploadProgress: (e) => {
					if (!onProgress || !e.total) return;
					onProgress(Math.round((e.loaded * 100) / e.total));
				},
				timeout: 300_000,
			});
			return res.data.message;
		} catch (error: any) {
			throw new Error(resolveErrorMessage(error));
		}
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
};