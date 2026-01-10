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