export interface User {
  _id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  googleId?: string;
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