import api, { API_BASE_URL, getRefreshToken } from '@/lib/axios';
import { Capacitor } from '@capacitor/core';

function buildApiUrl(path: string) {
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

async function getMobileRefreshToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  return await getRefreshToken();
}

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

  submitLockedAppeal: async (
    email: string,
    reason: string
  ) => {
    const response = await api.post('/auth/locked-appeals', { email, reason });
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
    const refreshToken = await getMobileRefreshToken();
    return await api.post(
      '/auth/signout',
      {
        pushEndpoint: pushEndpoint ?? undefined,
        ...(refreshToken && { refreshToken }),
      },
      { withCredentials: true }
    );
  },

  signOutAll: async () => {
    const refreshToken = await getMobileRefreshToken();
    return await api.post(
      '/auth/signout-all',
      { ...(refreshToken && { refreshToken }) },
      { withCredentials: true }
    );
  },

  getSessions: async () => {
    const refreshToken = await getMobileRefreshToken();
    const response = refreshToken
      ? await api.post('/auth/sessions', { refreshToken }, { withCredentials: true })
      : await api.get('/auth/sessions', { withCredentials: true });
    return response.data.sessions;
  },

  signOutBySession: async (sessionId: string) => {
    const refreshToken = await getMobileRefreshToken();
    await api.delete(`/auth/sessions/${sessionId}`, {
      withCredentials: true,
      data: { ...(refreshToken && { refreshToken }) },
    });
  },

  loginGoogle: () => {
    window.location.href = buildApiUrl('/auth/google');
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
