import { create } from 'zustand';
import type { MediaCacheState } from '@/types/store';

const EXPIRY_SAFETY_WINDOW_MS = 1000;

function getSignedUrlExpiresAt(url: string): number | null {
    try {
        const expiresAt = new URL(url).searchParams.get('expires_at');
        if (!expiresAt) return null;

        const expiresAtSeconds = Number(expiresAt);
        if (!Number.isFinite(expiresAtSeconds)) return null;

        return expiresAtSeconds * 1000;
    } catch {
        return null;
    }
}

const useMediaCacheStore = create<MediaCacheState>((set, get) => ({
    cache: {},
    cacheExpiresAt: {},
    setUrl: (messageId: string, url: string) =>
        set((state) => ({
            cache: { ...state.cache, [messageId]: url },
            cacheExpiresAt: {
                ...state.cacheExpiresAt,
                [messageId]: getSignedUrlExpiresAt(url) ?? Number.POSITIVE_INFINITY,
            },
        })),
    clearUrl: (messageId: string) =>
        set((state) => {
            const newCache = { ...state.cache };
            const newCacheExpiresAt = { ...state.cacheExpiresAt };
            delete newCache[messageId];
            delete newCacheExpiresAt[messageId];
            return { cache: newCache, cacheExpiresAt: newCacheExpiresAt };
        }),
    getUrl: (messageId: string) => {
        const state = get();
        const url = state.cache[messageId];
        if (!url || state.isExpired(messageId)) return null;
        return url;
    },
    isExpired: (messageId: string) => {
        const expiresAt = get().cacheExpiresAt[messageId];
        return Number.isFinite(expiresAt) && Date.now() + EXPIRY_SAFETY_WINDOW_MS >= expiresAt;
    },
}));

export default useMediaCacheStore;
