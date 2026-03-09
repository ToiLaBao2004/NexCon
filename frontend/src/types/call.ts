export interface CallParticipant {
  userId: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
    email?: string;
  };
  status: 'ringing' | 'accepted' | 'declined' | 'missed' | 'left' | 'kicked';
  micEnabled: boolean;
  videoEnabled: boolean;
  joinedAt: string | null;
  leftAt: string | null;
}

export interface CallRecord {
  _id: string;
  conversationId:
  | string
  | {
    _id: string;
    type: string;
    group?: { name: string };
  };
  initiatorUser: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
    email?: string;
  };
  type: 'voice' | 'video';
  participants: CallParticipant[];
  overallStatus: 'active' | 'ended' | 'canceled' | 'missed';
  duration: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CallHistoryResponse {
  calls: CallRecord[];
  nextCursor: string | null;
}
