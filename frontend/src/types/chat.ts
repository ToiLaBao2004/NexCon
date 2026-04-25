export interface Participant {
  userId: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
    nickname?: string | null;
    email: string;
    bio?: string;
    phone?: string;
  };
  joinedAt: string;
  unreadMentionCount?: number;
  mute?: {
    messages?: string | null;
    meetings?: string | null;
  };
}

export interface SeenUser {
  _id: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface ApprovalQueueItem {
  _id?: string;
  userId: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
    email: string;
  };
  addedBy: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  createdAt: string;
}

export interface Group {
  name: string;
  avatarUrl?: string | null;
  avatarId?: string | null;
  createdBy: string;
  admins?: string[];
  isApprovalRequired?: boolean;
  approvalQueue?: any[];
}

export interface LastMessage {
  _id: string;
  content: string;
  type?: MessageType;
  systemType?: string | null;
  metadata?: MessageMetadata;
  createdAt: string;
  sender: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export interface Conversation {
  _id: string;
  type: "direct" | "group";
  group: Group;
  participants: Participant[];
  isPinned?: boolean;
  pinnedAt?: string | null;
  lastMessageAt: string;
  seenBy: SeenUser[];
  lastMessage: LastMessage | null;
  unreadCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  disbanded?: boolean;
}

export interface ConversationResponse {
  conversations: Conversation[];
}

export type MessageType = 'text' | 'image' | 'audio' | 'file' | 'link' | 'system' | 'sticker';

export interface ReplyToMessage {
  _id: string;
  senderId: string | { _id: string; displayName: string };
  type: MessageType;
  content?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  filePublicId?: string | null;
  isRecalled?: boolean | null;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  hostname?: string;
}

export interface ForwardedFrom {
  messageId: string;
  conversationId: string;
  senderDisplayName: string | null;
  type: MessageType;
}

export interface MessageMetadata {
  linkPreview?: LinkPreview;
  forwardedFrom?: ForwardedFrom;

  [key: string]: any;
}

export interface Mention {
  userId: string;
  displayName: string;
  offset: number;
  length: number;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  systemType?: string | null;
  metadata?: MessageMetadata;
  content?: string | null;
  fileUrl?: string | null;
  filePublicId?: string | null;
  signedUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  senderInfo?: {
    _id?: string;
    displayName?: string;
    avatarUrl?: string | null;
  };
  isRecalled: boolean | null;
  isPinned: boolean | null;
  pinnedAt?: string | null;
  updatedAt?: string | null;
  createdAt: string;
  isOwn?: boolean;
  status?: 'sending' | 'sent' | 'error';
  progress?: number;
  replyTo?: ReplyToMessage | null;
  reactions?: { userId: string; emoji: string }[];
  mentions?: Mention[];
}

export interface MentionMessage {
  _id: string;
  content: string;
  createdAt: string;
  conversation: {
    _id: string;
    name: string | null;
    type: 'direct' | 'group' | null;
    avatarUrl?: string | null;
  };
  sender: {
    _id: string | null;
    displayName: string;
    avatarUrl?: string | null;
  };
  mentions: Mention[];
}

