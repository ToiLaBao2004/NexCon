import api from '@/lib/axios';
import type { CallHistoryResponse, CallRecord } from '@/types/call';

export const callService = {
  async fetchCallHistory(limit = 20, cursor?: string): Promise<CallHistoryResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const res = await api.get(`/calls/history?${params.toString()}`);
    return res.data;
  },

  async fetchCallsByConversation(conversationId: string, limit = 20, cursor?: string): Promise<CallHistoryResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const res = await api.get(`/calls/conversation/${conversationId}?${params.toString()}`);
    return res.data;
  },

  async fetchCallDetail(callId: string): Promise<{ call: CallRecord }> {
    const res = await api.get(`/calls/${callId}`);
    return res.data;
  },
};
