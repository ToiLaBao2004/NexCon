import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { useNotificationStore } from "./useNotificationStore";
import { useCallStore } from "./useCallStore";
import { useCallHistoryStore } from "./useCallHistoryStore";
import { useGroupCallStore } from "./useGroupCallStore";
import { toast } from "sonner";
import { playMessageSound, playNotificationSound } from "@/utils/sound";
import useMediaCacheStore from "./useMediaCacheStore";
import { useReminderStore } from "./useReminderStore";
import { showReminderToast } from "@/components/reminder/showReminderToast";

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

      if (message.signedUrl) {
        useMediaCacheStore.getState().setUrl(message._id, message.signedUrl);
      }

      useChatStore.getState().addMessage(message);

      const updatedConversation = {
        ...conversation,
        unreadCounts,
      };

      const isFocused =
        chatState.focusedConversationId === message.conversationId;
      const senderId = message.senderId || message.sender?._id;
      const isMine = String(senderId) === String(currentUserId);

      chatState.updateConversation(updatedConversation);

      if (isFocused) {
        chatState.markAsSeen();
      }

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
      const normalizedFriendId = friendId?.toString?.() || friendId;
      if (normalizedFriendId) {
        useFriendStore.getState().removeFriend(normalizedFriendId);
      }
    });

    socket.on("new-notification", ({ notification }) => {
      useNotificationStore.getState().addNotification(notification);
      void playNotificationSound();
    });

    socket.on("reminder-triggered", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
      showReminderToast(reminder);
    });

    socket.on("reminder-created", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
    });

    socket.on("reminder-snoozed", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
    });

    socket.on("reminder-updated", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
    });

    socket.on("reminder-deleted", ({ id }) => {
      const reminderId = typeof id === 'string' ? id.trim() : '';
      if (reminderId) {
        useReminderStore.getState().removeReminder(reminderId);
      }
      void useReminderStore.getState().fetchUpcomingCount();
    });

    socket.on("reminder-participation-updated", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
    });

    socket.on("reminders-bulk-deleted", ({ scope }) => {
      if (scope === 'upcoming' || scope === 'past' || scope === 'all') {
        useReminderStore.getState().removeRemindersByScope(scope);
      }
      void useReminderStore.getState().fetchUpcomingCount();
    });

    socket.on("shared-reminder-cancelled", ({ sharedKey }) => {
      if (typeof sharedKey === 'string' && sharedKey.trim()) {
        useReminderStore.getState().removeRemindersBySharedKey(sharedKey);
      }
      void useReminderStore.getState().fetchUpcomingCount();
    });

    socket.on("new-conversation", ({ conversation }) => {
      useChatStore.getState().updateConversation(conversation);
      get().joinConversation(conversation._id);
    });

    socket.on("conversation-updated", ({ conversation }) => {
      if (conversation) {
        useChatStore.getState().updateConversation(conversation);
      }
    });

    socket.on("members-added", ({ conversation }) => {
      if (conversation) {
        // Update the conversation with the fully-populated version from backend
        useChatStore.getState().updateConversation(conversation);
      } else {
        // Fallback: refetch all if no payload
        useChatStore.getState().fetchConversations();
      }
    });

    socket.on("member-removed", ({ conversation }) => {
      if (conversation) {
        useChatStore.getState().updateConversation(conversation);
      } else {
        useChatStore.getState().fetchConversations();
      }
    });

    socket.on("kicked-from-group", ({ conversationId }) => {
      const chatState = useChatStore.getState();
      const activeConvoId = chatState.activeConversationId;
      chatState.fetchConversations();
      if (activeConvoId === conversationId) {
        toast.error("Bạn đã bị đưa ra khỏi nhóm.");
        chatState.setActiveConversation(null);
      }
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

    socket.on("message-reaction", ({ messageId, reactions }) => {
      useChatStore.getState().updateMessageReaction(messageId, reactions);
    });

    socket.on("user-blocked", ({ blockedBy }) => {
      const blockerId = blockedBy?.toString?.() || blockedBy;
      if (!blockerId) return;
      useFriendStore.getState().addBlockedBy(blockerId);
      useFriendStore.getState().removeFriend(blockerId);
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

    socket.on("incoming-call", ({ from, callType, roomName }) => {
      useCallStore.getState().handleIncomingCall(from, callType, roomName);
      useChatStore.getState().fetchConversations();
    });

    socket.on("call-answered", ({ token, roomName }) => {
      useCallStore.getState().handleCallAnswered({ token, roomName });
    });

    socket.on("call-accepted", ({ token, roomName }) => {
      useCallStore.getState().handleCallAccepted({ token, roomName });
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

    // Group call events
    socket.on("group-call:started", (payload) => {
      useGroupCallStore.getState().handleGroupCallStarted(payload);
    });

    socket.on("group-call:incoming", (payload) => {
      useGroupCallStore.getState().handleGroupCallIncoming(payload);
    });

    socket.on("group-call:token", (payload) => {
      useGroupCallStore.getState().handleGroupCallToken(payload);
    });

    socket.on("group-call:user-joined", (payload) => {
      useGroupCallStore.getState().handleGroupCallUserJoined(payload);
    });

    socket.on("group-call:user-declined", (payload) => {
      useGroupCallStore.getState().handleGroupCallUserDeclined(payload);
    });

    socket.on("group-call:user-left", (payload) => {
      useGroupCallStore.getState().handleGroupCallUserLeft(payload);
    });

    socket.on("group-call:ended", (payload) => {
      useGroupCallStore.getState().handleGroupCallEnded(payload);
      refreshCallHistory();
    });

    socket.on("group-call:status-response", (payload) => {
      useGroupCallStore.getState().handleGroupCallStatusResponse(payload);
    });

    socket.on("group-call:error", (payload) => {
      useGroupCallStore.getState().handleGroupCallError(payload);
    });

    socket.on("approval-requested", ({ conversationId }) => {
      const chatState = useChatStore.getState();
      const currentUserId = useAuthStore.getState().user?._id;
      const conversation = chatState.conversations.find((c) => c._id === conversationId);

      if (conversation && currentUserId && conversation.group?.admins?.includes(currentUserId)) {
        toast.info(`Có yêu cầu tham gia nhóm ${conversation.group?.name || ''} đang chờ duyệt.`);
      }
    });

    socket.on("approval-queue-updated", () => {});

    socket.on("group-disbanded", ({ conversationId }) => {
      useChatStore.getState().markGroupAsDisbanded(conversationId);
      const activeConvo = useChatStore.getState().activeConversationId;
      if (activeConvo === conversationId) {
        toast.warning("Nhóm này đã bị giải tán.");
      }
    });
    
    socket.on("admin-transferred", ({ conversationId, newAdminId }) => {
      useChatStore.getState().updateAdminLocal(conversationId, newAdminId);
    });

    socket.on("member-left", ({ conversation }) => {
      if (conversation) {
        useChatStore.getState().updateConversation(conversation);
      } else {
        useChatStore.getState().fetchConversations();
      }
    });

    socket.on("left-group", ({ conversationId }) => {
      const chatState = useChatStore.getState();
      chatState.fetchConversations();
      if (chatState.activeConversationId === conversationId) {
        chatState.setActiveConversation(null);
      }
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
      useGroupCallStore.getState().reset();
    }
  },
}));
