import { Bell, Check, Clock3, CopyPlus, SquarePen, Trash2 } from 'lucide-react';
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
import { getReminderContent, getReminderMeetingUrl, formatClock } from '@/pages/reminder/utils';
import type { ReminderCardOptions, ReminderTab } from '@/pages/reminder/types';
import { extractFirstHttpUrl } from '@/utils/meetingLink';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChatStore } from '@/stores/useChatStore';
import UserAvatar from '@/components/chat/UserAvatar';

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
  const { user } = useAuthStore();
  const conversation = useChatStore(state => state.conversations.find(c => c._id === reminder.conversationId));

  const faded = options?.faded ?? false;
  const editable = options?.editable ?? true;
  const showEdit = options?.showEdit ?? false;
  const editLabel = options?.editLabel ?? 'Chỉnh sửa';
  const showReuse = options?.showReuse ?? false;
  const showRepeat = options?.showRepeat ?? false;
  const showCancel = options?.showCancel ?? false;
  const cancelVariant = options?.cancelVariant ?? 'cancel';
  const isDeclineAction = cancelVariant === 'decline';
  const highlighted = options?.highlighted ?? false;
  const allowQuickDelete = !showCancel && reminder.scope !== 'shared';
  const showDeleteControl = showCancel || allowQuickDelete;

  const subtleBadgeClass = 'rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors group-hover:bg-muted/80';
  const scopeBadgeClass = 'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground';

  const hoverDeleteLabel = reminder.scope === 'shared'
    ? (isDeclineAction ? 'Không tham gia nhắc hẹn này' : 'Hủy nhắc hẹn chung cho tất cả thành viên')
    : 'Xóa nhắc nhở cá nhân';

  const reminderContent = getReminderContent(reminder);
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
  const reminderDate = new Date(reminder.remindAt);
  const calendarWeekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(reminderDate);
  const calendarDay = new Intl.DateTimeFormat('vi-VN', { day: '2-digit' }).format(reminderDate);
  const calendarMonth = new Intl.DateTimeFormat('vi-VN', { month: 'numeric' }).format(reminderDate);

  let chatAvatar = null;
  let chatName = null;

  if (reminder.scope === 'shared' && conversation) {
    if (conversation.type === 'group') {
      chatName = conversation.group?.name || `${conversation.participants.length} Thành Viên`;
      chatAvatar = <UserAvatar type="seen" name={chatName} avatarUrl={conversation.group?.avatarUrl ?? undefined} />;
    } else {
      const otherUser = conversation.participants.find((p: any) => p.userId?._id?.toString() !== user?._id?.toString());
      chatName = otherUser?.userId?.nickname?.trim() ? otherUser.userId.nickname : (otherUser?.userId?.displayName || 'Unknown');
      chatAvatar = <UserAvatar type="seen" name={chatName} avatarUrl={otherUser?.userId?.avatarUrl ?? undefined} />;
    }
  }

  const handleMeetingLinkClick = (event: React.MouseEvent<HTMLAnchorElement>, targetUrl: string) => {
    event.preventDefault();
    event.stopPropagation();
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
      className={`group relative flex h-full w-full flex-col rounded-2xl border border-border/80 bg-card p-5 font-sans shadow-sm transition-all duration-200 hover:border-border hover:shadow-md ${editable ? 'cursor-pointer' : 'cursor-default'} ${faded ? 'opacity-65' : ''} ${highlighted ? 'ring-2 ring-primary/45 border-primary/60 bg-primary/10 shadow-lg shadow-primary/20' : ''}`}
    >
      {/* Top Section */}
      <div className="flex items-start gap-3.5">
        <div className="w-[84px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted/50">
          <div className="flex items-center justify-center gap-1 bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            <span className="h-1 w-1 rounded-full bg-white/90" />
            {calendarWeekday}
            <span className="h-1 w-1 rounded-full bg-white/90" />
          </div>
          <div className="flex flex-col items-center justify-center py-2.5">
            <span className="text-[32px] font-semibold leading-none text-foreground">{calendarDay}</span>
            <span className="mt-1 text-xs font-semibold text-rose-500">Tháng {calendarMonth}</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-[17px] font-semibold leading-snug tracking-tight text-foreground whitespace-pre-wrap break-words">
            {contentBeforeMeetingUrl}
            {hasInlineMeetingUrl && rawMeetingUrlInContent && (
              <a
                href={meetingUrl || rawMeetingUrlInContent}
                onClick={(event) => handleMeetingLinkClick(event, meetingUrl || rawMeetingUrlInContent)}
                className="font-medium underline text-primary transition-colors hover:text-primary/80 break-all"
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
              className="mt-1.5 block text-xs font-medium underline text-primary transition-colors hover:text-primary/80 break-all"
            >
              {meetingUrl}
            </a>
          )}

          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{formatClock(reminder.remindAt)}</span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
            {reminder.scope === 'personal' && (
              <span className={scopeBadgeClass}>
                <Check className="h-3 w-3" />
                Nhắc hẹn riêng
              </span>
            )}
            {reminder.scope === 'shared' && (
              <span className={scopeBadgeClass}>
                {conversation ? chatAvatar : <Check className="h-3 w-3" />}
                <span className="truncate max-w-[150px]">{conversation ? chatName : 'Nhắc hẹn chung'}</span>
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
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          {showRepeat && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-[12px] font-semibold text-white shadow-sm transition-all hover:bg-primary/90"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Bell className="h-4 w-4" />
                  Nhắc lại
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48" onClick={(event) => event.stopPropagation()}>
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
              className="flex h-9 items-center gap-2 rounded-md border-border bg-background px-4 text-[12px] font-semibold text-foreground transition-all hover:border-border/80 hover:bg-muted/60"
              onClick={(event) => {
                event.stopPropagation();
                onReuse(reminder);
              }}
            >
              <CopyPlus className="h-4 w-4 text-foreground" />
              Dùng lại
            </Button>
          )}

          {showEdit && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="flex h-9 items-center gap-2 rounded-md px-3 text-[12px] font-semibold text-foreground transition-all hover:bg-muted hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(reminder);
              }}
            >
              <SquarePen className="h-4 w-4 text-foreground" />
              {editLabel}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {showDeleteControl && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(reminder._id);
              }}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"
              aria-label={hoverDeleteLabel}
              title={hoverDeleteLabel}
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
