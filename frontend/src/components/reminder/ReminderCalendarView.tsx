import { ChevronDown, ChevronLeft, ChevronRight, Link2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Reminder } from '@/types/reminder';
import {
  MONTH_PICKER_WEEKDAYS,
} from '@/pages/reminder/constants';
import {
  formatDayHeader,
  formatHourAxisLabel,
  getCalendarEventTone,
  getReminderMeetingUrl,
} from '@/pages/reminder/utils';
import type { CalendarDay, CalendarDensity, CalendarEventLayout, MonthPickerRow } from '@/pages/reminder/types';

interface ReminderCalendarViewProps {
  calendarDensity: CalendarDensity;
  onCalendarDensityChange: (density: CalendarDensity) => void;
  onJumpCalendarToToday: () => void;
  onShiftCalendarWeek: (direction: -1 | 1) => void;
  calendarHeaderLabel: string;
  isMonthPickerOpen: boolean;
  onMonthPickerOpenChange: (open: boolean) => void;
  monthPickerTitle: string;
  monthPickerRows: MonthPickerRow[];
  selectedCalendarWeekStartKey: string;
  selectedCalendarDayKey: string;
  todayKey: string;
  onJumpCalendarToDate: (date: Date) => void;
  onMonthPrev: () => void;
  onMonthNext: () => void;
  calendarGridHeight: number;
  calendarDays: CalendarDay[];
  calendarHourTicks: number[];
  axisLabelTops: number[];
  majorLineTops: number[];
  minorLineTops: number[];
  calendarEventsByDay: Map<string, CalendarEventLayout[]>;
  onSelectCalendarDay: (dayKey: string) => void;
  onCalendarEventClick: (entry: CalendarEventLayout, dayKey: string) => void;
  onDeleteReminder: (reminderId: string) => void;
  onOpenReminderMeetingLink: (reminder: Reminder) => void;
}

