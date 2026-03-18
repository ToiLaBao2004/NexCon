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
}

export interface SeenUser {
  _id: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface Group {
  name: string;
  createdBy: string;
}

export interface LastMessage {
  _id: string;
  content: string;
  type?: MessageType;
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
  lastMessageAt: string;
  seenBy: SeenUser[];
  lastMessage: LastMessage | null;
  unreadCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationResponse {
  conversations: Conversation[];
}

export type MessageType = 'text' | 'image' | 'file' | 'link';

export interface ReplyToMessage {
  _id: string;
  senderId: string | { _id: string; displayName: string };
  type: MessageType;
  content?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  isRecalled?: boolean | null;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content?: string | null;
  fileUrl?: string | null;
  filePublicId?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  isRecalled: boolean | null;
  isPinned: boolean | null;
  pinnedAt?: string | null;
  updatedAt?: string | null;
  createdAt: string;
  isOwn?: boolean;
  status?: 'sending' | 'sent' | 'error';
  progress?: number;
  replyTo?: ReplyToMessage | null;
}

