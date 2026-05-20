export interface UserMusic {
  trackId: string;
}

export interface User {
  _id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  coverUrl?: string;
  coverId?: string;
  bio?: string;
  phone?: string;
  googleId?: string;
  music?: UserMusic;
  role?: "user" | "admin";
  lock?: {
    isLocked?: boolean;
    lockedAt?: string | null;
    lockedBy?: string | null;
    reason?: string;
    unlockedAt?: string | null;
    unlockedBy?: string | null;
  };
  moderation?: {
    violationCountCache?: number;
    lastViolationAt?: string | null;
    nextViolationDecayAt?: string | null;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface FriendItem {
  _id: string;
  friendId: string;
  displayName: string;
  avatarUrl?: string;
  nickname?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FriendSuggestion {
  _id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  score: number;
  reasons: {
    mutualFriendsCount: number;
    mutualFriends: {
      _id: string;
      displayName: string;
      avatarUrl?: string;
    }[];
    commonGroupsCount: number;
    commonGroups: {
      _id: string;
      name: string;
      avatarUrl?: string;
      memberCount?: number;
    }[];
    sameEmailDomain?: boolean;
    activeInCommonGroups?: boolean;
    recentlyJoined?: boolean;
  };
}

export interface FriendRequest {
  _id: string;
  from: {
    _id: string;
    displayName: string;
    email: string;
    avatarUrl: string;
  };
  message?: string;
  status: string;
  createdAt: string;
}

export interface SentFriendRequest {
  _id: string;
  to: {
    _id: string;
    displayName: string;
    email: string;
    avatarUrl: string;
  };
  message?: string;
  status: string;
  createdAt: string;
}
