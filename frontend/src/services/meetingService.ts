import axiosInstance from '@/lib/axios';
import type { Meeting } from '@/types/meeting';

export const meetingService = {
  create: async (data: {
    scheduledAt?: string;
    requireApproval?: boolean;
    conversationId?: string;
  }): Promise<{ meeting: Meeting; token?: string }> => {
    const res = await axiosInstance.post('/meetings', data);
    return res.data;
  },

  get: async (roomName: string): Promise<Meeting> => {
    const res = await axiosInstance.get(`/meetings/${roomName}`);
    return res.data.meeting;
  },

  join: async (roomName: string, data?: { requestApproval?: boolean }): Promise<{ token?: string; status?: 'waiting' | 'needs_approval'; meetingId?: string; isHost?: boolean; waitingRoom?: any[] }> => {
    const res = await axiosInstance.post(`/meetings/${roomName}/join`, data);
    return res.data;
  },

  end: async (roomName: string): Promise<void> => {
    await axiosInstance.delete(`/meetings/${roomName}`);
  },

};
