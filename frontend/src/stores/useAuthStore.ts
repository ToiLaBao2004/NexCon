import { create } from 'zustand';
import { toast } from 'sonner';
import { authService } from '@/services/authService';
import type AuthState from '@/types/authState';

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  loading: false,

  setAccessToken: (accessToken: string | null) => {
    set({ accessToken });
  },

  clearState: () => {
    set({ accessToken: null, user: null, loading: false });
  },

  verifyValidFieldsSignUp: async (email, password) => {
    try {
      set({ loading: true });
      // call API
      await authService.verifyValidFieldsSignUp(email, password);
    } catch (error: any) {
      console.error('Verify error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);            
      } else {
        toast.error('Sign up failed. Please try again.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email, password, firstname, lastname, otp) => {
    try {
      set({ loading: true });
      // call API
      await authService.signUp(email, password, firstname, lastname, otp);
      toast.success('Sign up successful! You can now log in.');
    } catch (error: any) {
      console.error('Sign up error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);            
      } else {
        toast.error('Sign up failed. Please try again.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (email, password) => {
    try {
      set({ loading: true });
      // call API
      const { accessToken } = await authService.signIn(email, password);
      get().setAccessToken(accessToken);
      toast.success('Sign in successful!');
      await get().fetchMe();
    } catch (error: any) {
      console.error('Sign in error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);            
      } else {
        toast.error('Sign in failed. Please try again.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  updateNewPassword: async (email, newPassword, confirmNewPassword) => {
    try {
      set({ loading: true });
      await authService.updateNewPassword(email, newPassword, confirmNewPassword);
      toast.success('Password updated successfully! You can now log in with your new password.');
    } catch (error: any) {
      console.error('Update password error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);            
      } else {
        toast.error('Failed to update password. Please try again.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      set({ loading: true });
      get().clearState();
      await authService.signOut();
      toast.success('Signed out successfully!');
    } catch (error: any) {
      console.error('Sign Out error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);            
      } else {
        toast.error('Failed to sign out. Please try again.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  loginGoogle: () => {
    try {
      authService.loginGoogle();
    } catch (error) {
      console.error('Google login error:', error);
      toast.error('Google login failed.');
    }
  },

  fetchMe: async () => {
    try {
      set({ loading: true });
      const user =  await authService.fetchMe();
      set({ user });
    } catch (error: any) {
      console.error('Fetch me error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);            
      } else {
        toast.error('Failed to fetch user data. Please sign in again.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  refreshToken: async () => {
    try {
      set({ loading: true });
      const { user, fetchMe, setAccessToken } = get();
      const accessToken = await authService.refreshToken();
      setAccessToken(accessToken);
      if (!user) {
        await fetchMe();
      }
    } catch (error) {
      console.error('Refresh token error:', error);
      toast.error('Session expired. Please sign in again.');
      get().clearState();
      throw error;
    } finally {
      set({ loading: false });
    }
  },
}));