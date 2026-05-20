import { create } from 'zustand';
import { toast } from 'sonner';
import { authService } from '@/services/authService';
import type AuthState from '@/types/authState';
import { userService } from '@/services/userService';
import { persist } from 'zustand/middleware';
import { useChatStore } from './useChatStore';
import { useNotificationStore } from './useNotificationStore';
import { useFriendStore } from './useFriendStore';
import { useSocketStore } from './useSocketStore';
import { unsubscribePushOnLogout } from '@/hooks/usePushNotification';
import { Capacitor } from '@capacitor/core';
import api, { saveRefreshToken } from '@/lib/axios';
import { clearRefreshToken } from '@/lib/axios';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { unregisterNativeFcmOnLogout } from '@/lib/nativeFcm';

const clearAuthStorage = () => {
  localStorage.removeItem('auth-storage');
};

export const useAuthStore = create<AuthState>()(
  persist((set, get) => ({
    accessToken: null,
    user: null,
    loading: false,
    sessions: [],
    sessionsLoading: false,

    setAccessToken: (accessToken: string | null) => {
      set({ accessToken });
    },

    clearState: () => {
      set({ accessToken: null, user: null, loading: false });
      useSocketStore.getState().disconnectSocket();
      useChatStore.getState().reset();
      useNotificationStore.getState().reset();
      useFriendStore.getState().reset();
      clearAuthStorage();
      clearRefreshToken();
    },

    verifyValidFieldsSignUp: async (email, password, confirmPassword) => {
      try {
        set({ loading: true });
        clearAuthStorage();
        useChatStore.getState().reset();
        useNotificationStore.getState().reset();
        useFriendStore.getState().reset();
        // API Call
        await authService.verifyValidFieldsSignUp(email, password, confirmPassword);
      } catch (error: any) {
        console.error('Lỗi khi xác định tính hợp lệ:', error);
        if (error.response?.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error('Đăng ký thất bại. Vui lòng thử lại.');
        }
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    signUp: async (email, password, firstname, lastname, otp) => {
      try {
        set({ loading: true });
        // API Call
        await authService.signUp(email, password, firstname, lastname, otp);
        toast.success('Đăng ký thành công! Bây giờ bạn có thể đăng nhập.');
      } catch (error: any) {
        console.error('Lỗi khi đăng ký:', error);
        if (error.response?.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error('Đăng ký thất bại. Vui lòng thử lại.');
        }
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    signIn: async (email, password) => {
      try {
        set({ loading: true });
        clearAuthStorage();
        useChatStore.getState().reset();
        useNotificationStore.getState().reset();
        useFriendStore.getState().reset();
        // API Call
        const { accessToken, refreshToken, user } = await authService.signIn(email, password);
        get().setAccessToken(accessToken);
        if (user) {
          set({ user });
        }
        if (Capacitor.isNativePlatform() && refreshToken) {
          await saveRefreshToken(refreshToken);
        }
        toast.success('Đăng nhập thành công!');
        await get().fetchMe();
        if (get().user?.role !== "admin") {
          useChatStore.getState().fetchConversations();
          useNotificationStore.getState().fetchNotifications();
        }
      } catch (error: any) {
        if (error.response?.status === 423 || error.response?.data?.locked) {
          throw error;
        }
        console.error('Lỗi khi đăng nhập:', error);
        if (error.response?.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error('Đăng nhập thất bại. Vui lòng thử lại.');
        }
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    resetNewPassword: async (resetToken, newPassword, confirmNewPassword) => {
      try {
        set({ loading: true });
        await authService.resetNewPassword(resetToken, newPassword, confirmNewPassword);
        toast.success('Cập nhật mật khẩu thành công!');
      } catch (error: any) {
        console.error('Lỗi khi cập nhật mật khẩu:', error);
        if (error.response?.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error('Cập nhật mật khẩu thất bại. Vui lòng thử lại.');
        }
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    changePassword: async (currentPassword, newPassword, confirmNewPassword) => {
      try {
        await userService.changePassword({ currentPassword, newPassword, confirmNewPassword });
        toast.success('Đổi mật khẩu thành công!');
      } catch (error: any) {
        console.error('Lỗi khi đổi mật khẩu:', error);
        if (error.response?.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error('Đổi mật khẩu thất bại. Vui lòng thử lại.');
        }
        throw error;
      }
    },

    signOut: async () => {
      try {
        set({ loading: true });
        const pushEndpoint = await unsubscribePushOnLogout();
        await unregisterNativeFcmOnLogout();

        await authService.signOut(pushEndpoint);

        get().clearState();
        toast.success('Đăng xuất thành công!');
      } catch (error: any) {
        console.error('Lỗi khi đăng xuất:', error);
        if (error.response?.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error('Đăng xuất thất bại. Vui lòng thử lại.');
        }
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    loginGoogle: async () => {
      try {
        if (Capacitor.isNativePlatform()) {

          const googleUser = await GoogleAuth.signIn();
          const idToken = googleUser.authentication.idToken;

          const { data } = await api.post('/auth/google/mobile', { idToken });
          get().setAccessToken(data.accessToken);
          if (data.user) {
            set({ user: data.user });
          }
          await saveRefreshToken(data.refreshToken);

          await get().fetchMe();
          if (get().user?.role !== "admin") {
            useChatStore.getState().fetchConversations();
            useNotificationStore.getState().fetchNotifications();
          }
          toast.success('Đăng nhập bằng Google thành công!');
          return true;
        } else {
          authService.loginGoogle();
        }
      } catch (error) {
        console.error('Lỗi khi đăng nhập bằng Google:', error);
        toast.error('Đăng nhập bằng Google thất bại.');
        return false;
      }
    },

    getSessions: async () => {
      try {
        set({ sessionsLoading: true });
        const sessions = await authService.getSessions();
        set({ sessions });
      } catch (error: any) {
        console.error('Lỗi khi lấy danh sách phiên:', error);
        toast.error('Không thể tải danh sách thiết bị.');
      } finally {
        set({ sessionsLoading: false });
      }
    },

    signOutBySession: async (sessionId: string) => {
      try {
        const { sessions } = get();
        const target = sessions.find(s => s.sessionId === sessionId);

        if (target?.isCurrent) {
          await unregisterNativeFcmOnLogout();
        }

        await authService.signOutBySession(sessionId);

        if (target?.isCurrent) {
          // Đang logout thiết bị hiện tại
          get().clearState();
          toast.success('Đã đăng xuất thiết bị này.');
        } else {
          // Logout thiết bị khác — cập nhật lại list
          set({ sessions: sessions.filter(s => s.sessionId !== sessionId) });
          toast.success('Đã đăng xuất thiết bị thành công.');
        }
      } catch (error: any) {
        console.error('Lỗi khi đăng xuất phiên:', error);
        toast.error('Đăng xuất thiết bị thất bại. Vui lòng thử lại.');
        throw error;
      }
    },

    signOutAll: async () => {
      try {
        set({ loading: true });
        await unregisterNativeFcmOnLogout();
        await authService.signOutAll();
        get().clearState();
        toast.success('Đã đăng xuất tất cả thiết bị.');
      } catch (error: any) {
        console.error('Lỗi khi đăng xuất tất cả:', error);
        toast.error('Đăng xuất thất bại. Vui lòng thử lại.');
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    fetchMe: async (silent = false) => {
      try {
        if (!silent) set({ loading: true });
        const user = await authService.fetchMe();
        set({ user });
      } catch (error: any) {
        console.error('Lỗi khi lấy thông tin người dùng hiện tại:', error);
        set({ user: null, accessToken: null });
        if (error.response?.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error('Không thể lấy thông tin người dùng. Vui lòng đăng nhập lại.');
        }
        throw error;
      } finally {
        if (!silent) set({ loading: false });
      }
    },

    refreshToken: async () => {
      try {
        set({ loading: true });
        const { user, fetchMe, setAccessToken } = get();
        let body = {};
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { getRefreshToken } = await import('@/lib/axios');
          const token = await getRefreshToken();
          if (!token) throw new Error('No refresh token');
          body = { refreshToken: token };
        }
        const accessToken = await authService.refreshToken(body);
        setAccessToken(accessToken);
        if (!user) {
          await fetchMe();
        }
      } catch (error) {
        console.error('Lỗi khi làm mới token:', error);
        get().clearState();
        throw error;
      } finally {
        set({ loading: false });
      }
    },

    handleGoogleCallback: async () => {
      try {
        set({ loading: true });
        const accessToken = await authService.googleSuccess();
        get().setAccessToken(accessToken);
        await get().fetchMe();
        toast.success('Đăng nhập bằng Google thành công!');
      } catch (err) {
        get().clearState();
        throw err;
      } finally {
        set({ loading: false });
      }
    },

    updateProfile: async (data) => {
      try {
        await userService.updateProfile(data);
        await get().fetchMe(true);
      } catch (error: any) {
        console.error('Lỗi khi cập nhật hồ sơ:', error);
        throw error;
      }
    },

    updateAvatar: async (file, onProgress) => {
      try {
        await userService.updateAvatar(file, onProgress);
        await get().fetchMe(true);
      } catch (error: any) {
        console.error('Lỗi khi tải lên ảnh đại diện:', error);
        throw error;
      }
    },
    updateCover: async (file, onProgress) => {
      try {
        await userService.updateCover(file, onProgress);
        await get().fetchMe(true);
      } catch (error: unknown) {
        console.error('Lỗi khi tải lên ảnh bìa:', error);
        throw error;
      }
    },
  }), {
    name: "auth-storage",
    partialize: (state) => ({ user: state.user }), // chỉ persist user 
  })
);
