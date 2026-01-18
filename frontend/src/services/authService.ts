import api from '@/lib/axios';

const BACKEND_URL="http://localhost:5001";

export const authService = {
  verifyValidFieldsSignUp: async (
    email: string,
    password: string,
  ) => {
    const response = await api.post('/auth/verify-valid-fields-signup',
      { email, password },
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

  updateNewPassword: async (
    email: string,
    newPassword: string,
    confirmNewPassword: string
  ) => {
    const response = await api.put('/auth/update-new-password',
      { email, newPassword, confirmNewPassword },
      { withCredentials: true }
    );
    return response.data;
  },
  
  signOut: async () => {
    return await api.post('/auth/signout', {}, { withCredentials: true });
  },

  loginGoogle: () => {
    window.location.href = `${BACKEND_URL}/api/auth/google`;
  },

  fetchMe: async () => {
    const response =  await api.get('/users/me', { withCredentials: true });
    return response.data.user;
  },

  refreshToken: async () => {
    const response = await api.post('/auth/refresh-token', {}, { withCredentials: true });
    return response.data.accessToken;
  },
};