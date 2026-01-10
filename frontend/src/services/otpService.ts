import api from '@/lib/axios';

export const otpService = {
  sendOtp: async (email: string) => {
    const response = await api.post('/otp/otp-create-user', { email }, { withCredentials: true });
    return response.data;
  },
  sendOtpResetPassword: async (email: string) => {
    const response = await api.post('/otp/otp-reset-password', { email }, { withCredentials: true });
    return response.data;
  },
  verifyOtpResetPassword: async (email: string, otp: string) => {
    const response = await api.post('/otp/otp-verify-reset-password', { email, otp }, { withCredentials: true });
    return response.data;
  }
};