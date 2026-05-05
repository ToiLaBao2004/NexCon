import { ChevronDown, ChevronLeft, ChevronRight, Link2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Reminder } from '@/types/reminder';
import {
  MONTH_PICKER_WEEKDAYS,
} from '@/pages/reminder/constants';
import {
  formatHourAxisLabel,
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
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm">
        <div className="relative z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-card px-3 py-3 md:px-4">
          <div className="relative flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 rounded-lg border-border/70 bg-background px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/60"
              onClick={onJumpCalendarToToday}
            >
              Hôm nay
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg"
              onClick={() => onShiftCalendarWeek(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg"
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
                  className="h-8 rounded-lg px-2.5 text-base font-semibold text-foreground transition-colors hover:bg-muted/50"
                >
                  {calendarHeaderLabel}
                  <ChevronDown className={`h-4 w-4 ml-1.5 transition-transform duration-200 ${isMonthPickerOpen ? 'rotate-180' : ''}`} />
                </Button>
              </PopoverTrigger>

              <PopoverContent
                align="start"
                sideOffset={8}
                className="z-[400] w-[320px] rounded-xl border border-border bg-background p-3 shadow-2xl"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="font-semibold text-base">{monthPickerTitle}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg"
                      onClick={onMonthPrev}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg"
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
              className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium"
            >
              <option value="workweek">Tuần làm việc</option>
              <option value="week">Cả tuần</option>
            </select>
          </div>
        </div>

        <div className="relative z-0 flex-1 min-h-0 overflow-auto bg-background overscroll-contain beautiful-scrollbar">
          <div className="min-w-[760px] md:min-w-[920px]">
            <div
              className="sticky top-0 z-20 grid"
              style={{
                gridTemplateColumns: `72px repeat(${calendarDays.length}, minmax(160px, 1fr))`,
              }}
            >
              <div className="h-16 border-b border-r border-border/40 bg-card/95 backdrop-blur" />
              {calendarDays.map((day) => {
                const active = day.key === selectedCalendarDayKey;
                const isToday = day.key === todayKey;

                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => onSelectCalendarDay(day.key)}
                    className={`relative h-16 border-b border-border/40 bg-card/95 px-4 text-left transition-colors hover:bg-muted/30 ${active ? 'after:absolute after:top-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary' : ''}`}
                  >
                    <p className={`text-2xl font-normal leading-none ${isToday || active ? 'text-primary' : 'text-muted-foreground'}`}>
                      {new Intl.DateTimeFormat('vi-VN', { day: '2-digit' }).format(day.date)}
                    </p>
                    <p className={`text-[11px] font-normal uppercase tracking-tight mt-1 ${isToday || active ? 'text-primary' : 'text-muted-foreground'}`}>
                      {new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(day.date)}
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
                    className="absolute left-2 text-[11px] text-muted-foreground font-medium"
                    style={{ top: `${axisLabelTops[index] - 6}px` }}
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
                    className={`relative border-l border-border/40 ${active ? 'bg-primary/5' : 'bg-background'}`}
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
                          className="group pointer-events-auto absolute overflow-hidden rounded-md border border-primary/25 border-l-4 border-l-primary bg-primary/10 px-2 py-1 pr-6 text-left shadow-sm transition-colors hover:bg-primary/15"
                          style={{
                            top: `${entry.topPx}px`,
                            left: `calc(${leftOffset}% + 2px)`,
                            width: `calc(${laneWidth}% - 4px)`,
                            height: `${entry.heightPx}px`,
                          }}
                        >
                          <div className="flex flex-col text-foreground">
                             <span className="block text-[11px] font-semibold leading-tight truncate">
                               {entry.preview}
                             </span>
                             <span className="block text-[10px] font-medium opacity-80">
                               {entry.timeLabel}
                             </span>
                          </div>

                          <div className="absolute right-0.5 top-0.5 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {meetingUrl && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenReminderMeetingLink(entry.reminder);
                                }}
                                className="rounded-sm bg-foreground/10 p-0.5 text-primary transition-colors hover:bg-foreground/20"
                                aria-label="Mở link"
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
                              className="rounded-sm bg-foreground/10 p-0.5 text-rose-600 transition-colors hover:bg-foreground/20"
                              aria-label="Xóa"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
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

