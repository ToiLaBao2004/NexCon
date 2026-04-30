import { create } from 'zustand';
import { userService } from '@/services/userService';
import type { UserMusic } from '@/types/user';
import type { User } from '@/types/user';

interface UserStore {
    user: User | null;
    musicResults: UserMusic[];
    musicLoading: boolean;

    fetchMe: () => Promise<void>;
    searchMusic: (q: string) => Promise<void>;
    updateMusic: (music: UserMusic) => Promise<void>;
    removeMusic: () => Promise<void>;
}

export const useUserStore = create<UserStore>((set) => ({
    user: null,
    musicResults: [],
    musicLoading: false,

    fetchMe: async () => {
        const user = await userService.fetchMe();
        set({ user });
    },

    searchMusic: async (q) => {
        if (!q.trim()) {
            set({ musicResults: [] });
            return;
        }

        set({ musicLoading: true });

        try {
            const tracks = await userService.searchMusic(q);
            set({ musicResults: tracks });
        } finally {
            set({ musicLoading: false });
        }
    },

    updateMusic: async (music) => {
        const res = await userService.updateMusic(music);
        set({ user: res.user });
    },

    removeMusic: async () => {
        const res = await userService.removeMusic();
        set({ user: res.user });
    },
}));