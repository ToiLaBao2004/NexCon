export type ReminderRepeatRule = 'none' | 'daily' | 'weekly' | 'monthly';

export type ReminderStatus = 'pending' | 'triggered' | 'snoozed' | 'dismissed';

export type ReminderSourceType = 'manual' | 'message' | 'meeting';

export type ReminderNotifyChannel = 'inapp' | 'email';
export type ReminderScope = 'personal' | 'shared';
export type ReminderParticipationStatus = 'joined' | 'declined';

export interface ReminderSource {
  type: ReminderSourceType;
  refId?: string;
}

export interface Reminder {
  _id: string;
  userId: string;
  scope: ReminderScope;
  sharedKey?: string;
  conversationId?: string;
  createdBy?: string;
  participationStatus?: ReminderParticipationStatus;
  content: string;
  // Legacy fields may still exist in old records.
  title?: string;
  note?: string;
  remindAt: string;
  snoozeUntil?: string;
  repeatRule: ReminderRepeatRule;
  status: ReminderStatus;
  source?: ReminderSource;
  notifyChannels: ReminderNotifyChannel[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateReminderPayload {
  content: string;
  remindAt: string;
  repeatRule?: ReminderRepeatRule;
  source?: ReminderSource;
  notifyChannels?: ReminderNotifyChannel[];
}

export interface CreateSharedReminderFromMessagePayload {
  conversationId: string;
  messageId: string;
  content: string;
  remindAt: string;
  repeatRule?: ReminderRepeatRule;
  notifyChannels?: ReminderNotifyChannel[];
}

export interface UpdateReminderPayload {
  content?: string;
  remindAt?: string;
  repeatRule?: ReminderRepeatRule;
  notifyChannels?: ReminderNotifyChannel[];
}

export interface GetRemindersParams {
  status?: string;
  sourceType?: ReminderSourceType;
  sharedKey?: string;
  sort?: 'remindAt_asc' | 'remindAt_desc' | 'createdAt_desc';
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface GetRemindersResponse {
  reminders: Reminder[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ReminderResponse {
  reminder: Reminder;
}

export interface SharedReminderResponse {
  reminder: Reminder;
  sharedKey: string;
  participantCount: number;
  messageId: string;
}

export interface SharedReminderParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  participationStatus: ReminderParticipationStatus;
  hasReminder: boolean;
  reminderId?: string | null;
  isCreator: boolean;
  isCurrentUser: boolean;
}

export interface SharedReminderOverviewResponse {
  sharedKey: string;
  conversationId: string;
  content: string;
  remindAt: string;
  repeatRule: ReminderRepeatRule;
  source?: ReminderSource;
  createdBy: string;
  participantCount: number;
  joinedCount: number;
  declinedCount: number;
  participants: SharedReminderParticipant[];
}

export interface ReminderSummaryResponse {
  upcomingCount: number;
}

export interface DeleteReminderResponse {
  message: string;
  reminder?: Reminder;
  deletedCount?: number;
}

export interface BulkDeleteRemindersResponse {
  deletedCount: number;
  scope: 'upcoming' | 'past' | 'all';
}
