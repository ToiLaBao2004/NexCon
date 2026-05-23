import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { GroupCallParticipant, SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { useNotificationStore } from "./useNotificationStore";
import { useCallStore } from "./useCallStore";
import { useGroupCallStore } from "./useGroupCallStore";
import { Capacitor } from '@capacitor/core';
import { toast } from "sonner";
import { playMessageSound, playNotificationSound } from "@/utils/sound";
import { isMuted } from "@/utils/isMuted";
import useMediaCacheStore from "./useMediaCacheStore";
import { useReminderStore } from "./useReminderStore";
import { showReminderToast } from "@/components/reminder/showReminderToast";
import { useMeetStore } from "./useMeetStore";
import { flashTabTitle } from "@/utils/tabTitle";
import { useAppStatusStore } from "./useAppStatusStore";
import { consumePendingNativeCallAction } from "@/lib/nativeCallAction";
import type { UserPresence } from "@/types/user";

const baseURL = import.meta.env.VITE_SOCKET_URL;
const TYPING_INDICATOR_TIMEOUT_MS = 3500;
const typingExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

const getTypingTimerKey = (conversationId: string, userId: string) => `${conversationId}:${userId}`;

const clearTypingExpiryTimer = (conversationId: string, userId: string) => {
  const key = getTypingTimerKey(conversationId, userId);
  const timer = typingExpiryTimers.get(key);
  if (!timer) return;

  clearTimeout(timer);
  typingExpiryTimers.delete(key);
};

const clearTypingExpiryTimers = (conversationId?: string) => {
  Array.from(typingExpiryTimers.keys()).forEach((key) => {
    const [timerConversationId] = key.split(":");
    if (conversationId && timerConversationId !== conversationId) return;

    const timer = typingExpiryTimers.get(key);
    if (timer) clearTimeout(timer);
    typingExpiryTimers.delete(key);
  });
};

const normalizeOnlineUsersPayload = (payload: any): {
  onlineUsers: string[];
  userPresences: Record<string, UserPresence>;
} => {
  if (Array.isArray(payload)) {
    return {
      onlineUsers: payload.map((id) => String(id)),
      userPresences: Object.fromEntries(payload.map((id) => {
        const userId = String(id);
        return [userId, {
          userId,
          status: "online",
          status_mode: "auto",
          manual_status: "online",
          show_activity: true,
          is_online: true,
          last_seen_at: null,
          last_seen_relative: null,
        } satisfies UserPresence];
      })),
    };
  }

  const presences = Array.isArray(payload?.presences) ? payload.presences : [];
  const userPresences = Object.fromEntries(
    presences
      .filter((presence: any) => presence?.userId)
      .map((presence: UserPresence) => [String(presence.userId), presence])
  );
  const onlineUsers = Array.isArray(payload?.onlineUserIds)
    ? payload.onlineUserIds.map((id: any) => String(id))
    : presences
      .filter((presence: UserPresence) => presence?.is_online)
      .map((presence: UserPresence) => String(presence.userId));

  return { onlineUsers, userPresences };
};

const canShowBrowserNotification = () => {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
};

const canFlashTabTitle = () => {
  return Capacitor.isNativePlatform() || canShowBrowserNotification();
};

const isAppVisible = () => {
  return typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
};

const getMessageTabTitle = (message: any, conversation: any) => {
  const senderId = message.senderId || message.sender?._id;
  const senderParticipant = conversation?.participants?.find(
    (participant: any) => String(participant.userId?._id || participant.userId) === String(senderId),
  );

  const senderName =
    senderParticipant?.userId?.nickname?.trim() ||
    senderParticipant?.userId?.displayName?.trim() ||
    message.senderInfo?.displayName?.trim() ||
    "Tin nhắn mới";

  if (conversation?.type === "group") {
    return conversation?.group?.name?.trim() || "Nhóm";
  }

  return senderName;
};

const showBrowserNotification = (payload: {
  title: string;
  body: string;
  url: string;
}) => {
  if (!canShowBrowserNotification() || isAppVisible()) {
    return;
  }

  const notification = new Notification(payload.title, {
    body: payload.body,
    icon: "/logo.svg",
    badge: "/logo.svg",
    requireInteraction: true,
    data: {
      url: payload.url,
    },
  });

  notification.onclick = () => {
    notification.close();
    const targetUrl = payload.url || "/notification";
    window.focus();
    window.location.href = targetUrl;
  };
};

const MENTION_TOKEN_REGEX = /@\[USER:([^\]]+)\]/g;

const decodeMentionPreview = (
  preview: string,
  conversation: any,
) => {
  if (!preview || typeof preview !== "string") {
    return "Bạn được nhắc đến";
  }

  return preview.replace(MENTION_TOKEN_REGEX, (_full, rawUserId) => {
    const mentionUserId = String(rawUserId || "").trim();
    if (!mentionUserId) {
      return "@Người dùng";
    }

    const participant = conversation?.participants?.find(
      (item: any) => String(item.userId?._id || item.userId) === mentionUserId
    );

    const displayName =
      participant?.userId?.nickname?.trim() || participant?.userId?.displayName || "Người dùng";

    return `@${displayName}`;
  });
};

const localizeNotificationTitle = (title?: string) => {
  const safeTitle = typeof title === "string" ? title.trim() : "";
  const normalized = safeTitle.toLowerCase();

  if (normalized === "new friend request") {
    return "Lời mời kết bạn mới";
  }

  if (normalized === "friend request accepted") {
    return "Lời mời kết bạn đã được chấp nhận";
  }

  if (normalized === "friend request resent") {
    return "Lời mời kết bạn được gửi lại";
  }

  return safeTitle || "NexCon";
};

const dismissReminderToast = (id?: string | null) => {
  const reminderId = String(id || "").trim();
  if (reminderId) {
    toast.dismiss(`reminder-toast-${reminderId}`);
  }
};

