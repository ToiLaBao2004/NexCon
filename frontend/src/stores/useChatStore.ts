import { chatService } from '@/services/chatService';
import type { ChatState } from '@/types/store';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './useAuthStore';

export const useChatStore = create<ChatState>()(
    persist(
        (set, get) => ({
            conversations: [],
            messages: {},
            activeConversationId: null,
            focusedConversationId: null,
            convoLoading: false,
            messageLoading: false,

            setActiveConversation: (id) => set({ activeConversationId: id, focusedConversationId: id }),
            setFocusedConversation: (id) => set({ focusedConversationId: id }),
            reset: () => {
                set({
                    conversations: [],
                    messages: {},
                    activeConversationId: null,
                    focusedConversationId: null,
                    convoLoading: false,
                });
            },
            fetchConversations: async () => {
                try {
                    set({ convoLoading: true });
                    const { conversations } = await chatService.fetchConversations();

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
            sendDirectMessage: async (recipientId, content, imgUrl) => {
                try {
                    const { activeConversationId } = get();
                    await chatService.sendDirectMessage(recipientId, content, imgUrl, activeConversationId || undefined);

                    set((state) => ({
                        conversations: state.conversations.map((c) => c._id === activeConversationId ? { ...c, seenBy: [] } : c
                        ),
                    }));
                } catch (error) {
                    console.error("Lỗi khi gửi tin nhắn trực tiếp:", error);
                    throw error;
                }
            },
            sendGroupMessage: async (conversationId, content, imgUrl) => {
                try {
                    await chatService.sendGroupMessage(conversationId, content, imgUrl);
                    set((state) => ({
                        conversations: state.conversations.map((c) => c._id === get().activeConversationId ? { ...c, seenBy: [] } : c
                        ),
                    }))
                } catch (error) {
                    console.error("Lỗi khi gửi tin nhắn nhóm:", error);
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

                        return {
                            messages: {
                                ...state.messages,
                                [convoId]: {
                                    ...prevState,
                                    items: [...prevState.items, message],
                                    pinnedMessages: prevState.pinnedMessages ?? [],
                                },
                            },
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

                        const updatedConv = { ...existingConv, ...conversation, participants: existingConv.participants };
                        
                        const updatedConversations = state.conversations.map((c) =>
                            c._id === conversation._id ? updatedConv : c
                        );

                        updatedConversations.sort((a, b) => {
                            const dateA = new Date(a.lastMessage?.createdAt || a.createdAt || 0).getTime();
                            const dateB = new Date(b.lastMessage?.createdAt || b.createdAt || 0).getTime();
                            return dateB - dateA;
                        });

                        return { conversations: updatedConversations };
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
                    const isSeen = convo.seenBy?.some((s: any) => {
                        const id = typeof s === "string" ? s : s._id?.toString();
                        return id === user._id;
                    });

                    // Nếu đã hết tin nhắn chưa đọc VÀ đã có tên trong danh sách seenBy thì không cần gọi API
                    if (!isUnread && isSeen) return;

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
                                        m._id === messageId ? { ...m, recalled: true } : m
                                    )
                                }
                            }
                        }
                    });
                } catch (error) {
                    console.error("Lỗi khi thu hồi tin nhắn:", error);
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

                    const updatedMessage = updatedItems.find((m) => m._id === messageId);
                    let nextPinned = prevState.pinnedMessages ?? [];

                    if (updatedMessage?.isPinned) {
                        nextPinned = nextPinned.some((m) => m._id === messageId)
                            ? nextPinned.map((m) => (m._id === messageId ? updatedMessage : m))
                            : [updatedMessage, ...nextPinned];
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

                    return {
                        messages: {
                            ...state.messages,
                            [conversationId]: {
                                ...prevState,
                                items: updatedItems,
                                pinnedMessages: updatedPinned,
                            },
                        },
                    };
                }),
        }),
        {
            name: "chat-storage",
            partialize: (state) => ({ conversations: state.conversations })
        }
    )
)