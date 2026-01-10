import { create } from 'zustand';
import { toast } from 'sonner';
import { otpService } from '@/services/otpService';
import type OTPState from '@/types/otpState';

export const useOTPStore = create<OTPState>((set, get) => ({
  loading: false,

  sendOtpCreateUser: async (email: string) => {
    try {
      set({ loading: true });
      // call API
      await otpService.sendOtp(email);
      toast.success('OTP sent to your email.');
    } catch (error: any) {
      console.error('Send OTP error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);            
      } else {
        toast.error('Failed to send OTP. Please try again.');
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
      toast.success('OTP sent to your email.');
    } catch (error: any) {
      console.error('Send OTP error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);            
      } else {
        toast.error('Failed to send OTP. Please try again.');
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
      await otpService.verifyOtpResetPassword(email, otp);
      toast.success('OTP verified successfully.');
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);            
      } else {
        toast.error('Failed to verify OTP. Please try again.');
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  }
}));