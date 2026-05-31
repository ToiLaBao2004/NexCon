import api from '@/lib/axios';
import { useAuthStore } from '@/stores/useAuthStore';
import { Capacitor } from '@capacitor/core';
import type {
	Conversation,
	ConversationResponse,
	GlobalSearchMessage,
	GlobalSearchPage,
	GlobalSearchResponse,
	Message,
} from '@/types/chat';
import type { SendMessagePayload } from '@/types/store';
import type { ModerationApiErrorPayload } from '@/types/moderation';
import { getApiErrorMessage, getApiMessageText, translateApiMessage } from '@/lib/apiMessage';
import { moderationCategoryLabels } from '@/lib/moderationNotice';

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

type GlobalSearchStreamChunk =
	| { type: 'conversations'; query: string; conversations: GlobalSearchPage<Conversation> }
	| { type: 'messages'; query: string; messages: GlobalSearchPage<GlobalSearchMessage> }
	| { type: 'done'; query: string }
	| { type: 'error'; message: string };

function getApiBaseUrl() {
	return String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
}

function buildStreamUrl(path: string, params: Record<string, string | number | boolean | null | undefined>) {
	const base = getApiBaseUrl();
	const url = new URL(`${base}${path}`, window.location.origin);

	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null || value === '') return;
		url.searchParams.set(key, String(value));
	});

	return url.toString();
}

function resolveErrorMessage(error: any): string {
	const serverMsg = getApiMessageText(error);
	const payload = error?.response?.data as ModerationApiErrorPayload | undefined;
	const normalizedServerMsg = String(serverMsg).trim().toLowerCase();

	if (!navigator.onLine) return 'Không có kết nối mạng.';
	if (payload?.code === 'COMMUNITY_STANDARD_VIOLATION') {
		const category = payload.whatViolated?.category || payload.moderation?.category || 'unknown';
		const label = moderationCategoryLabels[category] || moderationCategoryLabels.unknown || 'Vi phạm tiêu chuẩn cộng đồng';
		const reason = translateApiMessage(
			payload.whatViolated?.reason || payload.moderation?.reason || serverMsg,
			'Nội dung không phù hợp với tiêu chuẩn cộng đồng.'
		);
		return `Nội dung chưa được gửi: ${label}. ${reason}`;
	}
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
	return getApiErrorMessage(error, 'Đã xảy ra lỗi. Vui lòng thử lại.');
}

function createChatError(error: any) {
	const chatError = new Error(resolveErrorMessage(error)) as Error & {
		response?: any;
		details?: any;
		moderation?: any;
		violation?: any;
		restriction?: any;
		code?: string;
	};
	const payload = error?.response?.data;

	chatError.response = error?.response;
	chatError.details = payload;
	chatError.moderation = payload?.moderation;
	chatError.violation = payload?.violation;
	chatError.restriction = payload?.restriction;
	chatError.code = payload?.code;

	return chatError;
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

	async fetchConversation(conversationId: string): Promise<Conversation> {
		const res = await api.get(`/conversations/${conversationId}`);
		return res.data.conversation;
	},

	async globalSearch(
		keyword: string,
		options?: { signal?: AbortSignal; type?: GlobalSearchResponse['type']; cursor?: string | null; limit?: number; includeMessages?: boolean }
	): Promise<GlobalSearchResponse> {
		const res = await api.get('/search/global', {
			params: {
				keyword,
				type: options?.type,
				cursor: options?.cursor || undefined,
				limit: options?.limit,
				includeMessages: options?.includeMessages,
			},
			signal: options?.signal,
		});
		return res.data as GlobalSearchResponse;
	},

	async globalSearchStream(
		keyword: string,
		options: {
			signal?: AbortSignal;
			conversationLimit?: number;
			messageLimit?: number;
			onChunk: (chunk: GlobalSearchStreamChunk) => void;
		}
	): Promise<void> {
		const accessToken = useAuthStore.getState().accessToken;
		const headers: Record<string, string> = {
			Accept: 'application/x-ndjson',
		};

		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
		}
		if (Capacitor.isNativePlatform()) {
			headers['x-client-type'] = 'mobile';
		}

		const response = await fetch(buildStreamUrl('/search/global/stream', {
			keyword,
			conversationLimit: options.conversationLimit,
			messageLimit: options.messageLimit,
		}), {
			method: 'GET',
			credentials: 'include',
			headers,
			signal: options.signal,
		});

		if (!response.ok || !response.body) {
			throw new Error('Không thể tìm kiếm lúc này. Vui lòng thử lại.');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				options.onChunk(JSON.parse(trimmed) as GlobalSearchStreamChunk);
			}
		}

		buffer += decoder.decode();
		if (buffer.trim()) {
			options.onChunk(JSON.parse(buffer.trim()) as GlobalSearchStreamChunk);
		}
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
		if (file) {
			formData.append('file', file);
			formData.append('fileName', file.name);
		}
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
			throw createChatError(error);
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

	async fetchMedia(
		conversationId: string,
		type: 'image' | 'file' | 'link',
		limit = 8,
		cursor?: string,
		filters?: { senderId?: string; fromDate?: string; toDate?: string }
	) {
		const params = new URLSearchParams({ type, limit: String(limit) });
		if (cursor) params.append('cursor', cursor);
		if (filters?.senderId) params.append('senderId', filters.senderId);
		if (filters?.fromDate) params.append('fromDate', filters.fromDate);
		if (filters?.toDate) params.append('toDate', filters.toDate);
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

	async getDisappearingSetting(conversationId: string) {
		const res = await api.get(`/dm/conversations/${conversationId}/disappearing`);
		return res.data as {
			setting: {
				enabled: boolean;
				durationSeconds: number | null;
				enabledBy?: string | null;
				enabledAt?: string | null;
			};
			canManage: boolean;
		};
	},

	async updateDisappearingSetting(
		conversationId: string,
		payload: { enabled: boolean; durationSeconds?: number | null },
	) {
		const res = await api.put(`/dm/conversations/${conversationId}/disappearing`, payload);
		return res.data as {
			setting: {
				enabled: boolean;
				durationSeconds: number | null;
				enabledBy?: string | null;
				enabledAt?: string | null;
			};
			warning?: string | null;
			unchanged?: boolean;
		};
	},

	async reportDisappearingScreenshot(conversationId: string) {
		const res = await api.post(`/dm/conversations/${conversationId}/screenshot`);
		return res.data as { accepted: boolean };
	},
};
