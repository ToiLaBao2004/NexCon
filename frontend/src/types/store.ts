import type { Socket } from "socket.io-client";
import type { Conversation, Message } from "./chat";
import type { FriendRequest, FriendItem, SentFriendRequest } from "./user";

export interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

export interface ChatState {
  conversations: Conversation[];
  messages: Record<string, {
    items: Message[],
    hasMore: boolean,
    nextCursor?: string | null,
  }>;
  activeConversationId: string | null;
  focusedConversationId: string | null;
  convoLoading: boolean;
  messageLoading: boolean;
  reset: () => void;

  setActiveConversation: (id: string | null) => void;
  setFocusedConversation: (id: string | null) => void;
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId?: string) => Promise<void>;
  sendDirectMessage: (
    recipientId: string,
    content: string,
    imgUrl?: string
  ) => Promise<void>;
  sendGroupMessage: (
    conversationId: string,
    content: string,
    imgUrl?: string
  ) => Promise<void>;
  addMessage: (message: Message) => Promise<void>;
  updateConversation: (conversation: Conversation) => void;
  markAsSeen: () => Promise<void>;
  updateGroupName: (conversationId: string, name: string) => Promise<void>;
}

export interface SocketState {
  socket: Socket | null;
  onlineUsers: string[];
  connectSocket: () => void;
  joinConversation: (conversationId: string) => void;
  disconnectSocket: () => void;
}

export interface FriendState {
  loading: boolean;
  sendingRequest: boolean;
  friends: FriendItem[];
  incomingRequests: FriendRequest[];
  sentRequests: SentFriendRequest[];
  fetchFriends: () => Promise<void>;
  fetchIncomingRequests: () => Promise<void>;
  fetchSentRequests: () => Promise<void>;
  setNickName: (friendId: string, nickName: string) => Promise<void>;
  sendFriendRequest: (email: string, message?: string) => Promise<void>;
  cancelFriendRequest: (requestId: string) => Promise<void>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  rejectFriendRequest: (requestId: string) => Promise<void>;
  addIncomingRequest: (request: FriendRequest) => void;
  removeIncomingRequest: (requestId: string) => void;
  addSentRequest: (request: SentFriendRequest) => void;
  removeSentRequest: (requestId: string) => void;
  addFriend: (friend: FriendItem) => void;
  removeFriend: (friendId: string) => void;
  unfriendUser: (friendId: string) => Promise<void>;
}

export interface Notification {
  _id: string;
  userId: string;
  title: string;
  content: string;
  linkUrl: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationState {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  setUnreadCount: (count: number) => void;
  reset: () => void;
}