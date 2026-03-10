import type { Socket } from "socket.io-client";
import type { Conversation, Message } from "./chat";
import type { FriendRequest, FriendItem, SentFriendRequest } from "./user";
import type { CallRecord } from "./call";

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
    pinnedMessages: Message[];
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
  openChat: (params: { userId?: string; conversationId?: string }) => Promise<void>;
  createGroup: (name: string, members: string[]) => Promise<void>;
  recallMessage: (messageId: string) => Promise<void>;
  pinMessage: (messageId: string) => Promise<void>;
  pinMessageLocal: (conversationId: string, messageId: string, patch: { isPinned: boolean, pinnedAt: string | null }) => void;
  recallMessageLocal: (conversationId: string, messageId: string, updateData: { content: string, isRecalled: boolean }) => void;
}

export interface SocketState {
  socket: Socket | null;
  onlineUsers: string[];
  connectSocket: () => void;
  joinConversation: (conversationId: string) => void;
  disconnectSocket: () => void;
  typingUsers: Record<string, string[]>;
  setTypingUser: (conversationId: string, userId: string, isTyping: boolean) => void;
  emitTyping: (conversationId: string) => void;
  emitStopTyping: (conversationId: string) => void;
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
  blockedUsers: any[];
  blockedBy: string[];
  fetchBlockedList: () => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  addBlockedBy: (userId: string) => void;
  removeBlockedBy: (userId: string) => void;
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

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'active';
export type CallType = 'voice' | 'video';

export interface RemoteUser {
  _id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface CallState {
  status: CallStatus;
  callType: CallType | null;
  remoteUser: RemoteUser | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  _peerConnection: RTCPeerConnection | null;
  _pendingOffer: RTCSessionDescriptionInit | null;
  _iceCandidateQueue: RTCIceCandidateInit[];
  _callTimeout: ReturnType<typeof setTimeout> | null;
  startCall: (toUser: RemoteUser, callType: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  handleIncomingCall: (from: RemoteUser, offer: RTCSessionDescriptionInit, callType: CallType) => void;
  handleCallAnswered: (answer: RTCSessionDescriptionInit) => Promise<void>;
  handleCallRejected: () => void;
  handleCallEnded: () => void;
  handleCallFailed: (reason: 'offline' | 'busy') => void;
  handleIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
}

export interface CallHistoryState {
  callsByConversation: Record<string, {
    items: CallRecord[];
    hasMore: boolean;
    nextCursor?: string | null;
  }>;
  loading: boolean;

  fetchCallsByConversation: (conversationId: string, isRefresh?: boolean) => Promise<void>;
  addCallRecord: (conversationId: string, call: CallRecord) => void;
  reset: () => void;
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