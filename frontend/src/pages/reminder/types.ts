import type { Reminder } from '@/types/reminder';

export type ReminderTab = 'upcoming' | 'past' | 'all';
export type ReminderViewMode = 'list' | 'calendar';
export type CalendarDensity = 'workweek' | 'week';

export interface CalendarDay {
  key: string;
  date: Date;
}

export interface CalendarEventLayout {
  reminder: Reminder;
  topPx: number;
  heightPx: number;
  laneIndex: number;
  laneCount: number;
  timeLabel: string;
  preview: string;
}

export interface MonthGridCell {
  date: Date;
  key: string;
  isCurrentMonth: boolean;
}

export interface MonthPickerRow {
  cells: MonthGridCell[];
  weekStartKey: string;
}

export interface ReminderCardOptions {
  faded?: boolean;
  editable?: boolean;
  showEdit?: boolean;
  editLabel?: string;
  showReuse?: boolean;
  showRepeat?: boolean;
  showCancel?: boolean;
  cancelVariant?: 'decline' | 'cancel';
  cancelLabel?: string;
  highlighted?: boolean;
}
