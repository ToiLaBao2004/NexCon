import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from './useChatStore';
import { useFriendStore } from './useFriendStore';
import { useNotificationStore } from './useNotificationStore';
import { toast } from 'sonner';
import { playMessageSound } from '@/utils/sound';

const baseURL = import.meta.env.VITE_SOCKET_URL;

export const useSocketStore = create<SocketState>((set, get) => ({
    socket: null,
    onlineUsers: [],
    connectSocket() {
        const accessToken = useAuthStore.getState().accessToken;
        const existingSocket = get().socket;

        if (existingSocket) return;

        const socket: Socket = io(baseURL, {
            auth: { token: accessToken },
            transports: ["websocket"]
        });

        set({ socket });

        socket.on("connect", () => {
            console.log("Connected to Socket");
        });

        socket.on("online-users", (userIds) => {
            set({ onlineUsers: userIds });
        });

        socket.on("new-message", ({ message, conversation, unreadCounts }) => {
            const chatState = useChatStore.getState();
            const currentUserId = useAuthStore.getState().user?._id;

            useChatStore.getState().addMessage(message);

            const lastMessage = {
                _id: conversation.lastMessage._id,
                content: conversation.lastMessage.content,
                createdAt: conversation.lastMessage.createdAt,
                sender: {
                    _id: conversation.lastMessage.senderId,
                    displayName: "",
                    avatarUrl: null
                }
            };

            const updatedConversation = {
                ...conversation,
                lastMessage,
                unreadCounts
            };

            const isFocused = chatState.focusedConversationId === message.conversationId;
            const senderId = message.senderId || message.sender?._id;
            const isMine = String(senderId) === String(currentUserId);

            if (isFocused) {
                chatState.markAsSeen();
            }

            chatState.updateConversation(updatedConversation);

            if (!isMine) {
                playMessageSound();
            }
        });

        socket.on("read-message", ({ conversationId, lastMessage }) => {
            const updated = {
                ...conversationId,
                lastMessage,
            };
            useChatStore.getState().updateConversation(updated);
        })

        socket.on("new-friend-request", ({ friendRequest }) => {
            useFriendStore.getState().addIncomingRequest(friendRequest);
            toast.info(`${friendRequest.from.displayName} đã gửi cho bạn một lời mời kết bạn!`, {
                duration: 5000,
            });
        });

        socket.on("friend-request-accepted", ({ from, message, newFriend }) => {
            if (newFriend) {
                useFriendStore.getState().addFriend(newFriend);
            }
            useFriendStore.getState().fetchSentRequests();
            toast.success(message || `${from.displayName} đã chấp nhận lời mời kết bạn của bạn!`, {
                duration: 5000,
            });
        });

        socket.on("friend-request-rejected", () => {
            useFriendStore.getState().fetchSentRequests();
        });

        socket.on("friend-request-cancelled", ({ requestId }) => {
            useFriendStore.getState().removeIncomingRequest(requestId);
        });

        socket.on("unfriended", ({ friendId }) => {
            useFriendStore.getState().removeFriend(friendId);
        });

        socket.on("new-notification", ({ notification }) => {
            useNotificationStore.getState().addNotification(notification);
        });

        socket.on("new-conversation", ({ conversation }) => {
            useChatStore.getState().updateConversation(conversation);
            get().joinConversation(conversation._id);
        });

        socket.on("recall-message", ({ conversationId, messageId, content, isRecalled }) => {
            useChatStore.getState().recallMessageLocal(conversationId, messageId, { content, isRecalled });
            useChatStore.getState().fetchConversations();
        });

        socket.on("user-blocked", ({ blockedBy }) => {
            useFriendStore.getState().addBlockedBy(blockedBy);
        });

        socket.on("user-unblocked", ({ unblockedBy }) => {
            useFriendStore.getState().removeBlockedBy(unblockedBy);
        });

    },

    joinConversation(conversationId: string) {
        const socket = get().socket;
        if (socket) {
            socket.emit("join-conversation", { conversationId });
        }
    },
    disconnectSocket() {
        const socket = get().socket;
        if (socket) {
            socket.disconnect();
            set({ socket: null });
        }
    },
}))