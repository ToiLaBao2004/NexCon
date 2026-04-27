import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { GroupCallParticipant, SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { useNotificationStore } from "./useNotificationStore";
import { useCallStore } from "./useCallStore";
import { useGroupCallStore } from "./useGroupCallStore";
import { toast } from "sonner";
import { playMessageSound, playNotificationSound } from "@/utils/sound";
import { isMuted } from "@/utils/isMuted";
import useMediaCacheStore from "./useMediaCacheStore";
import { useReminderStore } from "./useReminderStore";
import { showReminderToast } from "@/components/reminder/showReminderToast";
import { useMeetStore } from "./useMeetStore";

const baseURL = import.meta.env.VITE_SOCKET_URL;

const canShowBrowserNotification = () => {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
};

const isAppVisible = () => {
  return typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
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

    socket.on("connect_error", async (err) => {
      console.error("Socket connect_error:", err.message);
      if (err.message.includes("Unauthorized") || err.message.includes("expired token")) {
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

    socket.on("online-users", (userIds) => {
      set({ onlineUsers: userIds });
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

      showBrowserNotification({
        title: localizeNotificationTitle(notification.title),
        body: notification.content || "Bạn có một thông báo mới",
        url: notification.linkUrl || "/notification",
      });

      void playNotificationSound();
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

    const refreshConversations = () => {
      useChatStore.getState().fetchConversations();
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
      useChatStore.getState().fetchConversations();
    });

    socket.on("accept-call", () => {
      useCallStore.getState().handleRemoteAccepted();
    });

    socket.on("call-answered", ({ token, roomName }) => {
      useCallStore.getState().handleCallAnswered({ token, roomName });
    });

    socket.on("call-accepted", ({ token, roomName }) => {
      useCallStore.getState().handleCallAccepted({ token, roomName });
    });

    socket.on("call-rejected", () => {
      useCallStore.getState().handleCallRejected();
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

      useCallStore.getState().handleCallEnded();
      refreshConversations();
    });

    socket.on("call-cancelled", () => {
      useCallStore.getState().handleCallEnded();
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
    });

    socket.on("group-call:token", (payload) => {
      useGroupCallStore.getState().handleGroupCallToken(payload);
    });

    socket.on("group-call:user-joined", (payload: {
      conversationId: string;
      participants: GroupCallParticipant[];
      user?: { _id: string; displayName: string; avatarUrl: string | null };
      userId?: string;
    }) => {
      useGroupCallStore.getState().handleGroupCallUserJoined(payload);

      if (useGroupCallStore.getState().status !== "active") return;

      const currentUserId = getCurrentUserId();
      const joinedUserId =
        payload.user?._id?.toString() || payload.userId?.toString() || "";

      if (joinedUserId && joinedUserId === currentUserId) return;

      const joinedDisplayName =
        payload.user?.displayName ||
        payload.participants.find((participant) => participant.userId === joinedUserId)
          ?.displayName ||
        "Một người";

      toast.success(`${joinedDisplayName} đã tham gia cuộc họp.`, {
        duration: 3500,
      });
    });

    socket.on("group-call:user-declined", (payload) => {
      useGroupCallStore.getState().handleGroupCallUserDeclined(payload);
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

      toast.info(`${leftDisplayName} đã rời cuộc họp.`, {
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

      if (meetState.roomName && String(meetState.roomName) !== targetRoomName) {
        return;
      }

      meetState.joinMeeting(token, targetRoomName, meetState.roomLabel || targetRoomName, Boolean(isHost));
    });

    socket.on('participant-rejected', ({ reason }) => {
      useMeetStore.getState().setRejectedReason(reason ?? null);
      useMeetStore.getState().setCallStatus('rejected');
    });

    socket.on('meeting-ended', ({ roomName }) => {
      const meetState = useMeetStore.getState();
      if (meetState.roomName && String(meetState.roomName) === String(roomName)) {
        toast.info('Chủ phòng đã kết thúc cuộc họp.');
        meetState.leaveMeeting();
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
