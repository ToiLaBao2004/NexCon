import { create } from 'zustand';
import { callService } from '@/services/callService';
import type { CallHistoryState } from '@/types/store';
import type { CallRecord } from '@/types/call';

export const useCallHistoryStore = create<CallHistoryState>((set, get) => ({
  callsByConversation: {},
  loading: false,

  fetchCallsByConversation: async (conversationId: string, isRefresh = false) => {
    const existing = get().callsByConversation[conversationId];

    // Nếu refresh thì lấy từ đầu (no cursor), nếu không thì lấy theo cursor cũ
    const currentCursor = isRefresh ? undefined : (existing?.nextCursor === undefined ? undefined : existing.nextCursor);

    // Nếu không phải refresh và đã hết data thì dừng
    if (!isRefresh && currentCursor === null) return;

    // Không set loading=true khi refresh ngầm để tránh xoay spinner làm giật UI
    if (!isRefresh) set({ loading: true });

    try {
      const { calls, nextCursor: newCursor } = await callService.fetchCallsByConversation(
        conversationId,
        10,
        currentCursor ?? undefined
      );

      set((state) => {
        const prev = state.callsByConversation[conversationId]?.items ?? [];

        if (isRefresh) {
          // Trường hợp Refresh: Cập nhật bản ghi cũ trùng ID và thêm bản ghi mới hoàn toàn
          const updatedOldItems = prev.map(p => {
            const match = calls.find(c => c._id === p._id);
            return match ? match : p;
          });

          const newOnly = calls.filter(c => !prev.some(p => p._id === c._id));
          const merged = [...newOnly, ...updatedOldItems];

          return {
            callsByConversation: {
              ...state.callsByConversation,
              [conversationId]: {
                items: merged,
                hasMore: (state.callsByConversation[conversationId]?.hasMore ?? false) || !!newCursor,
                nextCursor: newCursor ?? state.callsByConversation[conversationId]?.nextCursor ?? null,
              },
            },
          };
        } else {
          // Trường hợp Scroll Up: Prepend các items cũ hơn lên đầu mảng
          const existingIds = new Set(prev.map((c) => c._id));
          const newCalls = calls.filter((c) => !existingIds.has(c._id));
          const merged = [...newCalls, ...prev];

          return {
            callsByConversation: {
              ...state.callsByConversation,
              [conversationId]: {
                items: merged,
                hasMore: !!newCursor,
                nextCursor: newCursor ?? null,
              },
            },
          };
        }
      });
    } catch (error) {
      console.error('Error fetching call history:', error);
    } finally {
      if (!isRefresh) set({ loading: false });
    }
  },

  addCallRecord: (conversationId: string, call: CallRecord) => {
    set((state) => {
      const prev = state.callsByConversation[conversationId]?.items ?? [];
      if (prev.some((c) => c._id === call._id)) return state;

      return {
        callsByConversation: {
          ...state.callsByConversation,
          [conversationId]: {
            ...state.callsByConversation[conversationId],
            items: [...prev, call],
            hasMore: state.callsByConversation[conversationId]?.hasMore ?? false,
            nextCursor: state.callsByConversation[conversationId]?.nextCursor ?? null,
          },
        },
      };
    });
  },

  clearConversationHistory: (keepConversationIds: string[]) => {
    const keep = new Set(keepConversationIds.filter(Boolean));

    set((state) => {
      let changed = false;
      const nextCallsByConversation = { ...state.callsByConversation };

      for (const id of Object.keys(nextCallsByConversation)) {
        if (!keep.has(id)) {
          delete nextCallsByConversation[id];
          changed = true;
        }
      }

      if (!changed) return state;

      return {
        callsByConversation: nextCallsByConversation,
      };
    });
  },

  reset: () => set({ callsByConversation: {}, loading: false }),
}));
