import { create } from 'zustand';
import type { MediaCacheState } from '@/types/store';

const useMediaCacheStore = create<MediaCacheState>((set) => ({
    cache: {},
    setUrl: (messageId: string, url: string) =>
        set((state) => ({ cache: { ...state.cache, [messageId]: url } })),
    clearUrl: (messageId: string) =>
        set((state) => {
            const newCache = { ...state.cache };
            delete newCache[messageId];
            return { cache: newCache };
        }),
}));

export default useMediaCacheStore;
