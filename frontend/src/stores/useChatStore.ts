import { chatService } from '@/services/chatService';
import type { ChatState, SendMessagePayload } from '@/types/store';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';
import useMediaCacheStore from './useMediaCacheStore';

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
            replyingTo: null,
            activeSidebar: null,
            searchResults: {
                items: [] as import('@/types/chat').Message[],
                isSearching: false,
                query: '',
            },

            setActiveConversation: (id) => set({ activeConversationId: id, focusedConversationId: id }),
            setFocusedConversation: (id) => set({ focusedConversationId: id }),
            setReplyingTo: (message) => set({ replyingTo: message }),
            clearConversationCache: (keepConversationIds) => {
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
                });
            },
            fetchConversations: async () => {
                try {
                    set({ convoLoading: true });
                    const { conversations } = await chatService.fetchConversations();

                    conversations.sort((a: any, b: any) => {
                        const dateA = new Date(a.lastMessage?.createdAt || a.createdAt || a.updatedAt || 0).getTime();
                        const dateB = new Date(b.lastMessage?.createdAt || b.createdAt || b.updatedAt || 0).getTime();
                        return dateB - dateA;
                    });

                    set({ conversations, convoLoading: false });
                } catch (error) {
                    console.error("Lỗi khi tải danh sách cuộc trò chuyện:", error);
                    set({ convoLoading: false });
                }
            },
            fetchMessages: async (conversationId) => {
                const { activeConversationId, messages } = get();
                const { user } = useAuthStore.getState();

                const convoId = conversationId ?? activeConversationId;

                if (!convoId) return;

                const current = messages?.[convoId];
                const nextCursor = current?.nextCursor === undefined ? "" : current?.nextCursor;
                if (nextCursor === null) return;

                set({ messageLoading: true });

                try {
                    const { messages: fetched, cursor, pinnedMessages } = await chatService.fetchMessages(convoId, nextCursor);
                    const processed = fetched.map((m) => ({
                        ...m,
                        isOwn: m.senderId === user?._id,
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

                        return {
                            messages: {
                                ...state.messages,
                                [convoId]: {
                                    ...prevState,
                                    items: merged,
                                    hasMore: !!cursor,
                                    nextCursor: cursor ?? null,
                                    pinnedMessages: pinnedMessages ?? prevState.pinnedMessages ?? [],
                                },
                            },
                        };
                    });

                } catch (error) {
                    console.error("Lỗi khi tải tin nhắn:", error);
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
                    replyToMessageId: replyingTo?._id ?? undefined,
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
                    tempId = `temp_${Date.now()}`;

                    if (isFileUpload && payload.file) {
                        tempBlobUrl = URL.createObjectURL(payload.file);
                    }

                    const optimistic = {
                        _id: tempId,
                        conversationId: convoId,
                        senderId: user._id,
                        type: payload.type,
                        content: payload.content ?? null,
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


                    set((state) => ({
                        conversations: state.conversations.map((c) =>
                            c._id === activeConversationId ? { ...c, seenBy: [] } : c
                        ),
                    }));
                } catch (error) {
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
                                            m._id === tempId ? { ...m, status: 'error' as const } : m
                                        ),
                                    },
                                },
                            };
                        });
                    }
                    throw error;
                }
            },



            addMessage: async (message) => {
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

                        updatedConversations.sort((a, b) => {
                            const dateA = new Date(a.lastMessage?.createdAt || a.createdAt || 0).getTime();
                            const dateB = new Date(b.lastMessage?.createdAt || b.createdAt || 0).getTime();
                            return dateB - dateA;
                        });

                        // Also update selectedConvo if it's the active one
                        const isActive = state.activeConversationId === conversation._id;

                        return {
                            conversations: updatedConversations,
                            ...(isActive ? { selectedConvo: updatedConv } : {})
                        };
                    });
                }
            },
            markAsSeen: async () => {
                try {
                    const { user } = useAuthStore.getState();
                    const { activeConversationId, conversations } = get();
                    if (!activeConversationId || !user)
                        return;
                    const convo = conversations.find((c) => c._id === activeConversationId);
                    if (!convo || !convo.lastMessage) return;

                    const isUnread = (convo.unreadCounts?.[user._id] ?? 0) > 0;
                    
                    if (!isUnread) return;

                    await chatService.markAsSeen(activeConversationId);
                    set((state) => ({
                        conversations: state.conversations.map((c) => (
                            c._id === activeConversationId && c.lastMessage ? {
                                ...c,
                                unreadCounts: {
                                    ...c.unreadCounts,
                                    [user._id]: 0
                                }
                            }
                                : c
                        ))
                    }));

                } catch (error) {
                    console.error("Lỗi khi đánh dấu cuộc trò chuyện đã xem:", error);
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
        }),
        {
            name: "chat-storage",
            partialize: (state) => ({ conversations: state.conversations })
        }
    )
)