import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { useNotificationStore } from "./useNotificationStore";
import { useCallStore } from "./useCallStore";
import { useCallHistoryStore } from "./useCallHistoryStore";
import { toast } from "sonner";
import { playMessageSound, playNotificationSound } from "@/utils/sound";

const baseURL = import.meta.env.VITE_SOCKET_URL;

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  onlineUsers: [],
  typingUsers: {},
  setTypingUser: (conversationId, userId, isTyping) => {
    set((state) => {
      const currentTypingUsers = state.typingUsers[conversationId] || [];
      if (isTyping && !currentTypingUsers.includes(userId)) {
        return {
          typingUsers: {
            ...state.typingUsers,
            [conversationId]: [...currentTypingUsers, userId],
          },
        };
      } else if (!isTyping && currentTypingUsers.includes(userId)) {
        return {
          typingUsers: {
            ...state.typingUsers,
            [conversationId]: currentTypingUsers.filter((id) => id !== userId),
          },
        };
      }
      return state;
    });
  },
  emitTyping: (conversationId) => {
    const socket = get().socket;
    if (socket) {
      socket.emit("typing", { conversationId });
    }
  },
  emitStopTyping: (conversationId) => {
    const socket = get().socket;
    if (socket) {
      socket.emit("stop-typing", { conversationId });
    }
  },
  connectSocket() {
    const accessToken = useAuthStore.getState().accessToken;
    const existingSocket = get().socket;

    if (existingSocket) return;

    const socket: Socket = io(baseURL, {
      auth: { token: accessToken },
      transports: ["websocket"],
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
        type: conversation.lastMessage.type,
        createdAt: conversation.lastMessage.createdAt,
        sender: {
          _id: conversation.lastMessage.senderId,
          displayName: "",
          avatarUrl: null,
        },
      };

      const updatedConversation = {
        ...conversation,
        lastMessage,
        unreadCounts,
      };

      const isFocused =
        chatState.focusedConversationId === message.conversationId;
      const senderId = message.senderId || message.sender?._id;
      const isMine = String(senderId) === String(currentUserId);

      if (isFocused) {
        chatState.markAsSeen();
      }

      chatState.updateConversation(updatedConversation);

      if (!isMine) {
        void playMessageSound();
      }
    });

    socket.on("read-message", ({ conversationId, lastMessage, seenBy }) => {
      const updated = {
        _id: typeof conversationId === 'object' ? conversationId._id : conversationId,
        lastMessage,
        seenBy,
      };
      useChatStore.getState().updateConversation(updated as any);
    });

    socket.on("new-friend-request", ({ friendRequest }) => {
      useFriendStore.getState().addIncomingRequest(friendRequest);
      toast.info(
        `${friendRequest.from.displayName} đã gửi cho bạn một lời mời kết bạn!`,
        {
          duration: 5000,
        },
      );
    });

    socket.on("friend-request-accepted", ({ from, message, newFriend }) => {
      if (newFriend) {
        useFriendStore.getState().addFriend(newFriend);
      }
      useFriendStore.getState().fetchSentRequests();
      toast.success(
        message || `${from.displayName} đã chấp nhận lời mời kết bạn của bạn!`,
        {
          duration: 5000,
        },
      );
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
      void playNotificationSound();
    });

    socket.on("new-conversation", ({ conversation }) => {
      useChatStore.getState().updateConversation(conversation);
      get().joinConversation(conversation._id);
    });

    socket.on(
      "recall-message",
      ({ conversationId, messageId, content, isRecalled }) => {
        useChatStore
          .getState()
          .recallMessageLocal(conversationId, messageId, {
            content,
            isRecalled,
          });
        useChatStore.getState().fetchConversations();
      },
    );

    socket.on("pin-message", (payload) => {
      const { pinMessageLocal } = useChatStore.getState();

      if (payload.unpinnedMessageId) {
        pinMessageLocal(payload.conversationId, payload.unpinnedMessageId, {
          isPinned: false,
          pinnedAt: null,
        });
      }

      if (payload.pinnedMessageId) {
        pinMessageLocal(payload.conversationId, payload.pinnedMessageId, {
          isPinned: true,
          pinnedAt: payload.pinnedAt,
        });
      }
    });

    socket.on("user-blocked", ({ blockedBy }) => {
      useFriendStore.getState().addBlockedBy(blockedBy);
    });

    socket.on("user-unblocked", ({ unblockedBy }) => {
      useFriendStore.getState().removeBlockedBy(unblockedBy);
    });

    socket.on("user-typing", ({ conversationId, userId }) => {
      get().setTypingUser(conversationId, userId, true);
    });

    socket.on("user-stopped-typing", ({ conversationId, userId }) => {
      get().setTypingUser(conversationId, userId, false);
    });


    const refreshCallHistory = () => {
      const activeConvoId = useChatStore.getState().activeConversationId;
      if (activeConvoId) {
        useCallHistoryStore.getState().fetchCallsByConversation(activeConvoId, true);
      }
      useChatStore.getState().fetchConversations();
    };

    socket.on("incoming-call", ({ from, offer, callType }) => {
      useCallStore.getState().handleIncomingCall(from, offer, callType);
      useChatStore.getState().fetchConversations();
    });

    socket.on("call-answered", ({ answer }) => {
      useCallStore.getState().handleCallAnswered(answer);
    });

    socket.on("call-rejected", () => {
      useCallStore.getState().handleCallRejected();
      refreshCallHistory();
    });

    socket.on("call-ended", () => {
      useCallStore.getState().handleCallEnded();
      refreshCallHistory();
    });

    socket.on("call-failed", ({ reason }) => {
      useCallStore.getState().handleCallFailed(reason);
      refreshCallHistory();
    });

    socket.on("ice-candidate", ({ candidate }) => {
      useCallStore.getState().handleIceCandidate(candidate);
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
      // Reset call state if any
      useCallStore.getState().handleCallEnded();
    }
  },
}));
