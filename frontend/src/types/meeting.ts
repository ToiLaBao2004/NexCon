export interface Meeting {
  _id: string;
  roomName: string;
  hostId:
    | {
        _id: string;
        fullName: string;
        avatar: string | null;
        displayName?: string;
        avatarUrl?: string | null;
      }
    | string;
  status: 'scheduled' | 'active' | 'ended';
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  participants: { userId: string; joinedAt: string }[];
  requireApproval: boolean;
  createdAt: string;
  updatedAt: string;
}
