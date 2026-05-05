import { chatService } from '@/services/chatService';
import { toast } from 'sonner';
import type { ChatState, DraftInfo, SendMessagePayload } from '@/types/store';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';
import useMediaCacheStore from './useMediaCacheStore';
import type { Reminder } from '@/types/reminder';

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

export const useChatStore = create<ChatState>()(
    persist(
        (set, get) => ({
            conversations: [],
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

            activeSidebar: null,
            searchResults: {
                items: [] as import('@/types/chat').Message[],
                isSearching: false,
                query: '',
            },

            setActiveConversation: (id: string | null) => {

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
            setActiveSidebar: (sidebar) => set({ activeSidebar: sidebar }),
            clearSearch: () => set({
                searchResults: { items: [], isSearching: false, query: '' },
            }),
            searchMessages: async (query: string, filters?: { senderId?: string; fromDate?: string; toDate?: string }) => {
                const { activeConversationId } = get();
                if (!activeConversationId || !query.trim()) return;

                set((state) => ({
                    searchResults: { ...state.searchResults, isSearching: true, query },
                }));

                try {
                    const { messages } = await chatService.searchMessages(activeConversationId, query, filters);
                    const { user } = useAuthStore.getState();
                    const processed = messages.map((m: any) => ({
                        ...m,
                        isOwn: m.senderId?._id === user?._id || m.senderId === user?._id,
                    }));
                    set((state) => ({
                        searchResults: { ...state.searchResults, items: processed, isSearching: false },
                    }));
                } catch (error) {
                    console.error('Lỗi khi tìm kiếm tin nhắn:', error);
                    set((state) => ({
                        searchResults: { ...state.searchResults, isSearching: false },
                    }));
                }
            },
            reset: () => {
                set({
                    conversations: [],
                    messages: {},
                    media: {},
                    mediaPagination: {},
                    activeConversationId: null,
                    focusedConversationId: null,
                    convoLoading: false,
                    replyingTo: null,
                    activeSidebar: null,
                    searchResults: { items: [], isSearching: false, query: '' },
                    drafts: {},
                });
            },
            fetchConversations: async () => {
                try {
                    set({ convoLoading: true });
                    const { conversations } = await chatService.fetchConversations();

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

                    set({ conversations: sortConversations(conversations as any), convoLoading: false });
                } catch (error) {
                    console.error("Lỗi khi tải danh sách cuộc trò chuyện:", error);
                    set({ convoLoading: false });
                }
            },
            fetchMessages: async (conversationId?: string) => {
                const { activeConversationId, messages } = get();
                const { user } = useAuthStore.getState();

                const convoId = conversationId ?? activeConversationId;

                if (!convoId) return;

                const current = messages?.[convoId];
                const nextCursor = current?.nextCursor === undefined ? "" : current?.nextCursor;
                if (nextCursor === null) return;

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

                        const prevItems = prevState.items ?? [];
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

                set({ messageLoading: true });


                const { user } = useAuthStore.getState();
                const messages = get().messages[conversationId]?.items ?? [];
                if (messages.length === 0) return;

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

                set({ messageLoading: true });


                const { user } = useAuthStore.getState();
                const messages = get().messages[conversationId]?.items ?? [];
                if (messages.length === 0) return;

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

                        return {
                            messages: {
                                ...state.messages,
                                [conversationId]: {
                                    ...prevState,
                                    items: uniqueMerged,
                                    // If transitioning to normal mode, update nextCursor to support upward scrolling
                                    ...(isTransitioning ? {
                                        nextCursor: oldestMessage ? oldestMessage._id : prevState.nextCursor,
                                        hasMore: true
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
                        content: replyingTo.content,
                        fileName: replyingTo.fileName,
                        isRecalled: replyingTo.isRecalled,
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
                        metadata: payload.metadata,
                        fileName: payload.file?.name,
                        fileSize: payload.file?.size,
                        fileUrl: tempBlobUrl,
                        isRecalled: false,
                        isPinned: false,
                        createdAt: new Date().toISOString(),
                        isOwn: true,
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

                    if (tempId && convoId) {
                        set((state) => {
                            const prev = state.messages[convoId];
                            if (!prev) return state;

                            const alreadyExists = prev.items.some((m) => m._id === realMsg._id);
                            const items = alreadyExists
                                ? prev.items.filter((m) => m._id !== tempId)
                                : prev.items.map((m) =>
                                    m._id === tempId
                                        ? { ...realMsg, isOwn: true, status: 'sent' as const }
                                        : m
                                );
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

                    let prevItems = get().messages[convoId]?.items ?? [];

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

                        const prevMedia = state.media[convoId];
                        const prevMediaPagination = state.mediaPagination[convoId];
                        let nextMedia = prevMedia;
                        let nextMediaPagination = prevMediaPagination;
                        if (prevMedia) {
                            const mediaType = message.type;
                            if (mediaType === 'image' && (message.fileUrl || message.filePublicId)) {
                                const alreadyExists = prevMedia.images.some((m) => m._id === message._id);
                                if (!alreadyExists) {
                                    nextMedia = { ...prevMedia, images: [message, ...prevMedia.images].slice(0, 8) };
                                }
                            } else if (mediaType === 'file' && (message.fileUrl || message.filePublicId)) {
                                const alreadyExists = prevMedia.files.some((m) => m._id === message._id);
                                if (!alreadyExists) {
                                    nextMedia = { ...prevMedia, files: [message, ...prevMedia.files].slice(0, 3) };
                                }
                            } else if (mediaType === 'link' && message.content) {
                                const alreadyExists = prevMedia.links.some((m) => m._id === message._id);
                                if (!alreadyExists) {
                                    nextMedia = { ...prevMedia, links: [message, ...prevMedia.links].slice(0, 3) };
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
                                            items: [message, ...prevMediaPagination.image.items],
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
                                            items: [message, ...prevMediaPagination.file.items],
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
                                            items: [message, ...prevMediaPagination.link.items],
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
                                    items: [...prevState.items, message],
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
            updateConversation: (conversation) => {
                const { conversations, fetchConversations } = get();
                const exists = conversations.some((c) => c._id === conversation._id);

                if (!exists) {
                    fetchConversations();
                } else {
                    set((state) => {
                        const existingConv = state.conversations.find((c) => c._id === conversation._id);
                        if (!existingConv) return state;

                        // Only update participants if the new payload has fully populated participants
                        // (i.e., userId is an object with displayName, not a raw ObjectId string)
                        const newParticipants = conversation.participants;
                        const isPopulated = newParticipants?.[0]?.userId?.displayName !== undefined;

                        const updatedConv = {
                            ...existingConv,
                            ...conversation,
                            participants: (isPopulated ? newParticipants : null) || existingConv.participants
                        };

                        const updatedConversations = state.conversations.map((c) =>
                            c._id === conversation._id ? updatedConv : c
                        );

                        const sortedConversations = sortConversations(updatedConversations as any);

                        // Also update selectedConvo if it's the active one
                        const isActive = state.activeConversationId === conversation._id;

                        return {
                            conversations: sortedConversations,
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
                    if (convoIdx === -1) return state;

                    const nextConvos = [...state.conversations];
                    const convo = nextConvos[convoIdx];

                    if (convo.lastMessage?._id === messageId) {
                        const nextLastMsg = {
                            ...convo.lastMessage,
                            isDelivered: true,
                            deliveredTo: Array.from(new Set([...(convo.lastMessage.deliveredTo || []), deliveredMarker]))
                        };

                        nextConvos[convoIdx] = { ...convo, lastMessage: nextLastMsg };
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
                    await get().fetchConversations();
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
                }
            },
            updateGroupAvatar: async (conversationId: string, file: File) => {
                try {
                    const response = await chatService.updateGroupAvatar(conversationId, file);
                    if (response?.conversation) {
                        get().updateConversation(response.conversation);
                        return;
                    }

                    await get().fetchConversations();
                } catch (error) {
                    console.error("Lỗi khi cập nhật ảnh nhóm:", error);
                    throw error;
                }
            },
            updateGroupSettings: async (conversationId: string, isApprovalRequired: boolean) => {
                try {
                    await chatService.updateGroupSettings(conversationId, isApprovalRequired);
                    set((state) => ({
                        conversations: state.conversations.map((c) =>
                            c._id === conversationId ? { ...c, group: { ...c.group, isApprovalRequired } } : c
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
                            await fetchConversations();
                            targetId = conv?._id || conv;
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
                    await fetchConversations();
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
                        delete nextMessages[conversationId];

                        return {
                            conversations: nextConversations,
                            activeConversationId: isActive ? null : state.activeConversationId,
                            focusedConversationId: isFocused ? null : state.focusedConversationId,
                            messages: nextMessages,
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
            fetchMediaPage: async (conversationId, type, limit, force) => {
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
                        const res = await chatService.fetchMedia(conversationId, type, resolvedLimit, undefined);
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
            reactToMessage: async (messageId, emoji) => {
                try {
                    const { reactions } = await chatService.reactToMessage(messageId, emoji);
                    get().updateMessageReaction(messageId, reactions);
                } catch (error) {
                    console.error('Failed to react to message:', error);
                    throw error;
                }
            },
            markGroupAsDisbanded: (conversationId: string) => {
                set((state) => ({
                    conversations: state.conversations.map((c) =>
                        c._id === conversationId ? { ...c, disbanded: true } : c
                    )
                }));
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
            partialize: (state) => ({
                conversations: state.conversations,
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
