import type { Reminder, ReminderSourceType, ReminderStatus } from '@/types/reminder';

export const CALENDAR_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const CALENDAR_START_HOUR = 0;
export const CALENDAR_END_HOUR = 24;
export const CALENDAR_HOUR_ROW_HEIGHT = 64;
export const CALENDAR_HALF_HOUR_OFFSET = CALENDAR_HOUR_ROW_HEIGHT / 2;
export const CALENDAR_BUCKET_MINUTES = 30;
export const CALENDAR_STACK_EVENT_HEIGHT = 46;
export const CALENDAR_STACK_EVENT_GAP = 4;

export const MONTH_PICKER_WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const ALL_STATUSES: ReminderStatus[] = ['pending', 'snoozed', 'triggered', 'dismissed'];

export const STATUS_OPTIONS: Array<{ value: ReminderStatus; label: string }> = [
  { value: 'pending', label: 'Đang chờ' },
  { value: 'snoozed', label: 'Tạm hoãn' },
  { value: 'triggered', label: 'Đã nhắc' },
  { value: 'dismissed', label: 'Đã bỏ qua' },
];

export const REPEAT_MINUTE_OPTIONS = [5, 10, 15, 30, 60];
export const REMINDER_MIN_LEAD_TIME_MS = 60 * 1000;

export const SOURCE_OPTIONS: Array<{ value: ReminderSourceType; label: string }> = [
  { value: 'message', label: 'Tin nhắn' },
  { value: 'meeting', label: 'Cuộc họp' },
  { value: 'manual', label: 'Thủ công' },
];

export const REPEAT_TEXT: Record<Reminder['repeatRule'], string> = {
  none: '',
  daily: 'Hàng ngày',
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng',
};

export const SOURCE_TEXT: Record<ReminderSourceType, string> = {
  message: 'Tin nhắn',
  meeting: 'Cuộc họp',
  manual: 'Thủ công',
};
