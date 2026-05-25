import { useAuthStore } from '@/stores/useAuthStore';
import { Preferences } from '@capacitor/preferences';
import axios from 'axios';
import { useAppStatusStore } from '@/stores/useAppStatusStore';
import { getApiBaseUrl, isNativeClient } from '@/lib/apiBaseUrl';

const isMobile = isNativeClient;
export const API_BASE_URL = getApiBaseUrl();

// Helpers lưu/lấy refresh token trên mobile
export const getRefreshToken = async (): Promise<string | null> => {
    if (!isMobile()) return null;
    const { value } = await Preferences.get({ key: 'refreshToken' });
    return value;
};

export const saveRefreshToken = async (token: string) => {
    if (isMobile()) {
        await Preferences.set({ key: 'refreshToken', value: token });
    }
};

export const clearRefreshToken = async () => {
    if (isMobile()) {
        await Preferences.remove({ key: 'refreshToken' });
    }
};

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    if (isMobile()) {
        config.headers['x-client-type'] = 'mobile';
    }
    return config;
});

const SKIP_URLS = [
    '/auth/signin', '/auth/signup', '/auth/refresh-token',
    '/auth/verify-valid-fields-signup', '/auth/reset-new-password',
    '/auth/locked-appeals',
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
    (response) => {
        useAppStatusStore.getState().clearMaintenance();
        return response;
    },
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;
        const requestUrl = originalRequest?.url || '';

        if (!navigator.onLine) {
            useAppStatusStore.getState().setOffline(true);
        } else if ([502, 503, 504].includes(status) || (!error.response && error.code !== 'ERR_CANCELED')) {
            useAppStatusStore.getState().setMaintenance(
                'Hệ thống đang bảo trì hoặc tạm thời không phản hồi. Chúng tôi sẽ quay lại sớm!'
            );
        }

        if (!originalRequest || SKIP_URLS.some(url => requestUrl.includes(url))) {
            return Promise.reject(error);
        }

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
                // Mobile: lấy refreshToken từ Preferences và gửi trong body
                // Web: cookie tự động gửi, body rỗng
                const body = isMobile()
                    ? { refreshToken: await getRefreshToken() }
                    : {};

                const response = await api.post('/auth/refresh-token', body);
                const newAccessToken = response.data.accessToken;

                useAuthStore.getState().setAccessToken(newAccessToken);
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                resolvePending(newAccessToken);
                return api(originalRequest);
            } catch (refreshError) {
                pendingRequests = [];
                useAuthStore.getState().clearState();
                await clearRefreshToken();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;
