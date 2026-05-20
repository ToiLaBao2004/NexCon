import type { User } from './user';

export interface SessionInfo {
  sessionId: string;
  deviceName: string;
  ip: string;
  loginAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export default interface AuthState {
  accessToken: string | null;
  user: User | null;
  loading: boolean;
  sessions: SessionInfo[];
  sessionsLoading: boolean;

  setAccessToken: (accessToken: string | null) => void;

  clearState: () => void;

  verifyValidFieldsSignUp: (
    email: string,
    password: string,
    confirmPassword: string
  ) => Promise<void>;

  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    otp: string
  ) => Promise<void>;

  signIn: (
    email: string,
    password: string
  ) => Promise<void>;

  resetNewPassword: (
    resetToken: string,
    newPassword: string,
    confirmNewPassword: string
  ) => Promise<void>;

  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ) => Promise<void>;

  signOut: () => Promise<void>;

  loginGoogle: () => Promise<boolean | void>;

  fetchMe: (silent?: boolean) => Promise<void>;

  refreshToken: () => Promise<void>;

  handleGoogleCallback: () => Promise<void>;

  updateProfile: (data: { displayName?: string; bio?: string; phone?: string }) => Promise<void>;

  updateAvatar: (file: File, onProgress?: (percent: number) => void) => Promise<void>;

  getSessions: () => Promise<void>;

  signOutBySession: (sessionId: string) => Promise<void>;

  signOutAll: () => Promise<void>;
}
