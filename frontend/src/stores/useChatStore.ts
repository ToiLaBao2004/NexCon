import { chatService } from '@/services/chatService';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiMessage';
import type { ChatState, DraftInfo, SendMessagePayload } from '@/types/store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';
import useMediaCacheStore from './useMediaCacheStore';
import type { Reminder } from '@/types/reminder';
import type { Conversation } from '@/types/chat';
import { DISAPPEARED_MESSAGE_PLACEHOLDER } from '@/utils/disappearingMessages';

const MAX_PINNED_CONVERSATIONS = 5;

const getReminderContent = (reminder: Reminder): string => {
    const content = String(reminder.content || '').trim();
    if (content) return content;
    return [reminder.title, reminder.note].filter(Boolean).join('\n').trim();
};

const sortConversations = (conversations: any[]) => {
    return [...conversations].sort((a, b) => {
        const aPinned = a.isPinned === true;
        const bPinned = b.isPinned === true;

        if (aPinned !== bPinned) {
            return aPinned ? -1 : 1;
        }

        if (aPinned && bPinned) {
            const aPinnedAt = new Date(a.pinnedAt || 0).getTime();
            const bPinnedAt = new Date(b.pinnedAt || 0).getTime();
            if (aPinnedAt !== bPinnedAt) {
                return bPinnedAt - aPinnedAt;
            }
        }

        const aTime = new Date(a.lastMessage?.createdAt || a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.lastMessage?.createdAt || b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
    });
};

const buildLastMessageFromMessage = (message: any) => {
    if (!message?._id) return null;

    return {
        _id: message._id,
        content: message.content ?? '',
        type: message.type,
        systemType: message.systemType ?? null,
        metadata: message.metadata,
        mentions: message.mentions ?? [],
        createdAt: message.createdAt ?? new Date().toISOString(),
        senderId: message.senderId,
        deliveredTo: message.deliveredTo ?? [],
        fileName: message.fileName,
        fileSize: message.fileSize,
        mimeType: message.mimeType,
    };
};

export const buildConversationPatchFromMessage = (message: any) => {
    const conversationId = message?.conversationId?.toString?.() || message?.conversationId;
    const lastMessage = buildLastMessageFromMessage(message);
    if (!conversationId || !lastMessage) return null;

    return {
        _id: conversationId,
        lastMessage,
        lastMessageAt: lastMessage.createdAt,
        updatedAt: lastMessage.createdAt,
    };
};

const getMessageSenderId = (message: any) => {
    const sender = message?.senderId;
    return String(sender?._id || sender || "");
};

const isValidDateCursor = (value?: string | null) => {
    if (!value) return false;
    return !Number.isNaN(new Date(value).getTime());
};

const getMessageCreatedAtCursor = (message: any) => {
    const createdAt = message?.createdAt?.toISOString?.() || message?.createdAt;
    return isValidDateCursor(createdAt) ? String(createdAt) : null;
};

const resolveMessagePaginationCursor = (cursor: string | null | undefined, items: any[]) => {
    if (!cursor) return cursor ?? null;
    if (isValidDateCursor(cursor)) return cursor;

    const cursorMessage = items.find((message) => String(message?._id || "") === String(cursor));
    return getMessageCreatedAtCursor(cursorMessage);
};

const canUseOptimisticSlot = (optimistic: any, incoming: any) => {
    if (optimistic?.status !== 'sending') return false;
    if (!incoming?._id) return false;
    if (optimistic.type !== incoming.type) return false;
    if (getMessageSenderId(optimistic) !== getMessageSenderId(incoming)) return false;
    if ((optimistic.content ?? null) !== (incoming.content ?? null)) return false;

    if (optimistic.fileName && incoming.fileName && optimistic.fileName !== incoming.fileName) return false;
    if (optimistic.fileSize && incoming.fileSize && optimistic.fileSize !== incoming.fileSize) return false;

    const optimisticTime = new Date(optimistic.createdAt || 0).getTime();
    const incomingTime = new Date(incoming.createdAt || 0).getTime();
    if (optimisticTime && incomingTime && Math.abs(incomingTime - optimisticTime) > 120000) return false;

    return true;
};

const resolveCompletedOptimisticItems = (
    items: any[],
    optimisticIndex: number,
    existingIndex: number,
    completedMessage: any
) => {
    if (existingIndex !== -1) {
        return items
            .filter((_, index) => index !== optimisticIndex)
            .map((message) => message._id === completedMessage._id ? { ...message, ...completedMessage } : message);
    }

    if (optimisticIndex === -1) {
        return [...items, completedMessage];
    }

    const shouldMoveToCompletionPosition = optimisticIndex < items.length - 1;
    if (!shouldMoveToCompletionPosition) {
        return items.map((message, index) => index === optimisticIndex ? { ...message, ...completedMessage } : message);
    }

    const withoutOptimistic = items.filter((_, index) => index !== optimisticIndex);
    return [...withoutOptimistic, completedMessage];
};

const isVisibleConversation = (conversation: any) => {
    return !(conversation?.type === 'group' && conversation?.disbanded === true);
};

const filterVisibleConversations = (conversations: any[]) => {
    return conversations.filter(isVisibleConversation);
};

const normalizeNickname = (nickname?: string | null) => {
    const value = String(nickname ?? '').trim();
    return value || null;
};

const getParticipantUserId = (participant: any) => {
    const userId = participant?.userId;
    return String(userId?._id || userId || '');
};

const patchParticipantNickname = (conversation: any, friendId: string, nickname?: string | null) => {
    const normalizedFriendId = String(friendId || '');
    if (!normalizedFriendId || !Array.isArray(conversation?.participants)) return conversation;

    const nextNickname = normalizeNickname(nickname);
    let changed = false;
    const participants = conversation.participants.map((participant: any) => {
        if (getParticipantUserId(participant) !== normalizedFriendId) return participant;
        if (!participant?.userId || typeof participant.userId !== 'object') return participant;

        if (normalizeNickname(participant.userId.nickname) === nextNickname) return participant;
        changed = true;
        return {
            ...participant,
            userId: {
                ...participant.userId,
                nickname: nextNickname,
            },
        };
    });

    return changed ? { ...conversation, participants } : conversation;
};

const preserveExistingParticipantNicknames = (incomingParticipants: any[] | undefined, existingParticipants: any[] | undefined) => {
    if (!Array.isArray(incomingParticipants) || !Array.isArray(existingParticipants)) return incomingParticipants;

    const nicknameByUserId = new Map<string, string | null>();
    existingParticipants.forEach((participant: any) => {
        if (!participant?.userId || typeof participant.userId !== 'object') return;
        const userId = getParticipantUserId(participant);
        if (!userId) return;
        if (Object.prototype.hasOwnProperty.call(participant.userId, 'nickname')) {
            nicknameByUserId.set(userId, normalizeNickname(participant.userId.nickname));
        }
    });

    if (!nicknameByUserId.size) return incomingParticipants;

    return incomingParticipants.map((participant: any) => {
        if (!participant?.userId || typeof participant.userId !== 'object') return participant;
        const userId = getParticipantUserId(participant);
        if (!userId || !nicknameByUserId.has(userId)) return participant;
        if (Object.prototype.hasOwnProperty.call(participant.userId, 'nickname')) return participant;

        return {
            ...participant,
            userId: {
                ...participant.userId,
                nickname: nicknameByUserId.get(userId),
            },
        };
    });
};

const CONVERSATION_PAGE_LIMIT = 50;

const mergeConversations = (current: any[], incoming: any[]) => {
    const byId = new Map<string, any>();
    [...current, ...incoming].forEach((conversation) => {
        if (!conversation?._id) return;
        if (!isVisibleConversation(conversation)) {
            byId.delete(conversation._id);
            return;
        }
        const existing = byId.get(conversation._id) || {};
        const nextConversation = {
            ...existing,
            ...conversation,
            participants: Array.isArray(conversation.participants)
                ? preserveExistingParticipantNicknames(conversation.participants, existing.participants) || conversation.participants
                : existing.participants,
        };
        byId.set(conversation._id, nextConversation);
    });
    return sortConversations(Array.from(byId.values()));
};

export const useChatStore = create<ChatState>()(
    persist(
        (set, get) => ({
            conversations: [],
            conversationsFetched: false,
            messages: {},
            media: {},
            mediaPagination: {},
            activeConversationId: null,
            focusedConversationId: null,
            convoLoading: false,
            messageLoading: false,
            jumpContexts: {},
            replyingTo: null,
            drafts: {},
            conversationsHasMore: true,
            conversationsNextCursor: null,
            groupConversations: [],
            groupsFetched: false,
            groupsLoading: false,
            groupsHasMore: true,
            groupsNextCursor: null,

            activeSidebar: null,
            infoSidebarOpen: true,
            searchResults: {
                items: [] as import('@/types/chat').Message[],
                isSearching: false,
                isLoadingMore: false,
                hasMore: false,
                nextCursor: null,
                query: '',
            },

            setActiveConversation: (id: string | null) => {
                if (id) {
                    const targetConversation = get().conversations.find((conversation) => conversation._id === id);
                    if (targetConversation && !isVisibleConversation(targetConversation)) {
                        id = null;
                    }
                }

                const prevId = get().activeConversationId;
                set((state) => {
                    const nextJumpContexts = { ...state.jumpContexts };
                    if (prevId) nextJumpContexts[prevId] = null;
                    if (id) nextJumpContexts[id] = null;

                    return {
                        activeConversationId: id,
                        focusedConversationId: id,
                        jumpContexts: nextJumpContexts,
                    };
                });
            },

            setFocusedConversation: (id: string | null) => set({ focusedConversationId: id }),
            setReplyingTo: (message: any) => set({ replyingTo: message }),
            clearConversationCache: (keepConversationIds: string[]) => {
                const keep = new Set(keepConversationIds.filter(Boolean));

                set((state) => {
                    let changed = false;
                    const nextMessages = { ...state.messages };
                    const nextMedia = { ...state.media };
                    const nextMediaPagination = { ...state.mediaPagination };

                    for (const id of Object.keys(nextMessages)) {
                        if (!keep.has(id)) {
                            delete nextMessages[id];
                            changed = true;
                        }
                    }

                    for (const id of Object.keys(nextMedia)) {
                        if (!keep.has(id)) {
                            delete nextMedia[id];
                            changed = true;
                        }
                    }

                    for (const id of Object.keys(nextMediaPagination)) {
                        if (!keep.has(id)) {
                            delete nextMediaPagination[id];
                            changed = true;
                        }
                    }

                    if (!changed) return state;

                    return {
                        messages: nextMessages,
                        media: nextMedia,
                        mediaPagination: nextMediaPagination,
                    };
                });
            },
            setActiveSidebar: (sidebar) => set((state) => ({
                activeSidebar: sidebar,
                infoSidebarOpen: sidebar === 'info'
                    ? true
                    : sidebar === null
                        ? false
                        : state.infoSidebarOpen,
            })),
            clearSearch: () => set({
                searchResults: { items: [], isSearching: false, isLoadingMore: false, hasMore: false, nextCursor: null, query: '' },
            }),
            searchMessages: async (query: string, filters?: { senderId?: string; fromDate?: string; toDate?: string }, options?: { append?: boolean }) => {
                const { activeConversationId, searchResults } = get();
                if (!activeConversationId || !query.trim()) return;
                if (options?.append && (!searchResults.hasMore || !searchResults.nextCursor || searchResults.isLoadingMore)) return;

                set((state) => ({
                    searchResults: {
                        ...state.searchResults,
                        isSearching: !options?.append,
                        isLoadingMore: Boolean(options?.append),
                        query,
                    },
                }));

                try {
                    const { messages, hasMore, nextCursor } = await chatService.searchMessages(
                        activeConversationId,
                        query,
                        filters,
                        { limit: 20, cursor: options?.append ? searchResults.nextCursor : null }
                    );
                    const { user } = useAuthStore.getState();
                    const processed = messages.map((m: any) => ({
                        ...m,
                        isOwn: m.senderId?._id === user?._id || m.senderId === user?._id,
                    }));
                    set((state) => ({
                        searchResults: {
                            ...state.searchResults,
                            items: options?.append
                                ? Array.from(new Map([...state.searchResults.items, ...processed].map((item) => [item._id, item])).values())
                                : processed,
                            isSearching: false,
                            isLoadingMore: false,
                            hasMore: Boolean(hasMore),
                            nextCursor: nextCursor ?? null,
                        },
                    }));
                } catch (error) {
                    console.error('Lỗi khi tìm kiếm tin nhắn:', error);
                    set((state) => ({
                        searchResults: { ...state.searchResults, isSearching: false, isLoadingMore: false },
                    }));
                }
            },
            reset: () => {
                set({
                    conversations: [],
                    conversationsFetched: false,
                    conversationsHasMore: true,
                    conversationsNextCursor: null,
                    groupConversations: [],
                    groupsFetched: false,
                    groupsLoading: false,
                    groupsHasMore: true,
                    groupsNextCursor: null,
                    messages: {},
                    media: {},
                    mediaPagination: {},
                    activeConversationId: null,
                    focusedConversationId: null,
                    convoLoading: false,
                    replyingTo: null,
                    activeSidebar: null,
                    infoSidebarOpen: true,
                    searchResults: { items: [], isSearching: false, isLoadingMore: false, hasMore: false, nextCursor: null, query: '' },
                    drafts: {},
                });
            },
            fetchConversations: async (force = false) => {
                if (get().convoLoading) return;
                try {
                    if (!force && get().conversationsFetched) return;

                    set({ convoLoading: true });
                    const { conversations, hasMore, nextCursor } = await chatService.fetchConversations({ limit: CONVERSATION_PAGE_LIMIT });

                    // Emit message-delivered cho lastMessage của các cuộc hội thoại 1-1
                    const { useSocketStore } = await import('./useSocketStore');
                    const sock = useSocketStore.getState().socket;
                    const { user } = useAuthStore.getState();
                    if (sock && user?._id) {
                        for (const convo of conversations as any[]) {
                            if (convo.type === 'direct' && convo.lastMessage) {
                                const msgSenderId = (convo.lastMessage.senderId as any)?._id || convo.lastMessage.senderId;
                                if (String(msgSenderId) !== String(user._id) && !convo.lastMessage.deliveredTo?.includes(String(user._id))) {
                                    sock.emit('message-delivered', { messageId: convo.lastMessage._id, conversationId: convo._id });
                                    get().markMessageDelivered(convo.lastMessage._id, convo._id, String(user._id));
                                }
                            }
                        }
                    }

                    const activeId = get().activeConversationId;
                    const activeConvoBeforeSync = activeId ? get().conversations.find(c => c._id === activeId) : null;
                    const visibleConversations = filterVisibleConversations(conversations as any);

                    set({
                        conversations: sortConversations(visibleConversations),
                        conversationsFetched: true,
                        conversationsHasMore: hasMore ?? false,
                        conversationsNextCursor: nextCursor ?? null,
                        convoLoading: false,
                    });

                    if (activeId && !get().conversations.find(c => c._id === activeId)) {
                        if (activeConvoBeforeSync && isVisibleConversation(activeConvoBeforeSync)) {
                            set(state => ({
                                conversations: [activeConvoBeforeSync, ...state.conversations]
                            }));
                        } else {
                            set({ activeConversationId: null, focusedConversationId: null });
                        }
                    }
                } catch (error) {
                    console.error('Lỗi khi tải danh sách cuộc trò chuyện:', error);
                    set({ convoLoading: false });
                }
            },
            ensureConversation: async (conversationId: string) => {
                const targetId = String(conversationId || '').trim();
                if (!targetId) return null;

                const existing = get().conversations.find((conversation) => conversation._id === targetId);
                if (existing) {
                    if (!isVisibleConversation(existing)) {
                        get().markGroupAsDisbanded(targetId);
                        return null;
                    }

                    return existing;
                }

                try {
                    const conversation = await chatService.fetchConversation(targetId);
                    if (!conversation || !isVisibleConversation(conversation)) {
                        get().markGroupAsDisbanded(targetId);
                        return null;
                    }

                    set((state) => ({
                        conversations: mergeConversations(state.conversations, [conversation]),
                        groupConversations: conversation.type === 'group'
                            ? mergeConversations(state.groupConversations, [conversation])
                            : state.groupConversations,
                    }));

                    return conversation;
                } catch (error) {
                    console.error('Lỗi khi tải cuộc trò chuyện:', error);
                    return null;
                }
            },
            fetchMoreConversations: async () => {
                const { convoLoading, conversationsHasMore, conversationsNextCursor } = get();
                if (convoLoading || !conversationsHasMore || !conversationsNextCursor) return;
                try {
                    set({ convoLoading: true });
                    const { conversations, hasMore, nextCursor } = await chatService.fetchConversations({
                        cursor: conversationsNextCursor,
                        limit: CONVERSATION_PAGE_LIMIT,
                    });
                    set((state) => ({
                        conversations: mergeConversations(state.conversations, conversations as any),
                        conversationsHasMore: hasMore ?? false,
                        conversationsNextCursor: nextCursor ?? null,
                        convoLoading: false,
                    }));
                } catch (error) {
                    console.error('Lỗi khi tải thêm cuộc trò chuyện:', error);
                    set({ convoLoading: false });
                }
            },
            fetchGroups: async (force = false) => {
                if (get().groupsLoading) return;
                try {
                    if (!force && get().groupsFetched) return;
                    set({ groupsLoading: true });
                    const { groups, hasMore, nextCursor } = await chatService.fetchGroups({ limit: CONVERSATION_PAGE_LIMIT });
                    set({
                        groupConversations: sortConversations(filterVisibleConversations(groups as any)),
                        groupsFetched: true,
                        groupsHasMore: hasMore ?? false,
                        groupsNextCursor: nextCursor ?? null,
                        groupsLoading: false,
                    });
                } catch (error) {
                    console.error('Lỗi khi tải danh sách nhóm:', error);
                    set({ groupsLoading: false });
                }
            },
            fetchMoreGroups: async () => {
                const { groupsLoading, groupsHasMore, groupsNextCursor } = get();
                if (groupsLoading || !groupsHasMore || !groupsNextCursor) return;
                try {
                    set({ groupsLoading: true });
                    const { groups, hasMore, nextCursor } = await chatService.fetchGroups({
                        cursor: groupsNextCursor,
                        limit: CONVERSATION_PAGE_LIMIT,
                    });
                    set((state) => ({
                        groupConversations: mergeConversations(state.groupConversations, groups as any),
                        groupsHasMore: hasMore ?? false,
                        groupsNextCursor: nextCursor ?? null,
                        groupsLoading: false,
                    }));
                } catch (error) {
                    console.error('Lỗi khi tải thêm nhóm:', error);
                    set({ groupsLoading: false });
                }
            },
            searchGroups: async (query: string) => {
                try {
                    const { groups } = await chatService.fetchGroups({ search: query, limit: 50 });
                    return filterVisibleConversations(groups as any);
                } catch (error) {
                    console.error('Lỗi khi tìm kiếm nhóm:', error);
                    return [];
                }
            },
            fetchMessages: async (conversationId?: string) => {
                const { activeConversationId, messages } = get();
                const { user } = useAuthStore.getState();

                const convoId = conversationId ?? activeConversationId;

                if (!convoId) return;

                const targetConversation = get().conversations.find((conversation) => conversation._id === convoId);
                if (targetConversation && !isVisibleConversation(targetConversation)) {
                    get().markGroupAsDisbanded(convoId);
                    return;
                }

                const current = messages?.[convoId];
                const shouldRefreshJumpWindow = current?.isJumpWindow === true;
                const rawNextCursor = shouldRefreshJumpWindow
                    ? ""
                    : current?.nextCursor === undefined ? "" : current?.nextCursor;
                if (rawNextCursor === null) return;

                const nextCursor = resolveMessagePaginationCursor(rawNextCursor, current?.items ?? []);
                if (rawNextCursor && !nextCursor) {
                    set((state) => ({
                        messages: {
                            ...state.messages,
                            [convoId]: {
                                ...(state.messages[convoId] ?? { items: [], pinnedMessages: [] }),
                                hasMore: false,
                                nextCursor: null,
                            },
                        },
                    }));
                    return;
                }

                set({ messageLoading: true });

                try {
                    const response = await chatService.fetchMessages({
                        conversationId: convoId,
                        cursor: nextCursor ?? undefined
                    });
                    const { messages: fetched, cursor, pinnedMessages, hasMore: backendHasMore } = response;

                    const convo = get().conversations.find((c) => c._id === convoId);
                    const isDirectConvo = convo?.type === 'direct';
                    const recipientId = isDirectConvo
                        ? convo?.participants.find((p) => (p.userId?._id || p.userId)?.toString() !== user?._id)?.userId?._id
                        : null;

                    const processed = fetched.map((m) => ({
                        ...m,
                        isOwn: m.senderId === user?._id || (m.senderId as any)?._id === user?._id,
                        isDelivered: isDirectConvo && recipientId
                            ? (m.deliveredTo?.includes(recipientId) ?? false)
                            : undefined,
                    }));

                    set((state) => {
                        const prevState = state.messages[convoId] ?? {
                            items: [],
                            hasMore: false,
                            nextCursor: "",
                            pinnedMessages: [],
                        };

                        const prevItems = shouldRefreshJumpWindow ? [] : (prevState.items ?? []);
                        const merged = prevItems.length > 0 ? [...processed, ...prevItems] : processed;

                        // Use a Map to deduplicate by _id
                        const dedupMap = new Map();
                        merged.forEach(m => dedupMap.set(m._id, m));
                        const uniqueMerged = Array.from(dedupMap.values());

                        uniqueMerged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                        return {
                            messages: {
                                ...state.messages,
                                [convoId]: {
                                    ...prevState,
                                    items: uniqueMerged,
                                    hasMore: fetched.length > 0 ? (backendHasMore ?? !!cursor) : false,
                                    nextCursor: cursor ?? null,
                                    pinnedMessages: pinnedMessages ?? prevState.pinnedMessages ?? [],
                                    isJumpWindow: false,
                                },
                            },
                        };
                    });

                    if (isDirectConvo) {
                        const { useSocketStore } = await import('./useSocketStore');
                        const sock = useSocketStore.getState().socket;
                        if (sock) {
                            for (const m of fetched) {
                                const msgSenderId = (m.senderId as any)?._id || m.senderId;
                                if (String(msgSenderId) !== String(user?._id) && !m.deliveredTo?.includes(user?._id ?? '')) {
                                    sock.emit('message-delivered', { messageId: m._id, conversationId: convoId });
                                    if (user?._id) {
                                        get().markMessageDelivered(m._id, convoId, String(user._id));
                                    }
                                }
                            }
                        }
                    }

                } catch (error) {
                    console.error("Lỗi khi tải tin nhắn:", error);
                } finally {
                    set({ messageLoading: false });
                }

            },

            jumpToMessage: async (conversationId: string, messageId: string) => {
                const { user } = useAuthStore.getState();
                set({ messageLoading: true });
                try {
                    const response = await chatService.fetchMessages({
                        conversationId,
                        aroundId: messageId,
                        limit: 40
                    });

                    const processed = response.messages.map((m) => ({
                        ...m,
                        isOwn: m.senderId === user?._id || (m.senderId as any)?._id === user?._id,
                    }));

                    set((state) => ({
                        messages: {
                            ...state.messages,
                            [conversationId]: {
                                items: processed,
                                hasMore: response.hasMoreOlder ?? false,
                                nextCursor: null,
                                pinnedMessages: state.messages[conversationId]?.pinnedMessages ?? [],
                                isJumpWindow: true,
                            }

                        },
                        jumpContexts: {
                            ...state.jumpContexts,
                            [conversationId]: {
                                anchorId: response.anchorId ?? messageId,
                                hasMoreOlder: response.hasMoreOlder ?? false,
                                hasMoreNewer: response.hasMoreNewer ?? false,
                                isJumpMode: true
                            }
                        }
                    }));


                    return response.anchorId;
                } catch (error) {
                    console.error("Lỗi khi jump tới tin nhắn:", error);
                    toast.error("Không thể đi tới tin nhắn này");
                } finally {
                    set({ messageLoading: false });
                }
            },

            loadOlderInJumpMode: async (conversationId: string) => {
                const context = get().jumpContexts[conversationId];
                if (!context || !context.isJumpMode || !context.hasMoreOlder) return;

                const { user } = useAuthStore.getState();
                const messages = get().messages[conversationId]?.items ?? [];
                if (messages.length === 0) return;

                set({ messageLoading: true });

                const firstMessage = messages[0];

                try {
                    const response = await chatService.fetchMessages({
                        conversationId,
                        before: firstMessage.createdAt,
                        limit: 20
                    });

                    const processed = response.messages.map((m) => ({
                        ...m,
                        isOwn: m.senderId === user?._id || (m.senderId as any)?._id === user?._id,
                    }));

                    set((state) => {
                        const prevState = state.messages[conversationId];
                        const merged = [...processed, ...prevState.items];

                        const dedupMap = new Map();
                        merged.forEach(m => dedupMap.set(m._id, m));
                        const uniqueMerged = Array.from(dedupMap.values());
                        uniqueMerged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                        return {
                            messages: {
                                ...state.messages,
                                [conversationId]: {
                                    ...prevState,
                                    items: uniqueMerged,
                                    isJumpWindow: true,
                                },
                            },
                            jumpContexts: {
                                ...state.jumpContexts,
                                [conversationId]: {
                                    ...context,
                                    hasMoreOlder: processed.length > 0 ? (response.hasMore ?? false) : false
                                }
                            }
                        };
                    });
                } catch (error) {
                    console.error("Lỗi khi tải thêm tin nhắn cũ (Jump Mode):", error);
                } finally {
                    set({ messageLoading: false });
                }
            },



            loadNewerInJumpMode: async (conversationId: string) => {
                const context = get().jumpContexts[conversationId];
                if (!context || !context.isJumpMode || !context.hasMoreNewer) return;

                const { user } = useAuthStore.getState();
                const messages = get().messages[conversationId]?.items ?? [];
                if (messages.length === 0) return;

                set({ messageLoading: true });

                const lastMessage = messages[messages.length - 1];

                try {
                    const response = await chatService.fetchMessages({
                        conversationId,
                        after: lastMessage.createdAt,
                        limit: 20
                    });

                    const processed = response.messages.map((m) => ({
                        ...m,
                        isOwn: m.senderId === user?._id || (m.senderId as any)?._id === user?._id,
                    }));

                    const hasMoreNewer = response.hasMore ?? false;

                    set((state) => {
                        const prevState = state.messages[conversationId];
                        const merged = [...prevState.items, ...processed];

                        const dedupMap = new Map();
                        merged.forEach(m => dedupMap.set(m._id, m));
                        const uniqueMerged = Array.from(dedupMap.values());
                        uniqueMerged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                        const isTransitioning = !hasMoreNewer;
                        const oldestMessage = uniqueMerged[0];
                        const oldestMessageCursor = getMessageCreatedAtCursor(oldestMessage);

                        return {
                            messages: {
                                ...state.messages,
                                [conversationId]: {
                                    ...prevState,
                                    items: uniqueMerged,
                                    isJumpWindow: !isTransitioning,
                                    // If transitioning to normal mode, update nextCursor to support upward scrolling
                                    ...(isTransitioning ? {
                                        nextCursor: oldestMessageCursor ?? null,
                                        hasMore: Boolean(oldestMessageCursor)
                                    } : {})
                                },
                            },
                            jumpContexts: {
                                ...state.jumpContexts,
                                [conversationId]: isTransitioning ? null : {
                                    ...context,
                                    hasMoreNewer: processed.length > 0 ? (response.hasMore ?? false) : false
                                }
                            }
                        };
                    });
                } catch (error) {
                    console.error("Lỗi khi tải thêm tin nhắn mới (Jump Mode):", error);
                } finally {
                    set({ messageLoading: false });
                }
            },




            exitJumpMode: async (conversationId: string) => {
                const { user } = useAuthStore.getState();
                const currentMessages = get().messages[conversationId];

                set({ messageLoading: true });

                try {
                    const response = await chatService.fetchMessages({
                        conversationId,
                        cursor: "" // Fetch latest
                    });

                    const processed = response.messages.map((m) => ({
                        ...m,
                        isOwn: m.senderId === user?._id || (m.senderId as any)?._id === user?._id,
                    }));

                    set((state) => ({
                        messages: {
                            ...state.messages,
                            [conversationId]: {
                                items: processed,
                                hasMore: !!response.cursor,
                                nextCursor: response.cursor ?? null,
                                pinnedMessages: response.pinnedMessages ?? currentMessages?.pinnedMessages ?? [],
                                isJumpWindow: false,
                            }
                        },
                        jumpContexts: {
                            ...state.jumpContexts,
                            [conversationId]: null
                        }
                    }));
                } catch (error) {
                    console.error("Lỗi khi thoát Jump Mode:", error);
                } finally {
                    set({ messageLoading: false });
                }
            },


            sendMessage: async (payload: SendMessagePayload, onProgress?: (pct: number) => void) => {
                const { activeConversationId, replyingTo } = get();
                const { user } = useAuthStore.getState();

                const finalPayload: SendMessagePayload = {
                    ...payload,
                    conversationId: payload.conversationId ?? (!payload.recipientId ? (activeConversationId ?? undefined) : undefined),
                    replyToMessageId: payload.replyToMessageId ?? replyingTo?._id ?? undefined,
                };

                const replyToSnapshot = replyingTo
                    ? {
                        _id: replyingTo._id,
                        senderId: replyingTo.senderId,
                        type: replyingTo.type,
                        metadata: replyingTo.metadata,
                        content: replyingTo.content,
                        fileName: replyingTo.fileName,
                        fileUrl: replyingTo.fileUrl,
                        filePublicId: replyingTo.filePublicId,
                        isRecalled: replyingTo.isRecalled,
                        reportStatus: replyingTo.reportStatus,
                        mentions: replyingTo.mentions,
                    }
                    : null;

                set({ replyingTo: null });

                const convoId = finalPayload.conversationId ?? activeConversationId;
                const isFileUpload = !!payload.file;

                let tempId: string | null = null;
                let tempBlobUrl: string | null = null;

                if (convoId && user) {
                    tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

                    if (isFileUpload && payload.file) {
                        tempBlobUrl = URL.createObjectURL(payload.file);
                    }

                    const optimistic = {
                        _id: tempId,
                        conversationId: convoId,
                        senderId: user._id,
                        type: payload.type,
                        content: payload.content ?? null,
                        mentions: payload.mentions ?? [],
                        metadata: payload.metadata,
                        fileName: payload.file?.name,
                        fileSize: payload.file?.size,
                        fileUrl: tempBlobUrl,
                        isRecalled: false,
                        isPinned: false,
                        createdAt: new Date().toISOString(),
                        isOwn: true,
                        clientTempId: tempId,
                        status: 'sending' as const,
                        replyTo: replyToSnapshot,
                    };

                    set((state) => {
                        const prev = state.messages[convoId] ?? {
                            items: [], hasMore: false, nextCursor: '', pinnedMessages: [],
                        };
                        return {
                            messages: {
                                ...state.messages,
                                [convoId]: { ...prev, items: [...prev.items, optimistic] },
                            },
                        };
                    });
                }

                try {
                    const response = await chatService.sendMessage(finalPayload, (pct) => {
                        if (tempId && convoId) {
                            set((state) => {
                                const prev = state.messages[convoId];
                                if (!prev) return state;

                                return {
                                    messages: {
                                        ...state.messages,
                                        [convoId]: {
                                            ...prev,
                                            items: prev.items.map((m) =>
                                                m._id === tempId ? { ...m, progress: pct } : m
                                            ),
                                        },
                                    },
                                };
                            });
                        }
                        onProgress?.(pct);
                    });

                    const realMsg = response.message;

                    // Set cached signed URL before rendering
                    if (response.signedUrl) {
                        useMediaCacheStore.getState().setUrl(realMsg._id, response.signedUrl);
                    }

                    const conversationPatch = buildConversationPatchFromMessage(realMsg);
                    if (conversationPatch) {
                        get().updateConversation(conversationPatch as any);
                    }

                    if (tempId && convoId) {
                        set((state) => {
                            const prev = state.messages[convoId];
                            if (!prev) return state;

                            const sentMessage = { ...realMsg, isOwn: true, clientTempId: tempId, status: 'sent' as const };
                            const tempIndex = prev.items.findIndex((m) => m._id === tempId);
                            const existingIndex = prev.items.findIndex((m) => m._id === realMsg._id);
                            const items = resolveCompletedOptimisticItems(prev.items, tempIndex, existingIndex, sentMessage);
                            const prevMedia = state.media[convoId];
                            let nextMedia = prevMedia;
                            if (prevMedia) {
                                if (realMsg.type === 'image' && (realMsg.fileUrl || realMsg.filePublicId)) {
                                    const exists = prevMedia.images.some((m) => m._id === realMsg._id);
                                    if (!exists) {
                                        nextMedia = {
                                            ...prevMedia,
                                            images: [realMsg, ...prevMedia.images].slice(0, 8),
                                        };
                                    }
                                } else if (realMsg.type === 'file' && (realMsg.fileUrl || realMsg.filePublicId)) {
                                    const exists = prevMedia.files.some((m) => m._id === realMsg._id);
                                    if (!exists) {
                                        nextMedia = {
                                            ...prevMedia,
                                            files: [realMsg, ...prevMedia.files].slice(0, 3),
                                        };
                                    }
                                } else if (realMsg.type === 'link' && realMsg.content) {
                                    const exists = prevMedia.links.some((m) => m._id === realMsg._id);
                                    if (!exists) {
                                        nextMedia = {
                                            ...prevMedia,
                                            links: [realMsg, ...prevMedia.links].slice(0, 3),
                                        };
                                    }
                                }
                            }

                            return {
                                messages: { ...state.messages, [convoId]: { ...prev, items } },
                                ...(nextMedia !== prevMedia
                                    ? { media: { ...state.media, [convoId]: nextMedia } }
                                    : {}),
                            };
                        });
                    }
                    if (tempBlobUrl) URL.revokeObjectURL(tempBlobUrl);

                    // Clear draft when message is sent successfully
                    if (convoId) {
                        get().clearDraft(convoId);
                    }
                } catch (error: any) {
                    const isModerationError =
                        payload.type === 'image' &&
                        (
                            error?.response?.data?.moderation ||
                            error?.message?.toLowerCase().includes('tiêu chuẩn cộng đồng') ||
                            error?.message?.toLowerCase().includes('vi phạm')
                        );

                    if (tempId && convoId) {
                        set((state) => {
                            const prev = state.messages[convoId];
                            if (!prev) return state;
                            const items = prev.items.map((m) =>
                                m._id === tempId ? { ...m, status: 'error' as const } : m
                            );
                            return {
                                messages: {
                                    ...state.messages,
                                    [convoId]: {
                                        ...prev,
                                        items,
                                    },
                                },
                            };
                        });
                    }
                    if (tempBlobUrl && isModerationError) {
                        tempBlobUrl = null;
                    }
                    if (tempBlobUrl) URL.revokeObjectURL(tempBlobUrl);
                    throw error;
                }
            },



            addMessage: async (message: any) => {
                try {
                    const { user } = useAuthStore.getState();
                    const { fetchMessages } = get();

                    message.isOwn = message.senderId === user?._id;

                    const convoId = message.conversationId;

                    const currentMessageState = get().messages[convoId];
                    if (currentMessageState?.isJumpWindow) {
                        return;
                    }

                    let prevItems = currentMessageState?.items ?? [];

                    if (prevItems.length === 0) {
                        await fetchMessages(message.conversationId);
                        prevItems = get().messages[convoId]?.items ?? [];
                    }

                    set((state) => {
                        const prevState = state.messages[convoId] ?? {
                            items: [],
                            hasMore: false,
                            nextCursor: "",
                            pinnedMessages: [],
                        };

                        if (prevState.items.some((m) => m._id === message._id)) {
                            return state;
                        }

                        const optimisticIndex = prevState.items.findIndex((item) =>
                            canUseOptimisticSlot(item, message)
                        );
                        const optimisticMessage = optimisticIndex >= 0 ? prevState.items[optimisticIndex] : null;
                        const messageForList = optimisticMessage
                            ? {
                                ...optimisticMessage,
                                ...message,
                                clientTempId: optimisticMessage.clientTempId || optimisticMessage._id,
                                status: 'sent' as const,
                            }
                            : message;

                        const prevMedia = state.media[convoId];
                        const prevMediaPagination = state.mediaPagination[convoId];
                        let nextMedia = prevMedia;
                        let nextMediaPagination = prevMediaPagination;
                        if (prevMedia) {
                            const mediaType = message.type;
                            if (mediaType === 'image' && (message.fileUrl || message.filePublicId)) {
                                const alreadyExists = prevMedia.images.some((m) => m._id === message._id);
                                if (!alreadyExists) {
                                    nextMedia = { ...prevMedia, images: [messageForList, ...prevMedia.images].slice(0, 8) };
                                }
                            } else if (mediaType === 'file' && (message.fileUrl || message.filePublicId)) {
                                const alreadyExists = prevMedia.files.some((m) => m._id === message._id);
                                if (!alreadyExists) {
                                    nextMedia = { ...prevMedia, files: [messageForList, ...prevMedia.files].slice(0, 3) };
                                }
                            } else if (mediaType === 'link' && message.content) {
                                const alreadyExists = prevMedia.links.some((m) => m._id === message._id);
                                if (!alreadyExists) {
                                    nextMedia = { ...prevMedia, links: [messageForList, ...prevMedia.links].slice(0, 3) };
                                }
                            }
                        }

                        if (prevMediaPagination) {
                            if (message.type === 'image' && (message.fileUrl || message.filePublicId)) {
                                const exists = prevMediaPagination.image.items.some((m) => m._id === message._id);
                                if (!exists) {
                                    nextMediaPagination = {
                                        ...prevMediaPagination,
                                        image: {
                                            ...prevMediaPagination.image,
                                            items: [messageForList, ...prevMediaPagination.image.items],
                                        },
                                    };
                                }
                            } else if (message.type === 'file' && (message.fileUrl || message.filePublicId)) {
                                const exists = prevMediaPagination.file.items.some((m) => m._id === message._id);
                                if (!exists) {
                                    nextMediaPagination = {
                                        ...prevMediaPagination,
                                        file: {
                                            ...prevMediaPagination.file,
                                            items: [messageForList, ...prevMediaPagination.file.items],
                                        },
                                    };
                                }
                            } else if (message.type === 'link' && message.content) {
                                const exists = prevMediaPagination.link.items.some((m) => m._id === message._id);
                                if (!exists) {
                                    nextMediaPagination = {
                                        ...prevMediaPagination,
                                        link: {
                                            ...prevMediaPagination.link,
                                            items: [messageForList, ...prevMediaPagination.link.items],
                                        },
                                    };
                                }
                            }
                        }

                        return {
                            messages: {
                                ...state.messages,
                                [convoId]: {
                                    ...prevState,
                                    items: resolveCompletedOptimisticItems(
                                        prevState.items,
                                        optimisticIndex,
                                        -1,
                                        messageForList
                                    ),
                                    pinnedMessages: prevState.pinnedMessages ?? [],
                                },
                            },
                            ...(nextMedia !== prevMedia ? { media: { ...state.media, [convoId]: nextMedia } } : {}),
                            ...(nextMediaPagination !== prevMediaPagination ? { mediaPagination: { ...state.mediaPagination, [convoId]: nextMediaPagination } } : {}),
                        };
                    });
                } catch (error) {
                    console.error(error, "Lỗi khi thêm tin nhắn");
                }
            },
            createReminderSystemMessage: async (conversationId: string, reminder: any) => {
                try {
                    const reminderContent = getReminderContent(reminder);
                    const response = await chatService.createReminderSystemMessage({
                        conversationId,
                        reminderId: reminder._id,
                        reminderContent,
                        remindAt: reminder.remindAt,
                    });

                    await get().addMessage(response.message as any);

                    get().updateConversation({
                        _id: response.conversation._id,
                        lastMessage: response.conversation.lastMessage,
                        lastMessageAt: response.conversation.lastMessageAt,
                        unreadCounts: response.unreadCounts,
                    } as any);
                } catch (error) {
                    console.error('Lỗi khi tạo system message reminder:', error);
                    throw error;
                }
            },
            updateParticipantNickname: (friendId, nickname) => {
                const normalizedFriendId = String(friendId || '');
                if (!normalizedFriendId) return;

                set((state) => ({
                    conversations: state.conversations.map((conversation) =>
                        patchParticipantNickname(conversation, normalizedFriendId, nickname)
                    ),
                    groupConversations: state.groupConversations.map((conversation) =>
                        patchParticipantNickname(conversation, normalizedFriendId, nickname)
                    ),
                    searchResults: {
                        ...state.searchResults,
                        items: state.searchResults.items.map((message: any) => (
                            message?.conversation
                                ? {
                                    ...message,
                                    conversation: patchParticipantNickname(message.conversation, normalizedFriendId, nickname),
                                }
                                : message
                        )),
                    },
                }));
            },
            updateConversation: (conversation) => {
                if (!isVisibleConversation(conversation)) {
                    get().markGroupAsDisbanded(conversation._id);
                    return;
                }

                const { conversations, fetchConversations } = get();
                const exists = conversations.some((c) => c._id === conversation._id);

                if (!exists) {
                    fetchConversations(true);
                } else {
                    set((state) => {
                        const existingConv = state.conversations.find((c) => c._id === conversation._id);
                        if (!existingConv) return state;

                        // Only update participants if the new payload has fully populated participants
                        // (i.e., userId is an object with displayName, not a raw ObjectId string)
                        const newParticipants = conversation.participants;
                        const isPopulated = newParticipants?.[0]?.userId?.displayName !== undefined;
                        const nextActivityAt =
                            conversation.lastMessage?.createdAt
                            ?? conversation.lastMessageAt
                            ?? conversation.updatedAt
                            ?? existingConv.updatedAt;
                        const nextParticipants = isPopulated
                            ? preserveExistingParticipantNicknames(newParticipants, existingConv.participants)
                            : existingConv.participants;

                        const updatedConv = {
                            ...existingConv,
                            ...conversation,
                            ...(nextActivityAt ? { updatedAt: nextActivityAt, lastMessageAt: nextActivityAt } : {}),
                            participants: nextParticipants || existingConv.participants
                        };

                        const updatedConversations = state.conversations.map((c) =>
                            c._id === conversation._id ? updatedConv : c
                        );

                        const sortedConversations = sortConversations(updatedConversations as any);
                        const groupConversationExists = state.groupConversations.some((c) => c._id === conversation._id);
                        const sortedGroupConversations = groupConversationExists
                            ? sortConversations(
                                state.groupConversations.map((c) =>
                                    c._id === conversation._id
                                        ? {
                                            ...c,
                                            ...conversation,
                                            ...(nextActivityAt ? { updatedAt: nextActivityAt, lastMessageAt: nextActivityAt } : {}),
                                            participants: (
                                                isPopulated
                                                    ? preserveExistingParticipantNicknames(newParticipants, c.participants)
                                                    : c.participants
                                            ) || c.participants,
                                        }
                                        : c
                                ) as any
                            )
                            : state.groupConversations;

                        // Also update selectedConvo if it's the active one
                        const isActive = state.activeConversationId === conversation._id;

                        return {
                            conversations: sortedConversations,
                            groupConversations: sortedGroupConversations,
                            ...(isActive ? { selectedConvo: updatedConv } : {})
                        };
                    });
                }
            },
            markAsSeen: async (conversationId?: string) => {
                try {
                    const { user } = useAuthStore.getState();
                    const { activeConversationId, conversations } = get();
                    const targetId = conversationId || activeConversationId;

                    if (!targetId || !user) return;

                    const convo = conversations.find((c) => c._id === targetId);
                    if (!convo || !convo.lastMessage) return;

                    const isUnread = (convo.unreadCounts?.[user._id] ?? 0) > 0;
                    if (!isUnread) return;

                    await chatService.markAsSeen(targetId);
                    const lastMsgId = convo.lastMessage?._id || null;
                    set((state) => ({
                        conversations: state.conversations.map((c) => (
                            c._id === targetId && c.lastMessage ? {
                                ...c,
                                unreadCounts: {
                                    ...c.unreadCounts,
                                    [user._id]: 0
                                },
                                participants: c.participants.map((participant) => {
                                    const participantId = (participant.userId?._id || participant.userId)?.toString();
                                    if (participantId !== user._id.toString()) {
                                        return participant;
                                    }

                                    return {
                                        ...participant,
                                        unreadMentionCount: 0,
                                        lastReadMessageId: lastMsgId,
                                        lastReadAt: new Date().toISOString(),
                                    };
                                })
                            }
                                : c
                        ))
                    }));

                } catch (error) {
                    console.error("Lỗi khi đánh dấu cuộc trò chuyện đã xem:", error);
                }
            },
            markAsUnread: async (conversationId: string) => {
                try {
                    const { user } = useAuthStore.getState();
                    if (!user) return;

                    await chatService.markAsUnread(conversationId);
                    set((state) => ({
                        conversations: state.conversations.map((c) => (
                            c._id === conversationId ? {
                                ...c,
                                unreadCounts: {
                                    ...c.unreadCounts,
                                    [user._id]: 1
                                }
                            } : c
                        ))
                    }));
                } catch (error) {
                    console.error("Lỗi khi đánh dấu chưa đọc:", error);
                }
            },
            markMessageDelivered: (messageId: string, conversationId: string, deliveredUserId?: string) => {
                const deliveredMarker = deliveredUserId || "delivered_placeholder";
                set((state) => {
                    const convoIdx = state.conversations.findIndex(c => c._id === conversationId);
                    const nextConvos = [...state.conversations];

                    if (convoIdx !== -1) {
                        const convo = nextConvos[convoIdx];

                        if (convo.lastMessage?._id === messageId) {
                            const nextLastMsg = {
                                ...convo.lastMessage,
                                isDelivered: true,
                                deliveredTo: Array.from(new Set([...(convo.lastMessage.deliveredTo || []), deliveredMarker]))
                            };

                            nextConvos[convoIdx] = { ...convo, lastMessage: nextLastMsg };
                        }
                    }

                    const convoMessages = state.messages[conversationId];
                    if (!convoMessages) return { conversations: nextConvos };

                    const nextItems = convoMessages.items.map(m => {
                        if (m._id === messageId) {
                            return {
                                ...m,
                                isDelivered: true,
                                deliveredTo: Array.from(new Set([...(m.deliveredTo || []), deliveredMarker]))
                            };
                        }
                        return m;
                    });

                    return {
                        conversations: nextConvos,
                        messages: {
                            ...state.messages,
                            [conversationId]: { ...convoMessages, items: nextItems }
                        }
                    };
                });
            },
            setDraft: (conversationId: string, draft: DraftInfo | null) => {
                set((state) => ({
                    drafts: {
                        ...state.drafts,
                        [conversationId]: draft
                    }
                }));
            },
            clearDraft: (conversationId: string) => {
                set((state) => {
                    const nextDrafts = { ...state.drafts };
                    delete nextDrafts[conversationId];
                    return { drafts: nextDrafts };
                });
            },
            toggleConversationPin: async (conversationId: string) => {
                const existing = get().conversations.find((c) => c._id === conversationId);
                const nextIsPinned = !(existing?.isPinned === true);
                const optimisticPinnedAt = nextIsPinned ? new Date().toISOString() : null;

                if (nextIsPinned) {
                    const pinnedCount = get().conversations.filter((c) => c.isPinned === true).length;
                    if (pinnedCount >= MAX_PINNED_CONVERSATIONS) {
                        toast.error(`Bạn chỉ có thể ghim tối đa ${MAX_PINNED_CONVERSATIONS} cuộc hội thoại.`);
                        return;
                    }
                }

                set((state) => ({
                    conversations: sortConversations(
                        state.conversations.map((c) =>
                            c._id === conversationId
                                ? { ...c, isPinned: nextIsPinned, pinnedAt: optimisticPinnedAt }
                                : c
                        ) as any
                    ),
                }));

                try {
                    const response = await chatService.toggleConversationPin(conversationId);
                    if (response?.conversation) {
                        get().updateConversation(response.conversation as any);
                    }
                } catch (error) {
                    console.error('Lỗi khi ghim hội thoại:', error);
                    toast.error(getApiErrorMessage(error, 'Không thể cập nhật trạng thái ghim hội thoại.'));
                    await get().fetchConversations(true);
                    throw error;
                }
            },
            updateGroupName: async (conversationId: string, name: string) => {
                try {
                    await chatService.updateGroupName(conversationId, name);
                    set((state) => ({
                        conversations: state.conversations.map((c) => c._id === conversationId ? { ...c, group: { ...c.group, name } } : c)
                    }))
                } catch (error) {
                    console.error("Lỗi khi cập nhật tên nhóm:", error);
                    toast.error(getApiErrorMessage(error, 'Không thể cập nhật tên nhóm.'));
                    throw error;
                }
            },
            updateGroupAvatar: async (conversationId: string, file: File, onProgress?: (percent: number) => void) => {
                try {
                    const response = await chatService.updateGroupAvatar(conversationId, file, onProgress);
                    if (response?.conversation) {
                        get().updateConversation(response.conversation);
                        return;
                    }

                    await get().fetchConversations(true);
                } catch (error) {
                    console.error("Lỗi khi cập nhật ảnh nhóm:", error);
                    throw error;
                }
            },
            updateGroupSettings: async (conversationId: string, settings) => {
                try {
                    const response = await chatService.updateGroupSettings(conversationId, settings);
                    if (response?.conversation) {
                        get().updateConversation(response.conversation);
                        return;
                    }
                    set((state) => ({
                        conversations: state.conversations.map((c) =>
                            c._id === conversationId ? { ...c, group: { ...c.group, ...settings } } : c
                        )
                    }));
                } catch (error) {
                    console.error("Lỗi khi cập nhật cài đặt nhóm:", error);
                    throw error;
                }
            },
            handleApproval: async (conversationId: string, userId: string, action: 'approve' | 'reject') => {
                try {
                    await chatService.handleApproval(conversationId, userId, action);
                } catch (error) {
                    console.error("Lỗi khi duyệt thành viên:", error);
                    throw error;
                }
            },
            removeMember: async (conversationId: string, memberId: string) => {
                try {
                    const res = await chatService.removeMember(conversationId, memberId);
                    set((state) => {
                        const existingConv = state.conversations.find((c) => c._id === conversationId);
                        if (!existingConv) return state;

                        const updatedConv = {
                            ...existingConv,
                            participants: existingConv.participants.filter(p =>
                                (p.userId?._id || p.userId)?.toString() !== memberId
                            )
                        };

                        const updatedConversations = state.conversations.map((c) =>
                            c._id === conversationId ? updatedConv : c
                        );

                        return {
                            conversations: updatedConversations
                        };
                    });

                    return res;
                } catch (error) {
                    console.error("Lỗi khi xóa thành viên:", error);
                    throw error;
                }
            },
            openChat: async ({ userId, conversationId }: { userId?: string, conversationId?: string }) => {
                const { conversations, setActiveConversation, fetchMessages, fetchConversations } = get();
                let targetId = conversationId;

                try {
                    if (!targetId && userId) {
                        const existing = conversations.find((c: any) =>
                            c.type === 'direct' &&
                            c.participants.some((p: any) => p.userId?._id === userId)
                        );

                        if (existing) {
                            targetId = existing._id;
                        } else {
                            const res = await chatService.createConversation('direct', [userId]);
                            const conv = res.conversation || res;
                            await fetchConversations(true);
                            targetId = conv?._id || conv;

                            // Đảm bảo conversation này có trong store ngay cả khi bị fetchConversations ẩn đi (do đã xóa trước đó)
                            set((state) => {
                                const exists = state.conversations.find((c) => c._id === targetId);
                                if (!exists && conv && typeof conv === 'object') {
                                    let modifiedConv = { ...conv };
                                    const { user } = useAuthStore.getState();
                                    const me = modifiedConv.participants?.find((p: any) =>
                                        p.userId?._id === user?._id || p.userId === user?._id
                                    );

                                    // Nếu tin nhắn cuối cùng cũ hơn thời điểm xóa, hãy ẩn nó đi
                                    if (me && me.clearedAt) {
                                        const compareTime = modifiedConv.lastMessage?.createdAt
                                            ? new Date(modifiedConv.lastMessage.createdAt).getTime()
                                            : new Date(modifiedConv.updatedAt || modifiedConv.createdAt || 0).getTime();

                                        if (compareTime <= new Date(me.clearedAt).getTime()) {
                                            modifiedConv.lastMessage = null;
                                        }
                                    }

                                    return {
                                        conversations: [modifiedConv, ...state.conversations]
                                    };
                                }
                                return state;
                            });
                        }
                    }

                    if (targetId) {
                        setActiveConversation(targetId);
                        await fetchMessages(targetId).catch(() => { });
                    } else {
                        throw new Error("Không thể xác định hội thoại để mở");
                    }
                } catch (error) {
                    console.error('Lỗi khi mở cuộc trò chuyện:', error);
                }
            },
            createGroup: async (name, members) => {
                const { fetchConversations, setActiveConversation, fetchMessages } = get();
                try {
                    const res = await chatService.createConversation('group', members, name);
                    const conv = res.conversation || res;
                    await fetchConversations(true);
                    if (conv?._id) {
                        setActiveConversation(conv._id);
                        await fetchMessages(conv._id).catch(() => { });
                    }
                } catch (error) {
                    console.error('Lỗi khi tạo nhóm:', error);
                    throw error;
                }
            },
            clearConversation: async (conversationId: string) => {
                try {
                    await chatService.clearConversation(conversationId);
                    set((state) => {
                        const nextConversations = state.conversations.filter(c => c._id !== conversationId);
                        const isActive = state.activeConversationId === conversationId;
                        const isFocused = state.focusedConversationId === conversationId;

                        const nextMessages = { ...state.messages };
                        const nextMedia = { ...state.media };
                        const nextMediaPagination = { ...state.mediaPagination };
                        delete nextMessages[conversationId];
                        delete nextMedia[conversationId];
                        delete nextMediaPagination[conversationId];

                        return {
                            conversations: nextConversations,
                            activeConversationId: isActive ? null : state.activeConversationId,
                            focusedConversationId: isFocused ? null : state.focusedConversationId,
                            messages: nextMessages,
                            media: nextMedia,
                            mediaPagination: nextMediaPagination,
                        };
                    });
                } catch (error) {
                    console.error("Lỗi khi xóa cuộc trò chuyện:", error);
                    throw error;
                }
            },
            recallMessage: async (messageId: string) => {
                try {
                    await chatService.recallMessage(messageId);
                    set((state) => {
                        const convoId = state.activeConversationId;
                        if (!convoId) return state;

                        const convoMessages = state.messages[convoId];
                        if (!convoMessages) return state;

                        return {
                            messages: {
                                ...state.messages,
                                [convoId]: {
                                    ...convoMessages,
                                    items: convoMessages.items.map((m) =>
                                        m._id === messageId ? { ...m, isRecalled: true, content: 'Tin nhắn này đã được thu hồi' } : m
                                    )
                                }
                            }
                        }
                    });
                } catch (error) {
                    console.error("Lỗi khi thu hồi tin nhắn:", error);
                    throw error;
                }
            },
            pinMessage: async (messageId: string) => {
                try {
                    const res = await chatService.pinMessage(messageId);
                    const payload = res.data;

                    const { pinMessageLocal } = get();

                    if (payload?.unpinnedMessageId) {
                        pinMessageLocal(payload.conversationId, payload.unpinnedMessageId, {
                            isPinned: false,
                            pinnedAt: null,
                        });
                    }

                    if (payload?.pinnedMessageId) {
                        pinMessageLocal(payload.conversationId, payload.pinnedMessageId, {
                            isPinned: true,
                            pinnedAt: payload.pinnedAt,
                        });
                    }
                } catch (error) {
                    console.error("Lỗi khi ghim tin nhắn:", error);
                }
            },

            pinMessageLocal: (conversationId, messageId, patch) =>
                set((state) => {
                    const prevState = state.messages[conversationId] ?? {
                        items: [],
                        hasMore: false,
                        nextCursor: "",
                        pinnedMessages: [],
                    };

                    const updatedItems = prevState.items.map((m) =>
                        m._id === messageId ? { ...m, ...patch } : m
                    );

                    const existingPinned = prevState.pinnedMessages ?? [];

                    const updatedPinnedMessages = existingPinned.map((m) =>
                        m._id === messageId ? { ...m, ...patch } : m
                    );

                    const updatedMessage =
                        updatedItems.find((m) => m._id === messageId) ??
                        updatedPinnedMessages.find((m) => m._id === messageId);

                    let nextPinned = updatedPinnedMessages;

                    if (patch.isPinned) {
                        if (updatedMessage) {
                            nextPinned = nextPinned.some((m) => m._id === messageId)
                                ? nextPinned.map((m) => (m._id === messageId ? updatedMessage : m))
                                : [updatedMessage, ...nextPinned];
                        }
                    } else {
                        nextPinned = nextPinned.filter((m) => m._id !== messageId);
                    }

                    return {
                        messages: {
                            ...state.messages,
                            [conversationId]: {
                                ...prevState,
                                items: updatedItems,
                                pinnedMessages: nextPinned,
                            },
                        },
                    };
                }),
            recallMessageLocal: (conversationId, messageId, patch) =>
                set((state) => {
                    const prevState = state.messages[conversationId] ?? {
                        items: [],
                        hasMore: false,
                        nextCursor: "",
                        pinnedMessages: [],
                    };

                    const updatedItems = prevState.items.map((m) =>
                        m._id === messageId ? { ...m, ...patch } : m
                    );

                    const updatedPinned = (prevState.pinnedMessages ?? []).map((m) =>
                        m._id === messageId ? { ...m, ...patch } : m
                    );

                    // Also remove from media state if recalled
                    const prevMedia = state.media[conversationId];
                    const prevMediaPagination = state.mediaPagination[conversationId];
                    let nextMediaState = state.media;
                    let nextMediaPaginationState = state.mediaPagination;
                    if (prevMedia && patch.isRecalled) {
                        nextMediaState = {
                            ...state.media,
                            [conversationId]: {
                                images: prevMedia.images.filter((m) => m._id !== messageId),
                                files: prevMedia.files.filter((m) => m._id !== messageId),
                                links: prevMedia.links.filter((m) => m._id !== messageId),
                            },
                        };
                    }

                    if (prevMediaPagination && patch.isRecalled) {
                        nextMediaPaginationState = {
                            ...state.mediaPagination,
                            [conversationId]: {
                                ...prevMediaPagination,
                                image: {
                                    ...prevMediaPagination.image,
                                    items: prevMediaPagination.image.items.filter((m) => m._id !== messageId),
                                },
                                file: {
                                    ...prevMediaPagination.file,
                                    items: prevMediaPagination.file.items.filter((m) => m._id !== messageId),
                                },
                                link: {
                                    ...prevMediaPagination.link,
                                    items: prevMediaPagination.link.items.filter((m) => m._id !== messageId),
                                },
                            },
                        };
                    }

                    return {
                        messages: {
                            ...state.messages,
                            [conversationId]: {
                                ...prevState,
                                items: updatedItems,
                                pinnedMessages: updatedPinned,
                            },
                        },
                        media: nextMediaState,
                        mediaPagination: nextMediaPaginationState,
                    };
                }),
            fetchMedia: async (conversationId: string) => {
                try {
                    const [imgRes, fileRes, linkRes] = await Promise.all([
                        chatService.fetchMedia(conversationId, 'image', 8),
                        chatService.fetchMedia(conversationId, 'file', 3),
                        chatService.fetchMedia(conversationId, 'link', 3),
                    ]);
                    set((state) => ({
                        media: {
                            ...state.media,
                            [conversationId]: {
                                images: imgRes.messages,
                                files: fileRes.messages,
                                links: linkRes.messages,
                            },
                        },
                    }));
                } catch (error) {
                    console.error('Failed to fetch media:', error);
                }
            },
            fetchMediaPage: async (conversationId, type, limit, force, filters) => {
                const defaultLimit = type === 'image' ? 24 : 20;
                const resolvedLimit = limit ?? defaultLimit;

                if (force) {
                    set((state) => {
                        const prevConvo = state.mediaPagination[conversationId];
                        return {
                            mediaPagination: {
                                ...state.mediaPagination,
                                [conversationId]: {
                                    image: { items: [], page: 0, hasMore: true, isFetching: false, nextCursor: '' as string | null, limit: 24 },
                                    file: { items: [], page: 0, hasMore: true, isFetching: false, nextCursor: '' as string | null, limit: 20 },
                                    link: { items: [], page: 0, hasMore: true, isFetching: false, nextCursor: '' as string | null, limit: 20 },
                                    ...(prevConvo ? { ...prevConvo } : {}),
                                    [type]: {
                                        items: [],
                                        page: 0,
                                        hasMore: true,
                                        isFetching: true,
                                        nextCursor: '' as string | null,
                                        limit: resolvedLimit,
                                    },
                                },
                            },
                        };
                    });
                    try {
                        const res = await chatService.fetchMedia(conversationId, type, resolvedLimit, undefined, filters);
                        const fetched = res.messages ?? [];
                        const noMoreData = fetched.length === 0 || fetched.length < resolvedLimit || !res.nextCursor;
                        set((state) => {
                            const prevConvo = state.mediaPagination[conversationId];
                            if (!prevConvo) return state;
                            return {
                                mediaPagination: {
                                    ...state.mediaPagination,
                                    [conversationId]: {
                                        ...prevConvo,
                                        [type]: {
                                            ...prevConvo[type],
                                            items: fetched,
                                            page: 1,
                                            hasMore: !noMoreData,
                                            isFetching: false,
                                            nextCursor: noMoreData ? null : res.nextCursor,
                                        },
                                    },
                                },
                            };
                        });
                    } catch (error) {
                        console.error('Failed to fetch media page (force):', error);
                        set((state) => {
                            const prevConvo = state.mediaPagination[conversationId];
                            if (!prevConvo) return state;
                            return {
                                mediaPagination: {
                                    ...state.mediaPagination,
                                    [conversationId]: {
                                        ...prevConvo,
                                        [type]: { ...prevConvo[type], isFetching: false },
                                    },
                                },
                            };
                        });
                    }
                    return;
                }

                const current = get().mediaPagination[conversationId]?.[type];
                if (current?.isFetching || current?.hasMore === false) {
                    return;
                }

                if (!current) {
                    set((state) => {
                        const prevConvo = state.mediaPagination[conversationId] ?? {
                            image: {
                                items: [],
                                page: 0,
                                hasMore: true,
                                isFetching: false,
                                nextCursor: '' as string | null,
                                limit: 24,
                            },
                            file: {
                                items: [],
                                page: 0,
                                hasMore: true,
                                isFetching: false,
                                nextCursor: '' as string | null,
                                limit: 20,
                            },
                            link: {
                                items: [],
                                page: 0,
                                hasMore: true,
                                isFetching: false,
                                nextCursor: '' as string | null,
                                limit: 20,
                            },
                        };
                        return {
                            mediaPagination: {
                                ...state.mediaPagination,
                                [conversationId]: {
                                    ...prevConvo,
                                    [type]: {
                                        items: [],
                                        page: 0,
                                        hasMore: true,
                                        isFetching: false,
                                        nextCursor: '' as string | null,
                                        limit: limit ?? prevConvo[type].limit,
                                    },
                                },
                            },
                        };
                    });
                } else if (limit && current.limit !== limit) {
                    set((state) => {
                        const prevConvo = state.mediaPagination[conversationId];
                        if (!prevConvo) return state;
                        return {
                            mediaPagination: {
                                ...state.mediaPagination,
                                [conversationId]: {
                                    ...prevConvo,
                                    [type]: {
                                        ...prevConvo[type],
                                        limit,
                                    },
                                },
                            },
                        };
                    });
                }

                const active = get().mediaPagination[conversationId]?.[type];
                if (!active || active.isFetching || !active.hasMore) {
                    return;
                }

                set((state) => {
                    const prevConvo = state.mediaPagination[conversationId];
                    if (!prevConvo) return state;
                    return {
                        mediaPagination: {
                            ...state.mediaPagination,
                            [conversationId]: {
                                ...prevConvo,
                                [type]: {
                                    ...prevConvo[type],
                                    isFetching: true,
                                },
                            },
                        },
                    };
                });

                try {
                    const res = await chatService.fetchMedia(
                        conversationId,
                        type,
                        active.limit,
                        active.nextCursor || undefined,
                        filters,
                    );

                    const fetched = res.messages ?? [];

                    set((state) => {
                        const prevConvo = state.mediaPagination[conversationId] ?? {
                            image: {
                                items: [],
                                page: 0,
                                hasMore: true,
                                isFetching: false,
                                nextCursor: '' as string | null,
                                limit: 24,
                            },
                            file: {
                                items: [],
                                page: 0,
                                hasMore: true,
                                isFetching: false,
                                nextCursor: '' as string | null,
                                limit: 20,
                            },
                            link: {
                                items: [],
                                page: 0,
                                hasMore: true,
                                isFetching: false,
                                nextCursor: '' as string | null,
                                limit: 20,
                            },
                        };
                        const prevPage = prevConvo[type];
                        const merged = [...prevPage.items];

                        for (const item of fetched) {
                            if (!merged.some((m) => m._id === item._id)) {
                                merged.push(item);
                            }
                        }

                        const noMoreData = fetched.length === 0 || fetched.length < prevPage.limit || !res.nextCursor;

                        return {
                            mediaPagination: {
                                ...state.mediaPagination,
                                [conversationId]: {
                                    ...prevConvo,
                                    [type]: {
                                        ...prevPage,
                                        items: merged,
                                        page: prevPage.page + 1,
                                        hasMore: !noMoreData,
                                        isFetching: false,
                                        nextCursor: noMoreData ? null : res.nextCursor,
                                    },
                                },
                            },
                        };
                    });
                } catch (error) {
                    console.error('Failed to fetch media page:', error);
                    set((state) => {
                        const prevConvo = state.mediaPagination[conversationId];
                        if (!prevConvo) return state;

                        return {
                            mediaPagination: {
                                ...state.mediaPagination,
                                [conversationId]: {
                                    ...prevConvo,
                                    [type]: {
                                        ...prevConvo[type],
                                        isFetching: false,
                                    },
                                },
                            },
                        };
                    });
                }
            },
            resetMediaPagination: (conversationId, type) => {
                set((state) => {
                    const prevConvo = state.mediaPagination[conversationId];
                    if (!prevConvo) return state;

                    if (!type) {
                        const nextMediaPagination = { ...state.mediaPagination };
                        delete nextMediaPagination[conversationId];
                        return { mediaPagination: nextMediaPagination };
                    }

                    return {
                        mediaPagination: {
                            ...state.mediaPagination,
                            [conversationId]: {
                                ...prevConvo,
                                [type]: {
                                    items: [],
                                    page: 0,
                                    hasMore: true,
                                    isFetching: false,
                                    nextCursor: '' as string | null,
                                    limit: prevConvo[type].limit,
                                },
                            },
                        },
                    };
                });
            },
            updateMessageReaction: (messageId, reactions) => {
                set((state) => {
                    const nextMessages = { ...state.messages };
                    let changed = false;

                    for (const convoId in nextMessages) {
                        const convo = nextMessages[convoId];
                        const index = convo.items.findIndex(m => m._id === messageId);
                        if (index !== -1) {
                            const newItems = [...convo.items];
                            newItems[index] = { ...newItems[index], reactions };
                            nextMessages[convoId] = { ...convo, items: newItems };
                            changed = true;
                            break;
                        }
                    }

                    if (!changed) return state;
                    return { messages: nextMessages };
                });
            },
            updateMessageAppealLocal: (conversationId, messageId, appeal) => {
                const targetConversationId = String(conversationId || "");
                const targetMessageId = String(messageId || "");
                if (!targetConversationId || !targetMessageId || !appeal) return;

                const patchMessage = (message: any) =>
                    String(message?._id || "") === targetMessageId
                        ? { ...message, appeal }
                        : message;

                set((state) => {
                    const currentMessages = state.messages[targetConversationId];
                    const nextMessages = currentMessages
                        ? {
                            ...state.messages,
                            [targetConversationId]: {
                                ...currentMessages,
                                items: currentMessages.items.map(patchMessage),
                                pinnedMessages: (currentMessages.pinnedMessages || []).map(patchMessage),
                            },
                        }
                        : state.messages;

                    return {
                        messages: nextMessages,
                        searchResults: {
                            ...state.searchResults,
                            items: state.searchResults.items.map(patchMessage),
                        },
                    };
                });
            },
            restoreMessageLocal: (conversationId, restoredMessage, lastMessage = null) => {
                const targetConversationId = String(conversationId || "");
                const targetMessageId = String(restoredMessage?._id || "");
                if (!targetConversationId || !targetMessageId) return;

                const patchMessage = (message: any) =>
                    String(message?._id || "") === targetMessageId
                        ? { ...message, ...restoredMessage, status: message.status || restoredMessage.status }
                        : message;

                set((state) => {
                    const currentMessages = state.messages[targetConversationId];
                    const nextMessages = currentMessages
                        ? {
                            ...state.messages,
                            [targetConversationId]: {
                                ...currentMessages,
                                items: currentMessages.items.map(patchMessage),
                                pinnedMessages: (currentMessages.pinnedMessages || []).map(patchMessage),
                            },
                        }
                        : state.messages;

                    const patchConversation = (conversation: Conversation) => {
                        if (String(conversation._id) !== targetConversationId) return conversation;
                        if (!lastMessage || String(conversation.lastMessage?._id || "") !== targetMessageId) return conversation;
                        return { ...conversation, lastMessage };
                    };

                    return {
                        messages: nextMessages,
                        conversations: state.conversations.map(patchConversation),
                        groupConversations: state.groupConversations.map(patchConversation),
                        searchResults: {
                            ...state.searchResults,
                            items: state.searchResults.items.map(patchMessage),
                        },
                    };
                });
            },
            expireMessageLocal: (
                conversationId: string,
                messageId: string,
                expiredAt?: string | null,
                placeholder = DISAPPEARED_MESSAGE_PLACEHOLDER,
            ) => {
                useMediaCacheStore.getState().clearUrl(messageId);
                set((state) => {
                    const currentMessages = state.messages[conversationId];
                    const nextMessages = currentMessages
                        ? {
                            ...state.messages,
                            [conversationId]: {
                                ...currentMessages,
                                items: currentMessages.items.map((message) =>
                                    message._id === messageId
                                        ? {
                                            ...message,
                                            content: null,
                                            filePublicId: null,
                                            fileUrl: null,
                                            fileName: null,
                                            fileSize: null,
                                            mimeType: null,
                                            reactions: [],
                                            isPinned: false,
                                            pinnedAt: null,
                                            isExpired: true,
                                            expiredAt: expiredAt || new Date().toISOString(),
                                        }
                                        : message
                                ),
                                pinnedMessages: currentMessages.pinnedMessages.filter(
                                    (message) => message._id !== messageId
                                ),
                            },
                        }
                        : state.messages;

                    const currentMedia = state.media[conversationId];
                    const nextMedia = currentMedia
                        ? {
                            ...state.media,
                            [conversationId]: {
                                images: currentMedia.images.filter((message) => message._id !== messageId),
                                files: currentMedia.files.filter((message) => message._id !== messageId),
                                links: currentMedia.links.filter((message) => message._id !== messageId),
                            },
                        }
                        : state.media;

                    const currentPagination = state.mediaPagination[conversationId];
                    const nextMediaPagination = currentPagination
                        ? {
                            ...state.mediaPagination,
                            [conversationId]: {
                                ...currentPagination,
                                image: {
                                    ...currentPagination.image,
                                    items: currentPagination.image.items.filter((message) => message._id !== messageId),
                                },
                                file: {
                                    ...currentPagination.file,
                                    items: currentPagination.file.items.filter((message) => message._id !== messageId),
                                },
                                link: {
                                    ...currentPagination.link,
                                    items: currentPagination.link.items.filter((message) => message._id !== messageId),
                                },
                            },
                        }
                        : state.mediaPagination;

                    const patchConversation = (conversation: Conversation) => {
                        if (conversation._id !== conversationId || conversation.lastMessage?._id !== messageId) {
                            return conversation;
                        }
                        return {
                            ...conversation,
                            lastMessage: {
                                ...conversation.lastMessage,
                                content: placeholder,
                                isExpired: true,
                            },
                        };
                    };

                    return {
                        messages: nextMessages,
                        media: nextMedia,
                        mediaPagination: nextMediaPagination,
                        conversations: state.conversations.map(patchConversation),
                        groupConversations: state.groupConversations.map(patchConversation),
                        searchResults: {
                            ...state.searchResults,
                            items: state.searchResults.items.filter((message) => message._id !== messageId),
                        },
                        replyingTo: state.replyingTo?._id === messageId ? null : state.replyingTo,
                    };
                });
            },
            reactToMessage: async (messageId, emoji) => {
                try {
                    const { reactions } = await chatService.reactToMessage(messageId, emoji);
                    get().updateMessageReaction(messageId, reactions);
                } catch (error) {
                    console.error('Failed to react to message:', error);
                    throw error;
                }
            },
            updateDisappearingSetting: async (conversationId, payload) => {
                const previous = get().conversations.find((conversation) => conversation._id === conversationId);
                const optimisticPatch = {
                    disappearingEnabled: payload.enabled,
                    disappearingDisableAt: payload.enabled && payload.durationSeconds
                        ? new Date(Date.now() + payload.durationSeconds * 1000).toISOString()
                        : null,
                    ...(payload.durationSeconds
                        ? { disappearingAutoDisableSeconds: payload.durationSeconds }
                        : {}),
                };
                const patchConversation = (conversation: Conversation, patch: Partial<Conversation>) => (
                    conversation._id === conversationId ? { ...conversation, ...patch } : conversation
                );

                set((state) => ({
                    conversations: state.conversations.map((conversation) =>
                        patchConversation(conversation, optimisticPatch)
                    ),
                    groupConversations: state.groupConversations.map((conversation) =>
                        patchConversation(conversation, optimisticPatch)
                    ),
                }));

                try {
                    const response = await chatService.updateDisappearingSetting(conversationId, payload);
                    const confirmedPatch = {
                        disappearingEnabled: response.setting.enabled,
                        disappearingAutoDisableSeconds: response.setting.durationSeconds,
                        disappearingDisableAt: response.setting.disableAt ?? null,
                        disappearingEnabledBy: response.setting.enabledBy ?? null,
                        disappearingEnabledAt: response.setting.enabledAt ?? null,
                    };
                    set((state) => ({
                        conversations: state.conversations.map((conversation) =>
                            patchConversation(conversation, confirmedPatch)
                        ),
                        groupConversations: state.groupConversations.map((conversation) =>
                            patchConversation(conversation, confirmedPatch)
                        ),
                    }));
                    return { warning: response.warning };
                } catch (error) {
                    if (previous) {
                        set((state) => ({
                            conversations: state.conversations.map((conversation) =>
                                patchConversation(conversation, previous)
                            ),
                            groupConversations: state.groupConversations.map((conversation) =>
                                patchConversation(conversation, previous)
                            ),
                        }));
                    }
                    throw error;
                }
            },
            markGroupAsDisbanded: (conversationId: string) => {
                set((state) => {
                    const nextMessages = { ...state.messages };
                    const nextMedia = { ...state.media };
                    const nextMediaPagination = { ...state.mediaPagination };
                    const nextDrafts = { ...state.drafts };
                    delete nextMessages[conversationId];
                    delete nextMedia[conversationId];
                    delete nextMediaPagination[conversationId];
                    delete nextDrafts[conversationId];

                    const isActive = state.activeConversationId === conversationId;
                    const isFocused = state.focusedConversationId === conversationId;

                    return {
                        conversations: state.conversations.filter((c) => c._id !== conversationId),
                        groupConversations: state.groupConversations.filter((c) => c._id !== conversationId),
                        activeConversationId: isActive ? null : state.activeConversationId,
                        focusedConversationId: isFocused ? null : state.focusedConversationId,
                        activeSidebar: isActive ? null : state.activeSidebar,
                        replyingTo: isActive ? null : state.replyingTo,
                        messages: nextMessages,
                        media: nextMedia,
                        mediaPagination: nextMediaPagination,
                        drafts: nextDrafts,
                    };
                });
            },
            disbandGroup: async (conversationId: string) => {
                get().markGroupAsDisbanded(conversationId);
                try {
                    await chatService.disbandGroup(conversationId);
                } catch (error) {
                    console.error("Lỗi khi giải tán nhóm:", error);
                    throw error;
                }
            },
            transferAdminRole: async (conversationId, memberId) => {
                try {
                    await chatService.transferAdminRole(conversationId, memberId);
                    get().updateAdminLocal(conversationId, memberId);
                } catch (error) {
                    console.error("Lỗi khi chuyển quyền trưởng nhóm:", error);
                    throw error;
                }
            },
            updateAdminLocal: (conversationId, newAdminId) => {
                set((state) => ({
                    conversations: state.conversations.map((c) =>
                        c._id === conversationId ? { ...c, group: { ...c.group, admins: [newAdminId] } } : c
                    )
                }));
            },
            leaveGroup: async (conversationId: string, silent?: boolean, newAdminId?: string) => {
                try {
                    await chatService.leaveGroup(conversationId, silent, newAdminId);
                    set((state) => {
                        const nextConversations = state.conversations.filter(c => c._id !== conversationId);
                        const isActive = state.activeConversationId === conversationId;
                        const isFocused = state.focusedConversationId === conversationId;
                        const nextMessages = { ...state.messages };
                        delete nextMessages[conversationId];
                        return {
                            conversations: nextConversations,
                            activeConversationId: isActive ? null : state.activeConversationId,
                            focusedConversationId: isFocused ? null : state.focusedConversationId,
                            messages: nextMessages,
                        };
                    });
                } catch (error) {
                    console.error("Lỗi khi rời nhóm:", error);
                    throw error;
                }
            },
            forwardMessage: async (
                messageId: string,
                targetConversationIds: string[],
                forwardBatch?: { clientBatchId?: string | null; clientBatchIndex?: number; clientBatchSize?: number }
            ) => {
                try {
                    const result = await chatService.forwardMessage(messageId, targetConversationIds, forwardBatch);
                    return { forwarded: result.forwarded, errors: result.errors };
                } catch (error) {
                    console.error("Lỗi khi chuyển tiếp tin nhắn:", error);
                    throw error;
                }
            },
            muteConversation: async (conversationId: string, target: 'messages' | 'meetings' | 'both', duration: '1h' | '8h' | '24h' | 'forever' | 'off') => {
                try {
                    const response = await chatService.updateConversationMute(conversationId, target, duration);
                    const { user } = useAuthStore.getState();
                    if (!user) return;

                    set((state) => {
                        const updatedConversations = state.conversations.map((c) => {
                            if (c._id === conversationId) {
                                const newParticipants = c.participants.map((p) => {
                                    if ((p.userId?._id || p.userId)?.toString() === user._id.toString()) {
                                        return { ...p, mute: response.mute };
                                    }
                                    return p;
                                });
                                return { ...c, participants: newParticipants };
                            }
                            return c;
                        });
                        return { conversations: updatedConversations };
                    });

                    // Thêm Toast thông báo
                    if (duration === 'off') {
                        toast.success("Đã bật lại thông báo");
                    } else {
                        const targetText = target === 'both' ? 'tin nhắn và cuộc gọi' : (target === 'messages' ? 'tin nhắn' : 'cuộc gọi');
                        const durationText = duration === 'forever' ? 'cho đến khi bạn bật lại' : `trong ${duration.replace('h', ' giờ')}`;
                        toast.success(`Đã tắt thông báo ${targetText} ${durationText}`);
                    }
                } catch (error) {
                    console.error('Lỗi khi tắt thông báo hội thoại:', error);
                    throw error;
                }
            },
        }),

        {
            name: "chat-storage",
            storage: createJSONStorage(() => sessionStorage),
            partialize: (state) => ({
                conversations: filterVisibleConversations(state.conversations),
                drafts: Object.fromEntries(
                    Object.entries(state.drafts).map(([id, draft]) => [
                        id,
                        draft ? { ...draft, attachment: null } : null
                    ])
                ),
            })
        }
    )
)
