import { create } from 'zustand';
import { toast } from 'sonner';
import { otpService } from '@/services/otpService';
import type OTPState from '@/types/otpState';

export const useOTPStore = create<OTPState>((set) => ({
  loading: false,

  sendOtpCreateUser: async (email: string) => {
    try {
      set({ loading: true });
      // call API
      await otpService.sendOtp(email);
      toast.success('Mã OTP đã được gửi đến email của bạn.');
    } catch (error: any) {
      console.error('Lỗi khi gửi mã OTP:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Gửi mã OTP thất bại. Vui lòng thử lại.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  sendOtpResetPassword: async (email: string) => {
    try {
      set({ loading: true });
      // call API
      await otpService.sendOtpResetPassword(email);
      toast.success('Mã OTP đã được gửi đến email của bạn.');
    } catch (error: any) {
      console.error('Lỗi khi gửi mã OTP:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Gửi mã OTP thất bại. Vui lòng thử lại.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  verifyOtpResetPassword: async (email: string, otp: string) => {
    try {
      set({ loading: true });
      // call API
      const { resetToken } = await otpService.verifyOtpResetPassword(email, otp);
      toast.success('Xác thực mã OTP thành công.');
      return resetToken;
    } catch (error: any) {
      console.error('Lỗi khi xác thực mã OTP:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Xác thực mã OTP thất bại. Vui lòng thử lại.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  }
}));