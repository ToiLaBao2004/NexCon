import api from '@/lib/axios';

const BACKEND_URL = import.meta.env.VITE_API_URL;

export const authService = {
  verifyValidFieldsSignUp: async (
    email: string,
    password: string,
    confirmNewPassword: string
  ) => {
    const response = await api.post('/auth/verify-valid-fields-signup',
      { email, password, confirmNewPassword },
      { withCredentials: true } // to include cookies
    );
    return response.data;
  },

  signUp: async (
    email: string,
    password: string,
    firstname: string,
    lastname: string,
    otp: string
  ) => {
    const response = await api.post('/auth/signup',
      { email, password, firstname, lastname, otp },
      { withCredentials: true }
    );
    return response.data;
  },

  signIn: async (
    email: string,
    password: string
  ) => {
    const response = await api.post('/auth/signin',
      { email, password },
      { withCredentials: true }
    );
    return response.data;
  },

  resetNewPassword: async (
    resetToken: string,
    newPassword: string,
    confirmNewPassword: string
  ) => {
    const response = await api.put('/auth/reset-new-password',
      { resetToken, newPassword, confirmNewPassword },
      { withCredentials: true }
    );
    return response.data;
  },

  signOut: async (pushEndpoint?: string | null) => {
    return await api.post(
      '/auth/signout',
      { pushEndpoint: pushEndpoint ?? undefined },
      { withCredentials: true }
    );
  },

  signOutAll: async () => {
    return await api.post(
      '/auth/signout-all',
      {},
      { withCredentials: true }
    );
  },

  getSessions: async () => {
    const response = await api.get('/auth/sessions', { withCredentials: true });
    return response.data.sessions;
  },

  signOutBySession: async (sessionId: string) => {
    await api.delete(`/auth/sessions/${sessionId}`, { withCredentials: true });
  },

  loginGoogle: () => {
    window.location.href = `${BACKEND_URL}/auth/google`;
  },

  fetchMe: async () => {
    const response = await api.get('/users/me', { withCredentials: true });
    return response.data.user;
  },

  async refreshToken(body = {}) {
    const res = await api.post('/auth/refresh-token', body);
    return res.data.accessToken as string;
  },

  googleSuccess: async () => {
    const res = await api.get('/auth/google/success', {
      withCredentials: true
    });
    return res.data.accessToken;
  },

};