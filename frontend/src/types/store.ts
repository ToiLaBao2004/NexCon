import type { Socket } from "socket.io-client";
import type { Conversation, Message, MessageType } from "./chat";
import type { FriendRequest, FriendItem, SentFriendRequest } from "./user";
import type { CallRecord } from "./call";

export interface SendMessagePayload {
  type: MessageType;
  recipientId?: string;
  conversationId?: string;
  content?: string;
  file?: File;
  replyToMessageId?: string;
}

export interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

export interface MediaState {
  images: Message[];
  files: Message[];
  links: Message[];
}

export type MediaKind = 'image' | 'file' | 'link';

export interface MediaPageState {
  items: Message[];
  page: number;
  hasMore: boolean;
  isFetching: boolean;
  nextCursor: string | null;
  limit: number;
}

export interface MediaPaginationState {
  image: MediaPageState;
  file: MediaPageState;
  link: MediaPageState;
}

export interface ChatState {
  conversations: Conversation[];
  messages: Record<string, {
    items: Message[],
    hasMore: boolean,
    nextCursor?: string | null,
    pinnedMessages: Message[];
  }>;
  media: Record<string, MediaState>;
  mediaPagination: Record<string, MediaPaginationState>;
  activeConversationId: string | null;
  focusedConversationId: string | null;
  convoLoading: boolean;
  messageLoading: boolean;
  replyingTo: Message | null;
  reset: () => void;

  setActiveConversation: (id: string | null) => void;
  setFocusedConversation: (id: string | null) => void;
  setReplyingTo: (message: Message | null) => void;
  clearConversationCache: (keepConversationIds: string[]) => void;
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId?: string) => Promise<void>;
  sendMessage: (payload: SendMessagePayload, onProgress?: (pct: number) => void) => Promise<void>;
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
  fetchMedia: (conversationId: string) => Promise<void>;
  fetchMediaPage: (conversationId: string, type: MediaKind, limit?: number) => Promise<void>;
  resetMediaPagination: (conversationId: string, type?: MediaKind) => void;

  // Sidebar
  activeSidebar: 'search' | 'info' | null;
  setActiveSidebar: (sidebar: 'search' | 'info' | null) => void;
  searchResults: {
    items: Message[];
    isSearching: boolean;
    query: string;
  };
  clearSearch: () => void;
  searchMessages: (
    query: string,
    filters?: { senderId?: string; fromDate?: string; toDate?: string }
  ) => Promise<void>;
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
  isRemoteVideoOff: boolean;
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
  handleVideoToggle: (isVideoOff: boolean) => void;
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
  clearConversationHistory: (keepConversationIds: string[]) => void;
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

export type GroupCallParticipantStatus =
  | "ringing"
  | "joined"
  | "declined"
  | "left"
  | "no-answer";

export interface GroupCallParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: GroupCallParticipantStatus;
  joinedAt: string | null;
  leftAt: string | null;
}

export type GroupCallStatus = "idle" | "outgoing" | "incoming" | "joining" | "active";

export interface GroupCallState {
  status: GroupCallStatus;
  conversationId: string | null;
  callId: string | null;
  callType: "voice" | "video" | null;
  token: string | null;
  initiator: {
    _id: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  groupName: string | null;
  participants: GroupCallParticipant[];
  hasLeftActiveCall: Record<string, boolean>;

  startGroupCall: (conversationId: string, callType: "voice" | "video") => void;
  joinGroupCall: (conversationId: string) => void;
  declineGroupCall: (conversationId: string) => void;
  leaveGroupCall: () => void;
  rejoinGroupCall: (conversationId: string) => void;
  checkGroupCallStatus: (conversationId: string) => void;

  handleGroupCallStarted: (payload: {
    conversationId: string;
    callId: string;
    callType: "voice" | "video";
    token: string;
    initiator: { _id: string; displayName: string; avatarUrl: string | null };
    groupName: string;
    participants: GroupCallParticipant[];
  }) => void;
  handleGroupCallIncoming: (payload: {
    conversationId: string;
    callId: string;
    callType: "voice" | "video";
    initiator: { _id: string; displayName: string; avatarUrl: string | null };
    groupName: string;
    participants: GroupCallParticipant[];
  }) => void;
  handleGroupCallToken: (payload: { conversationId: string; token: string }) => void;
  handleGroupCallUserJoined: (payload: { conversationId: string; participants: GroupCallParticipant[] }) => void;
  handleGroupCallUserDeclined: (payload: { conversationId: string; participants: GroupCallParticipant[] }) => void;
  handleGroupCallUserLeft: (payload: { conversationId: string; participants: GroupCallParticipant[] }) => void;
  handleGroupCallEnded: (payload: {
    conversationId: string;
    callId: string;
    duration: number;
    endedAt: string;
  }) => void;
  handleGroupCallStatusResponse: (payload: { conversationId: string; active: boolean }) => void;
  handleGroupCallError: (payload: { reason: string }) => void;

  reset: () => void;
}