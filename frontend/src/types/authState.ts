import type { User } from './user';

export default interface AuthState {
  accessToken: string | null;
  user: User | null;
  loading: boolean;

  setAccessToken: (accessToken: string | null) => void;

  clearState: () => void;

  verifyValidFieldsSignUp: (
    email: string,
    password: string
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

  updateNewPassword : (
    email: string,
    newPassword: string,
    confirmNewPassword: string
  ) => Promise<void>;

  signOut: () => Promise<void>;

  loginGoogle: () => void;

  fetchMe: () => Promise<void>;

  refreshToken: () => Promise<void>;
}