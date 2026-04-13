import api from '@/lib/axios';
import type {
  BulkDeleteRemindersResponse,
  CreateReminderPayload,
  CreateSharedReminderFromMessagePayload,
  DeleteReminderResponse,
  GetRemindersParams,
  GetRemindersResponse,
  ReminderResponse,
  SharedReminderOverviewResponse,
  ReminderSummaryResponse,
  SharedReminderResponse,
  UpdateReminderPayload,
} from '@/types/reminder';

const toQueryString = (params?: GetRemindersParams): string => {
  if (!params) return '';

  const query = new URLSearchParams();

  if (params.status) query.set('status', params.status);
  if (params.sourceType) query.set('sourceType', params.sourceType);
  if (params.sharedKey) query.set('sharedKey', params.sharedKey);
  if (params.sort) query.set('sort', params.sort);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.cursor) query.set('cursor', params.cursor);
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
};

export const reminderService = {
  async createReminder(data: CreateReminderPayload): Promise<ReminderResponse> {
    const response = await api.post<ReminderResponse>('/reminders', data);
    return response.data;
  },

  async createSharedReminderFromMessage(data: CreateSharedReminderFromMessagePayload): Promise<SharedReminderResponse> {
    const response = await api.post<SharedReminderResponse>('/reminders/shared/from-message', data);
    return response.data;
  },

  async updateSharedReminderParticipation(sharedKey: string, participate: boolean): Promise<ReminderResponse> {
    const response = await api.patch<ReminderResponse>(`/reminders/shared/${encodeURIComponent(sharedKey)}/participation`, { participate });
    return response.data;
  },

  async getSharedReminderOverview(sharedKey: string): Promise<SharedReminderOverviewResponse> {
    const response = await api.get<SharedReminderOverviewResponse>(`/reminders/shared/${encodeURIComponent(sharedKey)}/overview`);
    return response.data;
  },

  async getReminders(params?: GetRemindersParams): Promise<GetRemindersResponse> {
    const query = toQueryString(params);
    const response = await api.get<GetRemindersResponse>(`/reminders${query}`);
    return response.data;
  },

  async getReminderById(id: string): Promise<ReminderResponse> {
    const response = await api.get<ReminderResponse>(`/reminders/${id}`);
    return response.data;
  },

  async getReminderSummary(): Promise<ReminderSummaryResponse> {
    const response = await api.get<ReminderSummaryResponse>('/reminders/summary');
    return response.data;
  },

  async updateReminder(id: string, data: UpdateReminderPayload): Promise<ReminderResponse> {
    const response = await api.patch<ReminderResponse>(`/reminders/${id}`, data);
    return response.data;
  },

  async snoozeReminder(id: string, minutes: 5 | 10 | 30 | 60): Promise<ReminderResponse> {
    const response = await api.post<ReminderResponse>(`/reminders/${id}/snooze`, { minutes });
    return response.data;
  },

  async dismissReminder(id: string): Promise<ReminderResponse> {
    const response = await api.post<ReminderResponse>(`/reminders/${id}/dismiss`);
    return response.data;
  },

  async deleteReminder(id: string): Promise<DeleteReminderResponse> {
    const response = await api.delete<DeleteReminderResponse>(`/reminders/${id}`);
    return response.data;
  },

  async deleteRemindersByScope(scope: 'upcoming' | 'past' | 'all'): Promise<BulkDeleteRemindersResponse> {
    const response = await api.delete<BulkDeleteRemindersResponse>(`/reminders/bulk?scope=${scope}`);
    return response.data;
  },
};
