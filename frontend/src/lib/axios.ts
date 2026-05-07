import { useAuthStore } from '@/stores/useAuthStore';
import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
});

const SKIP_URLS = [
    '/auth/signin', '/auth/signup', '/auth/refresh-token',
    '/auth/verify-valid-fields-signup', '/auth/reset-new-password',
    '/auth/google/callback', '/auth/google',
    '/otp/otp-create-user', '/otp/otp-reset-password', '/otp/otp-verify-reset-password'
];

let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

const resolvePending = (token: string) => {
    pendingRequests.forEach(cb => cb(token));
    pendingRequests = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (SKIP_URLS.some(url => originalRequest.url.includes(url))) {
            return Promise.reject(error);
        }



        // Token hết hạn → thử refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            if (isRefreshing) {
                return new Promise((resolve) => {
                    pendingRequests.push((token: string) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        resolve(api(originalRequest));
                    });
                });
            }

            isRefreshing = true;

            try {
                const response = await api.post('/auth/refresh-token');
                const newAccessToken = response.data.accessToken;
                useAuthStore.getState().setAccessToken(newAccessToken);
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                resolvePending(newAccessToken);
                return api(originalRequest);
            } catch (refreshError) {
                pendingRequests = [];
                useAuthStore.getState().clearState();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;