import { Capacitor } from '@capacitor/core';

export const isNativeClient = () => Capacitor.isNativePlatform();

export const getApiBaseUrl = () => {
    const webApiUrl = import.meta.env.VITE_WEB_API_URL || '/api';

    if (isNativeClient()) {
        return import.meta.env.VITE_NATIVE_API_URL || webApiUrl;
    }

    return webApiUrl;
};
