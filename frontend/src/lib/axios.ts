import { useAuthStore } from '@/stores/useAuthStore';
import axios from 'axios';
import { use } from 'react';

const BACKEND_URL="http://localhost:5001";

const api = axios.create({
    baseURL: import.meta.env.MODE === 'development' ? `${BACKEND_URL}/api` : "/api",
    withCredentials: true, // Include cookies in requests
});

// Add a request interceptor to include the access token in headers
api.interceptors.request.use(
    (config) => {
        const accessToken = useAuthStore.getState().accessToken;
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    })

// Auto call refresh api if access token expired
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // skip
        if (originalRequest.url.includes('/auth/signin') ||
            originalRequest.url.includes('/auth/signup') ||
            originalRequest.url.includes('/auth/refresh-token') ||
            originalRequest.url.includes('/auth/verify-valid-fields-signup') ||
            originalRequest.url.includes('/auth/update-new-password') ||
            originalRequest.url.includes('/auth/google/callback') ||
            originalRequest.url.includes('/auth/google') || 
            originalRequest.url.includes('/otp/otp-create-user') ||
            originalRequest.url.includes('/otp/otp-reset-password') ||
            originalRequest.url.includes('/otp/otp-verify-reset-password')
        ) {
            return Promise.reject(error);
        }

        originalRequest._retry = originalRequest._retry || 0;

        if (error.response?.status === 403 && originalRequest._retry < 4) {
            originalRequest._retry += 1;
            console.log("refreshing token...", originalRequest._retry);
            try {
                const response = await api.post('/auth/refresh-token', { withCredentials: true });
                const newAccessToken = response.data.accessToken;

                // Update the access token in the auth store
                useAuthStore.getState().setAccessToken(newAccessToken);

                // Update the Authorization header and retry the original request
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                // If refresh token fails, log out the user or handle accordingly
                useAuthStore.getState().clearState();
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    });


export default api;