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

export default api;