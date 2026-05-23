export interface UserMusic {
  trackId: string;
}

export type UserPresenceStatus =
  | "online"
  | "away"
  | "busy"
  | "do_not_disturb"
  | "invisible"
  | "offline";

export type UserStatusMode = "auto" | "manual";

export interface UserPresence {
  userId: string;
  status: UserPresenceStatus;
  status_label?: string;
  status_mode: UserStatusMode;
  manual_status: Exclude<UserPresenceStatus, "offline">;
  show_activity: boolean;
  is_online: boolean;
  activity_hidden?: boolean;
  last_seen_at?: string | null;
  last_seen_relative?: string | null;
  updatedAt?: string | null;
}

export interface User {
  _id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  googleId?: string;
  music?: UserMusic;
  role?: "user" | "admin";
  lock?: {
    isLocked?: boolean;
    lockedAt?: string | null;
    expiresAt?: string | null;
    lockedBy?: string | null;
    reason?: string;
    unlockedAt?: string | null;
    unlockedBy?: string | null;
  };
  moderation?: {
    violationCountCache?: number;
    lastViolationAt?: string | null;
    nextViolationDecayAt?: string | null;
    violationHistory?: import("./moderation").ViolationHistoryItem[];
  };
  presence?: UserPresence | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FriendItem {
  _id: string;
  friendId: string;
  displayName: string;
  avatarUrl?: string;
  nickname?: string;
  presence?: UserPresence | null;
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
