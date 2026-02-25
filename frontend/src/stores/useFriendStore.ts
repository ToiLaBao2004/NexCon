import { create } from 'zustand';
import { toast } from 'sonner';
import { friendService } from '@/services/friendService';

interface FriendStore {
	loading: boolean;
	setNickName: (friendId: string, nickName: string) => Promise<void>;
}

export const useFriendStore = create<FriendStore>((set) => ({
	loading: false,

	setNickName: async (friendId: string, nickName: string) => {
		try {
			set({ loading: true });
			await friendService.setNickName(friendId, nickName);
			toast.success('Nickname updated.');
		} catch (error: any) {
			console.error('Set nickname error:', error);
			toast.error(
				error.response?.data?.message || 'Failed to update nickname. Please try again.'
			);
			throw error;
		} finally {
			set({ loading: false });
		}
	},
}));