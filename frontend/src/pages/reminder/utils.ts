import { buildMeetingUrl, extractFirstHttpUrl, extractMeetingCode, generateMeetingCode } from '@/utils/meetingLink';
import type { Reminder, ReminderStatus } from '@/types/reminder';
import {
  CALENDAR_TIME_ZONE,
  CALENDAR_BUCKET_MINUTES,
} from './constants';
import type { MonthGridCell, ReminderTab } from './types';

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: CALENDAR_TIME_ZONE,
});

const CLOCK_PARTS_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: CALENDAR_TIME_ZONE,
});

export const toMinutesInVnDay = (isoDate: string): number => {
  const parts = CLOCK_PARTS_FORMATTER.formatToParts(new Date(isoDate));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  return hour * 60 + minute;
};

export const toDateKey = (date: Date): string => {
  const parts = DATE_KEY_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (key: string): Date => {
  const normalized = String(key || '').trim();

  const byDash = normalized.split('-');
  if (byDash.length === 3) {
    const [year, month, day] = byDash.map((value) => Number(value));
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return new Date(year, Math.max(0, month - 1), Math.max(1, day));
    }
  }

  const fallback = new Date(normalized);
  if (!Number.isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  }

  return new Date();
};

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const getWeekStartMonday = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const dayOfWeek = normalized.getDay();
  const delta = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(normalized, delta);
};

export const formatMonthYearLabel = (date: Date): string => {
  const label = new Intl.DateTimeFormat('vi-VN', {
    month: 'long',
    year: 'numeric',
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const formatDayHeader = (date: Date): string =>
  new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
  }).format(date);

export const formatHourAxisLabel = (hour: number): string => {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${ampm}`;
};

export const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

export const shiftMonth = (date: Date, months: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

export const getMonthGridCells = (monthDate: Date): MonthGridCell[] => {
  const monthStart = startOfMonth(monthDate);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = addDays(monthStart, -mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      key: toDateKey(date),
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
    };
  });
};

export const normalizeForSort = (items: Reminder[]): Reminder[] =>
  [...items].sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime());

export const getReminderContent = (reminder: Reminder): string => {
  const normalized = String(reminder.content || '').trim();
  if (normalized) return normalized;
  return [reminder.title, reminder.note].filter(Boolean).join('\n').trim();
};

export const getReminderMeetingTitle = (reminder: Reminder): string | null => {
  const content = getReminderContent(reminder);
  const title = (content.match(/Nhắc về cuộc họp:\s*(.+)/i)?.[1] || '').trim();
  return title || null;
};

export const getReminderMeetingUrl = (reminder: Reminder): string | null => {
  const content = getReminderContent(reminder);
  const contentUrl = extractFirstHttpUrl(content);

  if (contentUrl) {
    const roomCode = extractMeetingCode(contentUrl);
    if (!roomCode) return contentUrl;
    return buildMeetingUrl(roomCode);
  }

  if (reminder.source?.type === 'meeting' && reminder.source.refId) {
    const meetingCode = extractMeetingCode(reminder.source.refId) || generateMeetingCode(reminder.source.refId);
    return buildMeetingUrl(meetingCode);
  }

  return null;
};

export const getReminderTabFromQuery = (value: string | null): ReminderTab | null => {
  if (value === 'upcoming' || value === 'past' || value === 'all') {
    return value;
  }
  return null;
};

export const getDefaultReuseRemindAt = (): string => {
  const next = new Date(Date.now() + 30 * 60 * 1000);
  return next.toISOString();
};

export const formatClock = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: CALENDAR_TIME_ZONE,
  }).format(new Date(iso));

export const formatDayDate = (iso: string): string =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    timeZone: CALENDAR_TIME_ZONE,
  }).format(new Date(iso));

export const formatDayLabel = (key: string): string => {
  const date = new Date(`${key}T00:00:00`);
  const now = new Date();
  const todayKey = toDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  if (key === todayKey) return 'Hôm nay';
  if (key === tomorrowKey) return 'Ngày mai';

  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: CALENDAR_TIME_ZONE,
  }).format(date);
};

export const getCalendarEventTone = (status: ReminderStatus): string => {
  if (status === 'pending') {
    return 'border-primary/70 bg-primary/80 text-primary-foreground';
  }
  if (status === 'snoozed') {
    return 'border-amber-500/70 bg-amber-500/80 text-white';
  }
  if (status === 'triggered') {
    return 'border-slate-500/70 bg-slate-500/80 text-white';
  }
  return 'border-muted-foreground/40 bg-muted text-foreground';
};

export const getReminderBucket = (remindAt: string): number =>
  Math.floor(toMinutesInVnDay(remindAt) / CALENDAR_BUCKET_MINUTES);