const dismissReminderToastIfResolved = (reminder: any) => {
  const reminderId = reminder?._id?.toString?.() || reminder?._id;
  const status = String(reminder?.status || "").trim();
  if (reminderId && status && status !== "triggered") {
    dismissReminderToast(reminderId);
  }
};

const syncNotificationInStore = (notification: any) => {
  if (!notification?._id) return;

  useNotificationStore.setState((state) => {
    const notificationId = notification._id.toString();
    const exists = state.notifications.some((item) => item._id === notificationId);
    const notifications = exists
      ? state.notifications.map((item) => item._id === notificationId ? { ...item, ...notification } : item)
      : [notification, ...state.notifications];

    return {
      notifications,
      unreadCount: notifications.filter((item) => !item.isRead).length,
      pendingReadIds: state.pendingReadIds.filter((id) => id !== notificationId),
    };
  });
};

const playWaitingRoomKnock = () => {
  const knockAudio = new Audio('/sounds/waiting-room-knock.mp3');
  knockAudio.volume = 0.5;

  knockAudio.play().catch(() => {
    if (typeof window === 'undefined' || !window.AudioContext) {
      return;
    }

    try {
      const ctx = new window.AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);

      osc.onended = () => {
        void ctx.close();
      };
    } catch {
      // Ignore sound playback errors.
    }
  });
};

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  onlineUsers: [],
  userPresences: {},
  connectionStatus: 'idle',
  typingUsers: {},
  setTypingUser: (conversationId, userId, isTyping) => {
    const safeConversationId = conversationId?.toString?.() || "";
    const safeUserId = userId?.toString?.() || "";
    if (!safeConversationId || !safeUserId) return;

    if (isTyping) {
      clearTypingExpiryTimer(safeConversationId, safeUserId);
      const timer = setTimeout(() => {
        typingExpiryTimers.delete(getTypingTimerKey(safeConversationId, safeUserId));
        get().setTypingUser(safeConversationId, safeUserId, false);
      }, TYPING_INDICATOR_TIMEOUT_MS);
      typingExpiryTimers.set(getTypingTimerKey(safeConversationId, safeUserId), timer);
    } else {
      clearTypingExpiryTimer(safeConversationId, safeUserId);
    }

    set((state) => {
      const currentTypingUsers = state.typingUsers[safeConversationId] || [];
      if (isTyping && !currentTypingUsers.includes(safeUserId)) {
        return {
          typingUsers: {
            ...state.typingUsers,
            [safeConversationId]: [...currentTypingUsers, safeUserId],
          },
        };
      } else if (!isTyping && currentTypingUsers.includes(safeUserId)) {
        const nextTypingUsers = { ...state.typingUsers };
        const nextConversationTypingUsers = currentTypingUsers.filter((id) => id !== safeUserId);
        if (nextConversationTypingUsers.length > 0) {
          nextTypingUsers[safeConversationId] = nextConversationTypingUsers;
        } else {
          delete nextTypingUsers[safeConversationId];
        }

        return {
          typingUsers: nextTypingUsers,
        };
      }
      return state;
    });
  },
  clearTypingUsers: (conversationId) => {
    const safeConversationId = conversationId?.toString?.();
    clearTypingExpiryTimers(safeConversationId);

    set((state) => {
      if (!safeConversationId) {
        return { typingUsers: {} };
      }

      if (!state.typingUsers[safeConversationId]) return state;

      const nextTypingUsers = { ...state.typingUsers };
      delete nextTypingUsers[safeConversationId];
      return { typingUsers: nextTypingUsers };
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
      get().clearTypingUsers();
      set({ connectionStatus: 'connected' });
      useAppStatusStore.getState().setSocketStatus('connected');
      useAppStatusStore.getState().clearMaintenance();

      // B online trở lại -> duyệt qua các msg chưa có B trong deliveredTo -> emit
      const currentUserId = useAuthStore.getState().user?._id;
      if (currentUserId) {
        const chatState = useChatStore.getState();
        const allConvos = chatState.conversations;
        const deliveredSyncKeys = new Set<string>();
        const emitDeliveredOnce = (messageId: string, conversationId: string) => {
          const key = `${conversationId}:${messageId}`;
          if (deliveredSyncKeys.has(key)) return;

          deliveredSyncKeys.add(key);
          socket.emit("message-delivered", {
            messageId,
            conversationId,
          });
          useChatStore.getState().markMessageDelivered(messageId, conversationId, String(currentUserId));
        };

        for (const convo of allConvos) {
          // 1. Kiểm tra lastMessage
          const lastMsg = convo.lastMessage;
          if (lastMsg) {
            const senderId = (lastMsg.senderId as any)?._id || lastMsg.senderId;
            if (
              String(senderId) !== String(currentUserId) &&
              !lastMsg.deliveredTo?.includes(currentUserId)
            ) {
              emitDeliveredOnce(lastMsg._id, convo._id);
            }
          }

          // 2. Kiểm tra messages đã cache
          const cached = chatState.messages[convo._id];
          if (!cached?.items?.length) continue;
          for (const msg of cached.items) {
            const msgSenderId = (msg.senderId as any)?._id || msg.senderId;
            if (
              String(msgSenderId) !== String(currentUserId) &&
              !msg.deliveredTo?.includes(currentUserId)
            ) {
              emitDeliveredOnce(msg._id, convo._id);
            }
          }
        }
      }
    });

    socket.on("connect_error", async (err) => {
      console.error("Socket connect_error:", err.message);
      const nextStatus = navigator.onLine ? 'reconnecting' : 'disconnected';
      get().clearTypingUsers();
      set({ connectionStatus: nextStatus });
      useAppStatusStore.getState().setSocketStatus(nextStatus);
      if (
        err.message.includes("Unauthorized") ||
        err.message.includes("jwt expired")
      ) {
        try {
          await useAuthStore.getState().refreshToken();
          const newToken = useAuthStore.getState().accessToken;
          if (newToken) {
            socket.auth = { token: newToken };
            socket.connect();
          }
        } catch (refreshErr) {
          console.error("Failed to refresh token for socket", refreshErr);
        }
      }
    });

    socket.on("disconnect", (reason) => {
      const nextStatus = reason === "io client disconnect"
        ? 'idle'
        : navigator.onLine
          ? 'reconnecting'
          : 'disconnected';
      get().clearTypingUsers();
      set({ connectionStatus: nextStatus });
      useAppStatusStore.getState().setSocketStatus(nextStatus);
    });

    socket.io.on("reconnect_attempt", () => {
      set({ connectionStatus: 'reconnecting' });
      useAppStatusStore.getState().setSocketStatus('reconnecting');
    });

    socket.io.on("reconnect", () => {
      get().clearTypingUsers();
      set({ connectionStatus: 'connected' });
      useAppStatusStore.getState().setSocketStatus('connected');
      useAppStatusStore.getState().clearMaintenance();

      const chatStore = useChatStore.getState();
      void chatStore.fetchConversations(true);

      const activeConversationId = chatStore.activeConversationId;
      if (activeConversationId) {
        useChatStore.setState((state) => {
          const previous = state.messages[activeConversationId] ?? {
            items: [],
            hasMore: false,
            nextCursor: "",
            pinnedMessages: [],
          };

          return {
            messages: {
              ...state.messages,
              [activeConversationId]: {
                ...previous,
                nextCursor: "",
              },
            },
          };
        });
        void useChatStore.getState().fetchMessages(activeConversationId);
      }
    });

    socket.io.on("reconnect_error", () => {
      const nextStatus = navigator.onLine ? 'reconnecting' : 'disconnected';
      get().clearTypingUsers();
      set({ connectionStatus: nextStatus });
      useAppStatusStore.getState().setSocketStatus(nextStatus);
    });

    socket.on("online-users", (payload) => {
      const normalized = normalizeOnlineUsersPayload(payload);
      const onlineUserSet = new Set(normalized.onlineUsers);

      set((state) => {
        const nextTypingUsers: Record<string, string[]> = {};

        Object.entries(state.typingUsers).forEach(([conversationId, typingUserIds]) => {
          const nextConversationTypingUsers = typingUserIds.filter((typingUserId) => {
            const isStillOnline = onlineUserSet.has(typingUserId);
            if (!isStillOnline) {
              clearTypingExpiryTimer(conversationId, typingUserId);
            }
            return isStillOnline;
          });

          if (nextConversationTypingUsers.length > 0) {
            nextTypingUsers[conversationId] = nextConversationTypingUsers;
          }
        });

        return {
          onlineUsers: normalized.onlineUsers,
          userPresences: {
            ...state.userPresences,
            ...normalized.userPresences,
          },
          typingUsers: nextTypingUsers,
        };
      });
    });

    socket.on("new-message", ({ message, conversation, unreadCounts }) => {
      const chatState = useChatStore.getState();
      const currentUserId = useAuthStore.getState().user?._id;

      if (message.signedUrl) {
        useMediaCacheStore.getState().setUrl(message._id, message.signedUrl);
      }

      const jumpContext = chatState.jumpContexts[message.conversationId];
      if (!jumpContext?.isJumpMode) {
        useChatStore.getState().addMessage(message);
      }

      const updatedConversation = {
        ...conversation,
        unreadCounts,
      };

      const isFocused =
        chatState.focusedConversationId === message.conversationId;
      const senderId = message.senderId || message.sender?._id;
      const isMine = String(senderId) === String(currentUserId);
      const currentConversation = chatState.conversations.find(
        (item) => String(item._id) === String(message.conversationId)
      );
      const myParticipant = currentConversation?.participants?.find(
        (participant) => String(participant.userId?._id || participant.userId) === String(currentUserId)
      );
      const mutedMessages = isMuted(myParticipant?.mute, "messages");

      chatState.updateConversation(updatedConversation);

      if (isFocused) {
        chatState.markAsSeen();
      }

      if (!isMine && !mutedMessages) {
        void playMessageSound();

        const conversationForTitle = conversation || currentConversation;
        const tabTitle = getMessageTabTitle(message, conversationForTitle);

        if (!isAppVisible() && canFlashTabTitle()) {
          flashTabTitle(`💬 ${tabTitle}`);
        }

        void (async () => {
          const { Capacitor } = await import('@capacitor/core');
          if (!Capacitor.isNativePlatform()) return;

          const { showMessageNotification } = await import('@/lib/localNotification');
          const senderName = message.senderInfo?.displayName || 'Tin nhắn mới';
          let body = '';

          if (message.type === 'image') body = '📷 Hình ảnh';
          else if (message.type === 'file') body = `📎 ${message.fileName || 'File'}`;
          else if (message.type === 'audio') body = '🎙️ Tin nhắn thoại';
          else if (message.type === 'sticker') body = 'Đã gửi một nhãn dán';
          else {
            const rawContent = message.content || '';
            const convo = chatState.conversations.find(
              (c) => String(c._id) === String(message.conversationId)
            );
            body = rawContent.replace(
              /@\[USER:([^\]]+)\]/g,
              (_full: string, uid: string) => {
                const p = convo?.participants?.find(
                  (item: any) =>
                    String(item.userId?._id || item.userId) === uid.trim()
                );
                const name =
                  p?.userId?.nickname?.trim() ||
                  p?.userId?.displayName?.trim() ||
                  'Thành viên';
                return `@${name}`;
              }
            );
          }

          const { activeConversationId } = useChatStore.getState();
          if (activeConversationId !== message.conversationId) {
            void showMessageNotification({
              title: senderName,
              body,
              conversationId: message.conversationId,
            });
          }
        })();
      }

      if (!isMine && currentConversation?.type === "direct") {
        socket.emit("message-delivered", {
          messageId: message._id,
          conversationId: message.conversationId,
        });
        if (currentUserId) {
          useChatStore.getState().markMessageDelivered(
            message._id,
            message.conversationId,
            String(currentUserId),
          );
        }
      }
    });

    socket.on("read-message", ({ conversationId, userId, lastReadMessageId, lastReadAt, unreadCount, unreadMentionCount }) => {
      const currentUserId = useAuthStore.getState().user?._id?.toString() ?? "";
      const readerId = userId?.toString?.() || userId;
      useChatStore.setState((state) => {
        const targetId = typeof conversationId === 'object' ? conversationId._id : conversationId;
        const updatedConversations = state.conversations.map((c) => {
          if (c._id !== targetId) return c;
          return {
            ...c,
            unreadCounts: readerId === currentUserId
              ? {
                ...c.unreadCounts,
                [currentUserId]: unreadCount ?? 0,
              }
              : c.unreadCounts,
            participants: c.participants.map((p) => {
              const pid = (p.userId?._id || p.userId)?.toString();
              if (pid !== readerId) return p;
              return {
                ...p,
                lastReadMessageId,
                lastReadAt: lastReadAt || new Date().toISOString(),
                ...(readerId === currentUserId
                  ? { unreadMentionCount: unreadMentionCount ?? 0 }
                  : {}),
              };
            }),
          };
        });

        return {
          conversations: updatedConversations,
        };
      });
    });

    socket.on("message-delivered-ack", ({ messageId, conversationId, deliveredUserId }) => {
      useChatStore.getState().markMessageDelivered(messageId, conversationId, deliveredUserId);
    });

    socket.on("message-delivered-sync", ({ messageId, conversationId, deliveredUserId }) => {
      useChatStore.getState().markMessageDelivered(messageId, conversationId, deliveredUserId);
    });

    socket.on("new-friend-request", ({ friendRequest }) => {
      useFriendStore.getState().addIncomingRequest(friendRequest);
      useFriendStore.getState().fetchIncomingRequests(true);
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
      useFriendStore.getState().fetchFriends(true);
      useFriendStore.getState().fetchSentRequests(true);
      toast.success(
        message || `${from.displayName} đã chấp nhận lời mời kết bạn của bạn!`,
        {
          duration: 5000,
        },
      );
    });

    socket.on("friend-request-rejected", () => {
      useFriendStore.getState().fetchSentRequests(true);
    });

    socket.on("friend-request-cancelled", ({ requestId }) => {
      useFriendStore.getState().removeIncomingRequest(requestId);
      useFriendStore.getState().fetchIncomingRequests(true);
    });

    socket.on("friend-request-resolved", ({ requestId, action, newFriend }) => {
      if (requestId) {
        useFriendStore.getState().removeIncomingRequest(requestId);
      }
      if (action === "accepted" && newFriend) {
        useFriendStore.getState().addFriend(newFriend);
        useFriendStore.getState().fetchFriends(true);
      }
      useFriendStore.getState().fetchIncomingRequests(true);
    });

    socket.on("friend-request-sent-updated", ({ friendRequest }) => {
      if (friendRequest) {
        useFriendStore.getState().addSentRequest(friendRequest);
      }
      useFriendStore.getState().fetchSentRequests(true);
    });

    socket.on("friend-request-sent-cancelled", ({ requestId }) => {
      if (requestId) {
        useFriendStore.getState().removeSentRequest(requestId);
      }
      useFriendStore.getState().fetchSentRequests(true);
    });

    socket.on("unfriended", ({ friendId }) => {
      const normalizedFriendId = friendId?.toString?.() || friendId;
      if (normalizedFriendId) {
        useFriendStore.getState().removeFriend(normalizedFriendId);
      }
      useFriendStore.getState().fetchFriends(true);
    });

    socket.on("new-notification", ({ notification }) => {
      useNotificationStore.getState().addNotification(notification);
      useNotificationStore.getState().fetchNotifications(true);

      showBrowserNotification({
        title: localizeNotificationTitle(notification.title),
        body: notification.content || "Bạn có một thông báo mới",
        url: notification.linkUrl || "/notification",
      });

      void playNotificationSound();
    });

    socket.on("notification-updated", ({ notification }) => {
      syncNotificationInStore(notification);
      useNotificationStore.getState().fetchNotifications(true);
    });

    socket.on("notifications-all-read", () => {
      useNotificationStore.setState((state) => ({
        notifications: state.notifications.map((notification) => ({ ...notification, isRead: true })),
        unreadCount: 0,
        pendingReadIds: [],
        markAllPending: false,
      }));
      useNotificationStore.getState().fetchNotifications(true);
    });

    socket.on("notification-deleted", ({ id }) => {
      const notificationId = id?.toString?.() || id;
      if (!notificationId) return;

      useNotificationStore.setState((state) => {
        const notifications = state.notifications.filter((notification) => notification._id !== notificationId);
        return {
          notifications,
          unreadCount: notifications.filter((notification) => !notification.isRead).length,
          pendingReadIds: state.pendingReadIds.filter((pendingId) => pendingId !== notificationId),
        };
      });
      useNotificationStore.getState().fetchNotifications(true);
    });

    socket.on("user_mentioned", ({ messageId, conversationId, mentionedBy, preview }) => {
      const chatState = useChatStore.getState();
      const currentUserId = useAuthStore.getState().user?._id?.toString() ?? "";
      const targetConversationId = conversationId?.toString?.() || conversationId;
      const isFocused = chatState.focusedConversationId === targetConversationId;
      const senderName = mentionedBy?.displayName || "Ai đó";
      const targetConversation = chatState.conversations.find(
        (item) => String(item._id) === String(targetConversationId)
      );
      const previewText = decodeMentionPreview(
        typeof preview === "string" ? preview.trim() : "",
        targetConversation
      );
      const groupName =
        targetConversation?.type === "group"
          ? targetConversation.group?.name?.trim() || ""
          : "";
      const mentionTitle = groupName
        ? `${senderName} đã nhắc đến bạn trong nhóm ${groupName}`
        : `${senderName} đã nhắc đến bạn`;
      const mentionDescription = previewText;
      const targetUrl = `/chat?conversationId=${encodeURIComponent(String(targetConversationId || ''))}&messageId=${encodeURIComponent(String(messageId || ''))}`;

      if (targetConversationId && !isFocused) {
        useChatStore.setState((state) => ({
          conversations: state.conversations.map((conversation) => {
            if (String(conversation._id) !== String(targetConversationId)) {
              return conversation;
            }

            const participants = (conversation.participants || []).map((participant) => {
              const participantId = String(participant.userId?._id || participant.userId);
              if (participantId !== currentUserId) {
                return participant;
              }

              return {
                ...participant,
                unreadMentionCount: (participant.unreadMentionCount || 0) + 1,
              };
            });

            return { ...conversation, participants };
          }),
        }));
      }

      toast.info(mentionTitle, {
        duration: 7000,
        className: "border border-primary/25 bg-gradient-to-br from-background to-primary/5 shadow-lg",
        descriptionClassName: "text-[12px] text-muted-foreground",
        action: {
          label: 'Mở chat',
          onClick: () => {
            window.location.href = targetUrl;
          },
        },
        description: mentionDescription,
      });

      showBrowserNotification({
        title: mentionTitle,
        body: mentionDescription,
        url: targetUrl,
      });

      if (!isFocused) {
        void playMessageSound();
      }
    });

    socket.on("reminder-triggered", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
      void useReminderStore.getState().refreshReminders();
      showReminderToast(reminder);
    });

    socket.on("reminder-created", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
      void useReminderStore.getState().refreshReminders();
    });

    socket.on("reminder-snoozed", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      dismissReminderToastIfResolved(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
      void useReminderStore.getState().refreshReminders();
    });

    socket.on("reminder-updated", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      dismissReminderToastIfResolved(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
      void useReminderStore.getState().refreshReminders();
    });

    socket.on("reminder-deleted", ({ id }) => {
      const reminderId = typeof id === 'string' ? id.trim() : '';
      if (reminderId) {
        dismissReminderToast(reminderId);
        useReminderStore.getState().removeReminder(reminderId);
      }
      void useReminderStore.getState().fetchUpcomingCount();
      void useReminderStore.getState().refreshReminders();
    });

    socket.on("reminder-participation-updated", ({ reminder }) => {
      useReminderStore.getState().updateReminderInStore(reminder);
      dismissReminderToastIfResolved(reminder);
      void useReminderStore.getState().fetchUpcomingCount();
      void useReminderStore.getState().refreshReminders();
    });

    socket.on("reminders-bulk-deleted", ({ scope }) => {
      if (scope === 'upcoming' || scope === 'past' || scope === 'all') {
        useReminderStore.getState().reminders
          .filter((reminder) => {
            if (reminder.scope !== 'personal') return false;
            if (scope === 'all') return true;
            if (scope === 'upcoming') return reminder.status === 'pending' || reminder.status === 'snoozed';
            return reminder.status === 'triggered' || reminder.status === 'dismissed';
          })
          .forEach((reminder) => dismissReminderToast(reminder._id));
        useReminderStore.getState().removeRemindersByScope(scope);
      }
      void useReminderStore.getState().fetchUpcomingCount();
      void useReminderStore.getState().refreshReminders();
    });

    socket.on("shared-reminder-cancelled", ({ sharedKey }) => {
      if (typeof sharedKey === 'string' && sharedKey.trim()) {
        useReminderStore.getState().reminders
          .filter((reminder) => reminder.sharedKey === sharedKey.trim())
          .forEach((reminder) => dismissReminderToast(reminder._id));
        useReminderStore.getState().removeRemindersBySharedKey(sharedKey);
      }
      void useReminderStore.getState().fetchUpcomingCount();
      void useReminderStore.getState().refreshReminders();
    });

    socket.on("new-conversation", ({ conversation }) => {
      useChatStore.getState().updateConversation(conversation);
      get().joinConversation(conversation._id);
      useChatStore.getState().fetchConversations(true);
    });

    socket.on("conversation-updated", ({ conversation, conversationId }) => {
      if (conversation) {
        useChatStore.getState().updateConversation({
          ...conversation,
          _id: conversation._id || conversationId,
        });
      }
      useChatStore.getState().fetchConversations(true);
    });

    socket.on("conversation-mute-updated", ({ conversationId, userId, mute }) => {
      const targetConversationId = conversationId?.toString?.() || conversationId;
      const targetUserId = userId?.toString?.() || userId;
      if (!targetConversationId || !targetUserId) return;

      useChatStore.setState((state) => ({
        conversations: state.conversations.map((conversation) => {
          if (String(conversation._id) !== String(targetConversationId)) {
            return conversation;
          }

          return {
            ...conversation,
            participants: conversation.participants.map((participant) => {
              const participantId = (participant.userId?._id || participant.userId)?.toString();
              if (participantId !== String(targetUserId)) return participant;
              return { ...participant, mute };
            }),
          };
        }),
      }));
    });

    socket.on("conversation-cleared", ({ conversationId }) => {
      const targetConversationId = conversationId?.toString?.() || conversationId;
      if (!targetConversationId) return;

      useChatStore.setState((state) => {
        const nextMessages = { ...state.messages };
        delete nextMessages[targetConversationId];

        return {
          conversations: state.conversations.filter((conversation) => conversation._id !== targetConversationId),
          activeConversationId:
            state.activeConversationId === targetConversationId ? null : state.activeConversationId,
          focusedConversationId:
            state.focusedConversationId === targetConversationId ? null : state.focusedConversationId,
          messages: nextMessages,
        };
      });
    });

    socket.on("members-added", ({ conversation }) => {
      if (conversation) {
        // Update the conversation with the fully-populated version from backend
        useChatStore.getState().updateConversation(conversation);
      }
      useChatStore.getState().fetchConversations(true);
    });

    socket.on("member-removed", ({ conversation }) => {
      if (conversation) {
        useChatStore.getState().updateConversation(conversation);
      }
      useChatStore.getState().fetchConversations(true);
    });

    socket.on("kicked-from-group", ({ conversationId }) => {
      const chatState = useChatStore.getState();
      const activeConvoId = chatState.activeConversationId;
      chatState.fetchConversations(true);
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
        useChatStore.getState().fetchConversations(true);
      },
    );

    socket.on("message-moderated", ({ conversationId, messageId, reportStatus, content }) => {
      const targetConversationId = conversationId?.toString?.() || conversationId;
      const targetMessageId = messageId?.toString?.() || messageId;
      if (!targetConversationId || !targetMessageId) return;

      useChatStore.setState((state) => {
        const currentMessages = state.messages[targetConversationId];
        const nextMessages = currentMessages
          ? {
            ...state.messages,
            [targetConversationId]: {
              ...currentMessages,
              items: currentMessages.items.map((message) =>
                String(message._id) === String(targetMessageId)
                  ? {
                    ...message,
                    reportStatus: Boolean(reportStatus),
                    content: content || "Tin nhắn vi phạm tiêu chuẩn cộng đồng",
                    reactions: [],
                  }
                  : message
              ),
              pinnedMessages: currentMessages.pinnedMessages.filter(
                (message) => String(message._id) !== String(targetMessageId)
              ),
            },
          }
          : state.messages;

        return {
          messages: nextMessages,
          conversations: state.conversations.map((conversation) => {
            if (String(conversation._id) !== String(targetConversationId)) return conversation;
            if (String(conversation.lastMessage?._id) !== String(targetMessageId)) return conversation;
            return {
              ...conversation,
              lastMessage: conversation.lastMessage
                ? { ...conversation.lastMessage, content: content || "Tin nhắn vi phạm tiêu chuẩn cộng đồng" }
                : conversation.lastMessage,
            };
          }),
        };
      });
    });

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
      useFriendStore.getState().fetchFriends(true);
    });

    socket.on("user-unblocked", ({ unblockedBy }) => {
      useFriendStore.getState().removeBlockedBy(unblockedBy);
    });

    socket.on("user-blocked-self", ({ blockedUser }) => {
      const blockedUserId = blockedUser?._id?.toString?.() || blockedUser?._id;
      if (!blockedUserId) return;

      useFriendStore.setState((state) => ({
        blockedUsers: state.blockedUsers.some((item) => String(item._id) === String(blockedUserId))
          ? state.blockedUsers.map((item) => String(item._id) === String(blockedUserId) ? blockedUser : item)
          : [...state.blockedUsers, blockedUser],
        friends: state.friends.filter((friend) => String(friend.friendId) !== String(blockedUserId)),
        friendSuggestions: state.friendSuggestions.filter((suggestion) => String(suggestion._id) !== String(blockedUserId)),
        friendSuggestionsFetched: false,
        incomingRequests: state.incomingRequests.filter(
          (request) => String(request.from?._id) !== String(blockedUserId),
        ),
        sentRequests: state.sentRequests.filter(
          (request) => String(request.to?._id) !== String(blockedUserId),
        ),
      }));
      useFriendStore.getState().fetchFriends(true);
      useFriendStore.getState().fetchBlockedList(true);
    });

    socket.on("user-unblocked-self", ({ userId }) => {
      const unblockedUserId = userId?.toString?.() || userId;
      if (!unblockedUserId) return;

      useFriendStore.setState((state) => ({
        blockedUsers: state.blockedUsers.filter((item) => String(item._id) !== String(unblockedUserId)),
      }));
      useFriendStore.getState().fetchBlockedList(true);
    });

    socket.on("user-typing", ({ conversationId, userId }) => {
      get().setTypingUser(conversationId, userId, true);
    });

    socket.on("user-stopped-typing", ({ conversationId, userId }) => {
      get().setTypingUser(conversationId, userId, false);
    });

    const refreshConversations = () => {
      useChatStore.getState().fetchConversations(true);
    };



    const getCurrentUserId = () =>
      useAuthStore.getState().user?._id?.toString() ?? "";

    socket.on("incoming-call", ({ from, callType, roomName, conversationId }) => {
      const currentUserId = getCurrentUserId();
      const currentConversation = useChatStore.getState().conversations.find(
        (item) => String(item._id) === String(conversationId)
      );
      const myParticipant = currentConversation?.participants?.find(
        (p) => String(p.userId?._id || p.userId) === String(currentUserId)
      );

      const isMutedCall = isMuted(myParticipant?.mute, "meetings");

      useCallStore.getState().handleIncomingCall(from, callType, roomName, isMutedCall);
      const nativeAction = consumePendingNativeCallAction({
        type: "direct-call",
        conversationId,
        roomName,
      });
      if (nativeAction?.action === "answer") {
        window.setTimeout(() => {
          void useCallStore.getState().acceptCall();
        }, 0);
      } else if (nativeAction?.action === "decline") {
        window.setTimeout(() => {
          useCallStore.getState().rejectCall();
        }, 0);
      }
      useChatStore.getState().fetchConversations(true);
    });

    socket.on("accept-call", (payload) => {
      useCallStore.getState().handleRemoteAccepted(payload);
    });

    socket.on("call-ringing", (payload) => {
      useCallStore.getState().handleCallRinging(payload);
    });

    socket.on("call-answered-on-other-device", (payload) => {
      const callState = useCallStore.getState();
      if (callState.pendingIncomingCall && payload?.roomName === callState.pendingIncomingCall.roomName) {
        const [nextPending, ...remainingQueue] = callState.pendingIncomingQueue;
        useCallStore.setState({
          pendingIncomingCall: nextPending ?? null,
          pendingIncomingQueue: remainingQueue,
        });
        return;
      }
      if (payload?.roomName && callState.pendingIncomingQueue.some((pending) => pending.roomName === payload.roomName)) {
        useCallStore.setState({
          pendingIncomingQueue: callState.pendingIncomingQueue.filter((pending) => pending.roomName !== payload.roomName),
        });
        return;
      }
      if (
        callState.status === "incoming" &&
        callState.isConnecting &&
        payload?.roomName &&
        callState._roomName === payload.roomName
      ) {
        return;
      }
      if (callState.status === "incoming") {
        callState.handleCallEnded(payload);
      }
    });

    socket.on("call-answered", ({ token, roomName }) => {
      useCallStore.getState().handleCallAnswered({ token, roomName });
    });

    socket.on("call-accepted", ({ token, roomName }) => {
      useCallStore.getState().handleCallAccepted({ token, roomName });
    });

    socket.on("call-rejected", (payload) => {
      useCallStore.getState().handleCallRejected(payload);
      refreshConversations();
    });

    socket.on("call-ended", (payload?: { by?: { _id?: string; displayName?: string } }) => {
      const currentUserId = getCurrentUserId();
      const endedById = payload?.by?._id?.toString() || "";
      const endedByName = payload?.by?.displayName || "Đối phương";

      if (!endedById || endedById !== currentUserId) {
        toast.info(`${endedByName} đã kết thúc cuộc gọi.`, {
          duration: 3500,
        });
      }

      useCallStore.getState().handleCallEnded(payload);
      refreshConversations();
    });

    socket.on("call-cancelled", (payload) => {
      useCallStore.getState().handleCallEnded(payload);
      refreshConversations();
    });

    socket.on("call-failed", ({ reason }) => {
      useCallStore.getState().handleCallFailed(reason);
      refreshConversations();
    });

    // Group call events
    socket.on("group-call:started", (payload) => {
      useGroupCallStore.getState().handleGroupCallStarted(payload);
    });

    socket.on("group-call:incoming", (payload) => {
      const currentUserId = getCurrentUserId();
      const currentConversation = useChatStore.getState().conversations.find(
        (item) => String(item._id) === String(payload.conversationId)
      );
      const myParticipant = currentConversation?.participants?.find(
        (p) => String(p.userId?._id || p.userId) === String(currentUserId)
      );

      const isMutedCall = isMuted(myParticipant?.mute, "meetings");

      useGroupCallStore.getState().handleGroupCallIncoming(payload, isMutedCall);
      const nativeAction = consumePendingNativeCallAction({
        type: "group-call",
        conversationId: payload.conversationId,
        callId: payload.callId,
      });
      if (nativeAction?.action === "answer") {
        window.setTimeout(() => {
          void useGroupCallStore.getState().joinGroupCall(payload.conversationId);
        }, 0);
      } else if (nativeAction?.action === "decline") {
        window.setTimeout(() => {
          useGroupCallStore.getState().declineGroupCall(payload.conversationId);
        }, 0);
      }
    });

    socket.on("group-call:token", (payload) => {
      useGroupCallStore.getState().handleGroupCallToken(payload);
    });

    socket.on("group-call:answered-on-other-device", (payload) => {
      useGroupCallStore.getState().handleGroupCallAnsweredOnOtherDevice(payload);
    });

    socket.on("group-call:declined-on-other-device", (payload) => {
      useGroupCallStore.getState().handleGroupCallDeclinedOnOtherDevice(payload);
    });

    socket.on("group-call:user-joined", (payload: {
      conversationId: string;
      participants: GroupCallParticipant[];
      user?: { _id: string; displayName: string; avatarUrl: string | null };
      userId?: string;
    }) => {
      const currentUserId = getCurrentUserId();
      const joinedUserId =
        payload.user?._id?.toString() || payload.userId?.toString() || "";
      const groupCallState = useGroupCallStore.getState();

      if (
        joinedUserId &&
        joinedUserId === currentUserId &&
        groupCallState.conversationId === payload.conversationId &&
        groupCallState.status !== "active"
      ) {
        groupCallState.handleGroupCallAnsweredOnOtherDevice(payload);
        return;
      }

      if (
        joinedUserId &&
        joinedUserId === currentUserId &&
        groupCallState.pendingIncomingCall?.conversationId === payload.conversationId
      ) {
        groupCallState.handleGroupCallAnsweredOnOtherDevice(payload);
        return;
      }

      groupCallState.handleGroupCallUserJoined(payload);

      if (useGroupCallStore.getState().status !== "active") return;

      if (joinedUserId && joinedUserId === currentUserId) return;

      const joinedDisplayName =
        payload.user?.displayName ||
        payload.participants.find((participant) => participant.userId === joinedUserId)
          ?.displayName ||
        "Một người";

      toast.success(`${joinedDisplayName} đã tham gia cuộc gọi.`, {
        duration: 3500,
      });
    });

    socket.on("group-call:user-declined", (payload: {
      conversationId: string;
      userId?: string | null;
      participants: GroupCallParticipant[];
    }) => {
      const currentUserId = getCurrentUserId();
      const declinedUserId = payload.userId?.toString?.() || "";
      const myParticipantStatus = payload.participants.find(
        (participant) => participant.userId === currentUserId
      )?.status;
      const groupCallState = useGroupCallStore.getState();

      if (
        (
          declinedUserId === currentUserId ||
          (!declinedUserId && (myParticipantStatus === "declined" || myParticipantStatus === "no-answer"))
        ) &&
        groupCallState.conversationId === payload.conversationId &&
        groupCallState.status === "incoming"
      ) {
        groupCallState.handleGroupCallDeclinedOnOtherDevice(payload);
        return;
      }

      if (
        (
          declinedUserId === currentUserId ||
          (!declinedUserId && (myParticipantStatus === "declined" || myParticipantStatus === "no-answer"))
        ) &&
        groupCallState.pendingIncomingCall?.conversationId === payload.conversationId
      ) {
        groupCallState.handleGroupCallDeclinedOnOtherDevice(payload);
        return;
      }

      groupCallState.handleGroupCallUserDeclined(payload);
    });

    socket.on("group-call:user-left", (payload: {
      conversationId: string;
      userId: string;
      participants: GroupCallParticipant[];
    }) => {
      useGroupCallStore.getState().handleGroupCallUserLeft(payload);

      if (useGroupCallStore.getState().status !== "active") return;

      const currentUserId = getCurrentUserId();
      const leftUserId = payload.userId?.toString() || "";
      if (leftUserId && leftUserId === currentUserId) return;

      const leftDisplayName =
        payload.participants.find((participant) => participant.userId === leftUserId)
          ?.displayName || "Một người";

      toast.info(`${leftDisplayName} đã rời cuộc gọi.`, {
        duration: 3500,
      });
    });

    socket.on("group-call:ended", (payload) => {
      useGroupCallStore.getState().handleGroupCallEnded(payload);
      refreshConversations();
    });

    socket.on("group-call:status-response", (payload) => {
      useGroupCallStore.getState().handleGroupCallStatusResponse(payload);
    });

    socket.on("group-call:error", (payload) => {
      useGroupCallStore.getState().handleGroupCallError(payload);
    });

    socket.on('waiting-room-update', ({ roomName, waitingRoom }) => {
      const meetState = useMeetStore.getState();
      const nextWaitingRoom = Array.isArray(waitingRoom) ? waitingRoom : [];
      const prevWaitingRoom = meetState.waitingRoom || [];

      if (nextWaitingRoom.length > prevWaitingRoom.length) {
        playWaitingRoomKnock();
      }

      if (!meetState.roomName || String(meetState.roomName) === String(roomName || '')) {
        meetState.setWaitingRoom(nextWaitingRoom);
      }
    });

    socket.on('participant-admitted', ({ roomName, token, isHost }) => {
      const meetState = useMeetStore.getState();
      const targetRoomName = String(roomName || '').trim();
      if (!targetRoomName || !token) {
        return;
      }

      const currentRoomName = String(meetState.roomName || '').trim();
      if (!currentRoomName || currentRoomName !== targetRoomName) {
        return;
      }

      meetState.joinMeeting(token, targetRoomName, Boolean(isHost));
    });

    socket.on('participant-rejected', ({ roomName, reason }) => {
      const meetState = useMeetStore.getState();
      const targetRoomName = String(roomName || '').trim();
      const currentRoomName = String(meetState.roomName || '').trim();
      if (targetRoomName && currentRoomName !== targetRoomName) {
        return;
      }

      meetState.setRejectedReason(reason ?? null);
      meetState.setCallStatus('rejected');
    });

    socket.on('meeting-ended', ({ roomName }) => {
      const meetState = useMeetStore.getState();
      const targetRoomName = String(roomName || '').trim().toLowerCase();
      const currentRoomName = String(meetState.roomName || meetState.currentMeeting?.roomName || '').trim().toLowerCase();
      if (targetRoomName && currentRoomName === targetRoomName) {
        toast.info('Chủ phòng đã kết thúc cuộc họp.');
        meetState.handleMeetingEnded();
      }
    });

    socket.on("approval-requested", ({ conversationId }) => {
      const chatState = useChatStore.getState();
      const currentUserId = useAuthStore.getState().user?._id;
      const conversation = chatState.conversations.find((c) => c._id === conversationId);

      if (conversation && currentUserId && conversation.group?.admins?.includes(currentUserId)) {
        toast.info(`Có yêu cầu tham gia nhóm ${conversation.group?.name || ''} đang chờ duyệt.`);
      }
    });

    socket.on("approval-queue-updated", () => { });

    socket.on("group-disbanded", ({ conversationId }) => {
      useChatStore.getState().markGroupAsDisbanded(conversationId);
      useChatStore.getState().fetchConversations(true);
      const activeConvo = useChatStore.getState().activeConversationId;
      if (activeConvo === conversationId) {
        toast.warning("Nhóm này đã bị giải tán.");
      }
    });

    socket.on("admin-transferred", ({ conversationId, newAdminId }) => {
      useChatStore.getState().updateAdminLocal(conversationId, newAdminId);
      useChatStore.getState().fetchConversations(true);
    });

    socket.on("member-left", ({ conversation }) => {
      if (conversation) {
        useChatStore.getState().updateConversation(conversation);
      }
      useChatStore.getState().fetchConversations(true);
    });

    socket.on("left-group", ({ conversationId }) => {
      const chatState = useChatStore.getState();
      chatState.fetchConversations(true);
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
      get().clearTypingUsers();
      set({ socket: null, onlineUsers: [], userPresences: {}, connectionStatus: 'idle' });
      useAppStatusStore.getState().setSocketStatus('idle');
      // Reset call state if any
      useCallStore.getState().handleCallEnded();
      useGroupCallStore.getState().reset();
    }
  },
}));
