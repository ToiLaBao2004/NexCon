import { create } from 'zustand';
import { toast } from 'sonner';
import { authService } from '@/services/authService';
import type AuthState from '@/types/authState';
import { userService } from '@/services/userService';
import { persist } from 'zustand/middleware';
import { useChatStore } from './useChatStore';
import { useNotificationStore } from './useNotificationStore';

export const useAuthStore = create<AuthState>()(
  persist((set, get) => ({
    accessToken: null,
    user: null,
    loading: false,

    setAccessToken: (accessToken: string | null) => {
      set({ accessToken });
    },

    clearState: () => {
      set({ accessToken: null, user: null, loading: false });
      useChatStore.getState().reset();
      useNotificationStore.getState().reset();
      localStorage.clear();
    },

    verifyValidFieldsSignUp: async (email, password) => {
      try {
        set({ loading: true });
        localStorage.clear();
        useChatStore.getState().reset();
        useNotificationStore.getState().reset();
        // API Call
        await authService.verifyValidFieldsSignUp(email, password);
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
        localStorage.clear();
        useChatStore.getState().reset();
        useNotificationStore.getState().reset();
        // API Call
        const { accessToken } = await authService.signIn(email, password);
        get().setAccessToken(accessToken);
        toast.success('Đăng nhập thành công!');
        await get().fetchMe();
        useChatStore.getState().fetchConversations();
        useNotificationStore.getState().fetchNotifications();
      } catch (error: any) {
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

    updateNewPassword: async (email, newPassword, confirmNewPassword) => {
      try {
        set({ loading: true });
        await authService.updateNewPassword(email, newPassword, confirmNewPassword);
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

    changePassword: async (currentPassword, newPassword) => {
      try {
        set({ loading: true });
        await userService.changePassword({ currentPassword, newPassword });
        toast.success('Đổi mật khẩu thành công!');
      } catch (error: any) {
        console.error('Lỗi khi đổi mật khẩu:', error);
        if (error.response?.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error('Đổi mật khẩu thất bại. Vui lòng thử lại.');
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

    loginGoogle: () => {
      try {
        authService.loginGoogle();
      } catch (error) {
        console.error('Lỗi khi đăng nhập bằng Google:', error);
        toast.error('Đăng nhập bằng Google thất bại.');
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
        const accessToken = await authService.refreshToken();
        setAccessToken(accessToken);
        if (!user) {
          await fetchMe();
        }
      } catch (error) {
        console.error('Lỗi khi làm mới token:', error);
        toast.error('Hết phiên làm việc. Vui lòng đăng nhập lại.');
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

    updateAvatar: async (file) => {
      try {
        await userService.updateAvatar(file);
        await get().fetchMe(true);
      } catch (error: any) {
        console.error('Lỗi khi tải lên ảnh đại diện:', error);
        throw error;
      }
    },
  }), {
    name: "auth-storage",
    partialize: (state) => ({ user: state.user }), // chỉ persist user 
  })
);