import { CopyPlus, SquarePen, Trash2, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Reminder } from '@/types/reminder';
import { REPEAT_MINUTE_OPTIONS, REPEAT_TEXT, SOURCE_TEXT } from '@/pages/reminder/constants';
import { getReminderContent, getReminderMeetingTitle, getReminderMeetingUrl, formatClock, formatDayDate } from '@/pages/reminder/utils';
import type { ReminderCardOptions, ReminderTab } from '@/pages/reminder/types';
import { extractFirstHttpUrl, extractMeetingCode, rememberMeetingTitle } from '@/utils/meetingLink';

interface ReminderCardProps {
  reminder: Reminder;
  activeTab: ReminderTab;
  options?: ReminderCardOptions;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminderId: string) => void;
  onReuse: (reminder: Reminder) => void;
  onRepeat: (reminder: Reminder, minutes: number) => void;
  onBindRef?: (reminderId: string, node: HTMLDivElement | null) => void;
}

export default function ReminderCard({
  reminder,
  activeTab,
  options,
  onEdit,
  onDelete,
  onReuse,
  onRepeat,
  onBindRef,
}: ReminderCardProps) {
  const faded = options?.faded ?? false;
  const editable = options?.editable ?? true;
  const showEdit = options?.showEdit ?? false;
  const editLabel = options?.editLabel ?? 'Chỉnh sửa';
  const showReuse = options?.showReuse ?? false;
  const showRepeat = options?.showRepeat ?? false;
  const showCancel = options?.showCancel ?? false;
  const cancelVariant = options?.cancelVariant ?? 'cancel';
  const cancelLabel = options?.cancelLabel ?? 'Hủy';
  const isDeclineAction = cancelVariant === 'decline';
  const highlighted = options?.highlighted ?? false;
  const allowQuickDelete = !showCancel && reminder.scope !== 'shared';
  const subtleBadgeClass = 'rounded-md border border-border/70 bg-muted/30 text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium';
  const hoverDeleteLabel = reminder.scope === 'shared'
    ? (isDeclineAction ? 'Không tham gia nhắc hẹn này' : 'Hủy nhắc hẹn chung cho tất cả thành viên')
    : 'Xóa nhắc nhở cá nhân';
  const HoverDeleteIcon = reminder.scope === 'shared' && isDeclineAction ? UserMinus : Trash2;

  const reminderContent = getReminderContent(reminder);
  const reminderMeetingTitle = getReminderMeetingTitle(reminder);
  const meetingUrl = getReminderMeetingUrl(reminder);
  const rawMeetingUrlInContent = extractFirstHttpUrl(reminderContent);
  const meetingUrlIndex = rawMeetingUrlInContent ? reminderContent.indexOf(rawMeetingUrlInContent) : -1;
  const hasInlineMeetingUrl = meetingUrlIndex >= 0;
  const contentBeforeMeetingUrl = hasInlineMeetingUrl
    ? reminderContent.slice(0, meetingUrlIndex)
    : reminderContent;
  const contentAfterMeetingUrl = hasInlineMeetingUrl && rawMeetingUrlInContent
    ? reminderContent.slice(meetingUrlIndex + rawMeetingUrlInContent.length)
    : '';

  const handleMeetingLinkClick = (event: React.MouseEvent<HTMLAnchorElement>, targetUrl: string) => {
    event.preventDefault();
    event.stopPropagation();

    const roomCode = extractMeetingCode(targetUrl);
    if (roomCode && reminderMeetingTitle) {
      rememberMeetingTitle(roomCode, reminderMeetingTitle);
    }

    window.location.assign(targetUrl);
  };

  return (
    <div
      ref={(node) => {
        onBindRef?.(reminder._id, node);
      }}
      onClick={() => {
        if (!editable) return;
        onEdit(reminder);
      }}
      className={`group relative rounded-md border border-border/70 bg-card px-5 py-4 shadow-sm transition-all ${editable ? 'cursor-pointer hover:shadow-md hover:border-primary/30' : 'cursor-default'} ${faded ? 'opacity-65' : ''} ${highlighted ? 'ring-2 ring-primary/50 border-primary/40 bg-primary/5' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {contentBeforeMeetingUrl}
            {hasInlineMeetingUrl && rawMeetingUrlInContent && (
              <a
                href={meetingUrl || rawMeetingUrlInContent}
                onClick={(event) => handleMeetingLinkClick(event, meetingUrl || rawMeetingUrlInContent)}
                className="underline text-primary break-all"
              >
                {rawMeetingUrlInContent}
              </a>
            )}
            {contentAfterMeetingUrl}
          </h3>

          {!hasInlineMeetingUrl && meetingUrl && (
            <a
              href={meetingUrl}
              onClick={(event) => handleMeetingLinkClick(event, meetingUrl)}
              className="mt-1 block text-xs underline text-primary break-all"
            >
              {meetingUrl}
            </a>
          )}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {reminder.repeatRule !== 'none' && (
              <span className={subtleBadgeClass}>
                {REPEAT_TEXT[reminder.repeatRule]}
              </span>
            )}
            {reminder.source?.type && (
              <span className={subtleBadgeClass}>
                {SOURCE_TEXT[reminder.source.type]}
              </span>
            )}
            {reminder.scope === 'shared' && (
              <span className={subtleBadgeClass}>
                Nhắc hẹn chung
              </span>
            )}
            {reminder.scope === 'shared' && reminder.participationStatus === 'declined' && (
              <span className={subtleBadgeClass}>
                Không tham gia
              </span>
            )}
            {activeTab === 'past' && (
              <span className={subtleBadgeClass}>
                Đã nhắc
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 min-w-[110px]">
          <span className="text-right leading-none block">
            <span className="block text-base font-semibold text-foreground/90">{formatClock(reminder.remindAt)}</span>
            <span className="block mt-1 text-xs text-muted-foreground">{formatDayDate(reminder.remindAt)}</span>
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {showEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs px-3 rounded-md border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(reminder);
            }}
          >
            <SquarePen className="h-3.5 w-3.5 mr-1" />
            {editLabel}
          </Button>
        )}

        {showRepeat && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs px-3 rounded-md border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300"
                onClick={(event) => event.stopPropagation()}
              >
                Nhắc lại
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuLabel>Nhắc lại sau</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {REPEAT_MINUTE_OPTIONS.map((minutes) => (
                <DropdownMenuItem
                  key={minutes}
                  onSelect={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRepeat(reminder, minutes);
                  }}
                >
                  {minutes} phút
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {showReuse && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs px-3 rounded-md border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300"
            onClick={(event) => {
              event.stopPropagation();
              onReuse(reminder);
            }}
          >
            <CopyPlus className="h-3.5 w-3.5 mr-1" />
            Dùng lại
          </Button>
        )}

        {showCancel && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={isDeclineAction
              ? 'h-8 text-xs px-3 rounded-md border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300'
              : 'h-8 text-xs px-3 rounded-md border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300'}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(reminder._id);
            }}
          >
            {cancelLabel}
          </Button>
        )}

        {allowQuickDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(reminder._id);
            }}
            className={`ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md ${isDeclineAction
              ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-100/70'
              : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'}`}
            aria-label={hoverDeleteLabel}
            title={hoverDeleteLabel}
          >
            <HoverDeleteIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