export default function ReminderCalendarView({
  calendarDensity,
  onCalendarDensityChange,
  onJumpCalendarToToday,
  onShiftCalendarWeek,
  calendarHeaderLabel,
  isMonthPickerOpen,
  onMonthPickerOpenChange,
  monthPickerTitle,
  monthPickerRows,
  selectedCalendarWeekStartKey,
  selectedCalendarDayKey,
  todayKey,
  onJumpCalendarToDate,
  onMonthPrev,
  onMonthNext,
  calendarGridHeight,
  calendarDays,
  calendarHourTicks,
  axisLabelTops,
  majorLineTops,
  minorLineTops,
  calendarEventsByDay,
  onSelectCalendarDay,
  onCalendarEventClick,
  onDeleteReminder,
  onOpenReminderMeetingLink,
}: ReminderCalendarViewProps) {
  return (
    <div className="h-full min-h-0">
      <div className="rounded-md border border-border/60 bg-card/60 shadow-sm overflow-hidden h-full min-h-0 flex flex-col">
        <div className="relative z-30 px-3 md:px-4 py-3 border-b border-border/50 bg-background flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2 rounded-md border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
              onClick={onJumpCalendarToToday}
            >
              Hôm nay
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onShiftCalendarWeek(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onShiftCalendarWeek(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Popover open={isMonthPickerOpen} onOpenChange={onMonthPickerOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 font-semibold text-sm md:text-base"
                >
                  {calendarHeaderLabel}
                  <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${isMonthPickerOpen ? 'rotate-180' : ''}`} />
                </Button>
              </PopoverTrigger>

              <PopoverContent
                align="start"
                sideOffset={8}
                className="z-[400] w-[320px] rounded-md border border-border bg-background p-3 shadow-2xl"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="font-semibold text-base">{monthPickerTitle}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={onMonthPrev}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={onMonthNext}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-y-1 text-center text-sm text-muted-foreground mb-1.5">
                  {MONTH_PICKER_WEEKDAYS.map((label, index) => (
                    <span key={`${label}-${index}`} className="h-7 inline-flex items-center justify-center">
                      {label}
                    </span>
                  ))}
                </div>

                <div className="space-y-1">
                  {monthPickerRows.map((row, rowIndex) => {
                    const isRowSelected = row.weekStartKey === selectedCalendarWeekStartKey;

                    return (
                      <div
                        key={`month-row-${rowIndex}`}
                        className={`grid grid-cols-7 gap-1 rounded-md ${isRowSelected ? 'bg-muted' : ''}`}
                      >
                        {row.cells.map((cell) => {
                          const isSelectedDay = cell.key === selectedCalendarDayKey;
                          const isTodayCell = cell.key === todayKey;

                          return (
                            <button
                              key={cell.key}
                              type="button"
                              onClick={() => onJumpCalendarToDate(cell.date)}
                              className={`h-9 rounded-md text-sm transition-colors ${isSelectedDay
                                ? 'bg-primary text-primary-foreground font-semibold'
                                : isTodayCell
                                  ? 'font-bold text-primary hover:bg-primary/10'
                                  : cell.isCurrentMonth
                                    ? 'text-foreground hover:bg-muted/60'
                                    : 'text-muted-foreground hover:bg-muted/60'
                                }`}
                            >
                              {cell.date.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={calendarDensity}
              onChange={(event) => onCalendarDensityChange(event.target.value as CalendarDensity)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="workweek">Tuần làm việc</option>
              <option value="week">Cả tuần</option>
            </select>
          </div>
        </div>

        <div className="relative z-0 flex-1 min-h-0 overflow-auto bg-background/60 overscroll-contain beautiful-scrollbar">
          <div className="min-w-[920px]">
            <div
              className="sticky top-0 z-20 grid"
              style={{
                gridTemplateColumns: `72px repeat(${calendarDays.length}, minmax(160px, 1fr))`,
              }}
            >
              <div className="h-16 border-b border-r border-border/40 bg-background/95 backdrop-blur" />
              {calendarDays.map((day) => {
                const active = day.key === selectedCalendarDayKey;
                const isToday = day.key === todayKey;

                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => onSelectCalendarDay(day.key)}
                    className={`h-16 border-b border-border/40 text-left px-3 transition-colors backdrop-blur ${active
                      ? 'bg-primary/10'
                      : 'bg-background/90 hover:bg-muted/30'
                      }`}
                  >
                    <p className="text-sm font-medium text-foreground">{formatDayHeader(day.date)}</p>
                    <p className={`text-[12px] ${isToday ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                      {new Intl.DateTimeFormat('vi-VN', { day: '2-digit' }).format(day.date)}
                    </p>
                  </button>
                );
              })}
            </div>

            <div
              className="grid"
              style={{
                gridTemplateColumns: `72px repeat(${calendarDays.length}, minmax(160px, 1fr))`,
              }}
            >
              <div
                className="relative border-r border-border/40 bg-muted/10"
                style={{ height: `${calendarGridHeight}px` }}
              >
                {calendarHourTicks.map((hour, index) => (
                  <div
                    key={`axis-${hour}`}
                    className="absolute left-2 text-[11px] text-muted-foreground"
                    style={{ top: `${axisLabelTops[index]}px` }}
                  >
                    {formatHourAxisLabel(hour)}
                  </div>
                ))}
              </div>

              {calendarDays.map((day) => {
                const active = day.key === selectedCalendarDayKey;
                const layouts = calendarEventsByDay.get(day.key) || [];

                return (
                  <div
                    key={`${day.key}-grid`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectCalendarDay(day.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectCalendarDay(day.key);
                      }
                    }}
                    className={`relative border-l border-border/40 ${active ? 'bg-primary/5' : 'bg-background/80'}`}
                    style={{ height: `${calendarGridHeight}px` }}
                  >
                    {calendarHourTicks.map((_, index) => (
                      <div
                        key={`${day.key}-major-${index}`}
                        className="absolute left-0 right-0 border-t border-border/40"
                        style={{ top: `${majorLineTops[index]}px` }}
                      />
                    ))}

                    {calendarHourTicks.map((_, index) => (
                      <div
                        key={`${day.key}-minor-${index}`}
                        className="absolute left-0 right-0 border-t border-dashed border-border/30"
                        style={{ top: `${minorLineTops[index]}px` }}
                      />
                    ))}

                    {layouts.map((entry) => {
                      const laneWidth = 100 / entry.laneCount;
                      const leftOffset = entry.laneIndex * laneWidth;
                      const meetingUrl = getReminderMeetingUrl(entry.reminder);

                      return (
                        <div
                          key={entry.reminder._id}
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            onCalendarEventClick(entry, day.key);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onCalendarEventClick(entry, day.key);
                            }
                          }}
                          className={`group absolute overflow-hidden rounded-md border px-2 py-1 pr-6 text-left shadow-sm hover:brightness-95 transition-all ${getCalendarEventTone(entry.reminder.status)}`}
                          style={{
                            top: `${entry.topPx}px`,
                            left: `calc(${leftOffset}% + 4px)`,
                            width: `calc(${laneWidth}% - 8px)`,
                            height: `${entry.heightPx}px`,
                          }}
                        >
                          {meetingUrl && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenReminderMeetingLink(entry.reminder);
                              }}
                              className="absolute right-5 top-1 rounded-md p-0.5 opacity-0 transition-opacity group-hover:opacity-100 bg-black/15 hover:bg-black/25"
                              aria-label="Mở link cuộc họp"
                            >
                              <Link2 className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteReminder(entry.reminder._id);
                            }}
                            className="absolute right-1 top-1 rounded-md p-0.5 opacity-0 transition-opacity group-hover:opacity-100 bg-black/15 hover:bg-black/25"
                            aria-label="Xóa nhắc hẹn"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                          <span className="block text-[10px] font-semibold leading-none">{entry.timeLabel}</span>
                          <span className="block mt-1 text-[11px] leading-snug whitespace-nowrap overflow-hidden text-ellipsis">
                            {entry.preview}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

