import { Bell, Check, Clock3, Copy, CopyPlus, SquarePen, Trash2, Video } from 'lucide-react';
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
import { useMeetStore } from '@/stores/useMeetStore';
import { useNavigate, Link } from 'react-router';
import { toast } from 'sonner';
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
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const joinExistingMeeting = useMeetStore((state) => state.joinExistingMeeting);
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

  const subtleBadgeClass = 'rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors group-hover:bg-muted';
  const scopeBadgeClass = 'inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground';

  const hoverDeleteLabel = reminder.scope === 'shared'
    ? (isDeclineAction ? 'Không tham gia nhắc hẹn này' : 'Hủy nhắc hẹn chung cho tất cả thành viên')
    : 'Xóa nhắc nhở cá nhân';

  const reminderContent = getReminderContent(reminder);
  const meetingUrl = getReminderMeetingUrl(reminder);
  const canJoinMeeting = Boolean(reminder.meetingRoomName)
    && (reminder.meetingStatus === 'active' || reminder.meetingStatus === 'scheduled');
  const isMeetingEnded = Boolean(reminder.meetingRoomName) && reminder.meetingStatus === 'ended';
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

  let creatorNameDisplay = 'Bạn';
  let creatorAvatarUrl: string | null | undefined = undefined;

  if (reminder.createdBy && reminder.createdBy !== user?._id?.toString()) {
    if (conversation) {
      const creatorParticipant = conversation.participants.find((p: any) => p.userId?._id?.toString() === reminder.createdBy?.toString());
      if (creatorParticipant) {
        creatorNameDisplay = creatorParticipant.userId?.nickname?.trim() ? creatorParticipant.userId.nickname : (creatorParticipant.userId?.displayName || 'Thành viên');
        creatorAvatarUrl = creatorParticipant.userId?.avatarUrl;
      } else {
        creatorNameDisplay = 'Thành viên';
      }
    } else {
      creatorNameDisplay = 'Thành viên';
    }
  } else if (reminder.createdBy) {
    creatorNameDisplay = 'Bạn';
    creatorAvatarUrl = user?.avatarUrl;
  }

  const handleMeetingLinkClick = (event: React.MouseEvent<HTMLAnchorElement>, targetUrl: string) => {
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(targetUrl);
  };

  const handleJoinMeeting = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!reminder.meetingRoomName) {
      return;
    }

    try {
      await joinExistingMeeting(reminder.meetingRoomName);
      navigate('/meet');
    } catch {
      // Ignore errors here and keep reminder card interaction stable.
    }
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
      className={`group relative flex h-full w-full flex-col rounded-xl border border-transparent bg-card p-4 font-sans shadow-none transition-colors duration-200 hover:bg-muted/60 ${editable ? 'cursor-pointer' : 'cursor-default'} ${faded ? 'opacity-65' : ''} ${highlighted ? 'ring-2 ring-primary/35 border-primary/50 bg-primary/5 shadow-lg shadow-primary/10' : ''}`}
    >
      {/* Top Section */}
      <div className="flex items-start gap-3.5">
        <div className="w-[78px] shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background">
          <div className="flex items-center justify-center gap-1 bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
            <span className="h-1 w-1 rounded-full bg-white/90" />
            {calendarWeekday}
            <span className="h-1 w-1 rounded-full bg-white/90" />
          </div>
          <div className="flex flex-col items-center justify-center py-2.5">
            <span className="text-[30px] font-semibold leading-none text-foreground">{calendarDay}</span>
            <span className="mt-1 text-xs font-semibold text-muted-foreground">Tháng {calendarMonth}</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="whitespace-pre-wrap break-words text-lg font-semibold leading-snug tracking-tight text-foreground">
            {contentBeforeMeetingUrl}
            {hasInlineMeetingUrl && rawMeetingUrlInContent && (
              (!reminder.meetingRoomName || !rawMeetingUrlInContent.includes(reminder.meetingRoomName)) ? (
                <a
                  href={meetingUrl || rawMeetingUrlInContent}
                  onClick={(event) => handleMeetingLinkClick(event, meetingUrl || rawMeetingUrlInContent)}
                  className="font-medium underline text-primary underline-offset-2 transition-colors hover:text-primary/80 break-all"
                >
                  {rawMeetingUrlInContent}
                </a>
              ) : null
            )}
            {contentAfterMeetingUrl}
          </h3>

          {/* Meeting Link Box */}
          {reminder.meetingRoomName && (
            <div
              className="mt-3 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Video className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.65} />
              <Link
                to={`/meet?code=${reminder.meetingRoomName}`}
                className="flex-1 truncate text-sm font-medium text-primary underline-offset-2 hover:underline transition-colors"
              >
                {`${window.location.origin}/meet?code=${reminder.meetingRoomName}`}
              </Link>
              <button
                type="button"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                title="Sao chép link cuộc họp"
                onClick={() => {
                  const url = `${window.location.origin}/meet?code=${reminder.meetingRoomName}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Đã sao chép link cuộc họp');
                }}
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={1.65} />
              </button>
            </div>
          )}

          {!reminder.meetingRoomName && !hasInlineMeetingUrl && meetingUrl && (
            <a
              href={meetingUrl}
              onClick={(event) => handleMeetingLinkClick(event, meetingUrl)}
              className="mt-1.5 block text-sm font-medium underline text-primary transition-colors hover:text-primary/80 break-all"
            >
              {meetingUrl}
            </a>
          )}

          {isMeetingEnded && (
            <span className="mt-1.5 inline-block text-xs text-muted-foreground">
              Cuộc họp đã kết thúc
            </span>
          )}

          {canJoinMeeting && (
            <button
              type="button"
              onClick={(event) => {
                void handleJoinMeeting(event);
              }}
              className="mt-2 inline-flex h-8 items-center rounded-lg border border-primary/35 bg-primary/10 px-3 text-xs font-semibold text-primary animate-pulse transition-colors hover:bg-primary/15"
            >
              Tham gia cuộc họp
            </button>
          )}

          <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Clock3 className={`h-3.5 w-3.5 ${reminder.status === 'snoozed' ? 'text-blue-500' : 'text-muted-foreground'}`} strokeWidth={1.65} />
            <span>{formatClock(reminder.remindAt)}</span>
            {reminder.status === 'snoozed' && reminder.snoozeUntil && (
              <span className="flex items-center gap-1 text-blue-600">
                <span className="mx-1">→</span>
                <span className="font-bold font-sans">Nhắc lại lúc {formatClock(reminder.snoozeUntil)}</span>
              </span>
            )}
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
            {reminder.createdBy && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 pr-2.5 pl-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors group-hover:bg-muted">
                <UserAvatar type="seen" name={creatorNameDisplay} avatarUrl={creatorAvatarUrl ?? undefined} className="h-4 w-4" />
                Tạo bởi: {creatorNameDisplay}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/50 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {showRepeat && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Bell className="h-4 w-4" strokeWidth={1.65} />
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
              className="flex h-10 items-center gap-2 rounded-xl border-border/70 bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
              onClick={(event) => {
                event.stopPropagation();
                onReuse(reminder);
              }}
            >
              <CopyPlus className="h-4 w-4 text-foreground" strokeWidth={1.65} />
              Dùng lại
            </Button>
          )}

          {showEdit && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(reminder);
              }}
            >
              <SquarePen className="h-4 w-4 text-foreground" strokeWidth={1.65} />
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
              className="rounded-xl p-2 text-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"
              aria-label={hoverDeleteLabel}
              title={hoverDeleteLabel}
            >
              <Trash2 className="h-5 w-5" strokeWidth={1.65} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
