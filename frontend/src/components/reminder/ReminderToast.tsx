import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bell, CalendarClock, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useReminderStore } from '@/stores/useReminderStore';
import { useMeetStore } from '@/stores/useMeetStore';
import type { Reminder } from '@/types/reminder';
import { buildMeetingUrl, extractFirstHttpUrl, extractMeetingCode, generateMeetingCode } from '@/utils/meetingLink';
import { cn } from '@/lib/utils';

type ToastId = string | number;

interface ReminderToastCardProps {
  reminder: Reminder;
  toastId: ToastId;
}

const formatReminderTime = (isoDate: string): string =>
  new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(isoDate));

export function ReminderToastCard({ reminder, toastId }: ReminderToastCardProps) {
  const navigate = useNavigate();
  const [loadingAction, setLoadingAction] = useState<'snooze' | null>(null);
  const [joiningMeeting, setJoiningMeeting] = useState(false);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const snoozeAreaRef = useRef<HTMLDivElement | null>(null);
  const snoozeReminderAsync = useReminderStore((state) => state.snoozeReminderAsync);
  const joinExistingMeeting = useMeetStore((state) => state.joinExistingMeeting);
  const reminderContent = String(reminder.content || '').trim() || [reminder.title, reminder.note].filter(Boolean).join('\n').trim();
  const meetingUrlInContent = extractFirstHttpUrl(reminderContent);
  const fallbackMeetingUrl =
    reminder.source?.type === 'meeting' && reminder.source.refId
      ? buildMeetingUrl(
        extractMeetingCode(reminder.source.refId) || generateMeetingCode(reminder.source.refId)
      )
      : null;
  const meetingUrl = useMemo(() => {
    if (meetingUrlInContent) {
      const roomCode = extractMeetingCode(meetingUrlInContent);
      if (roomCode) return buildMeetingUrl(roomCode);
      return meetingUrlInContent;
    }
    return fallbackMeetingUrl;
  }, [fallbackMeetingUrl, meetingUrlInContent]);
  const canJoinMeeting = Boolean(reminder.meetingRoomName)
    && (reminder.meetingStatus === 'active' || reminder.meetingStatus === 'scheduled');
  const isMeetingEnded = Boolean(reminder.meetingRoomName) && reminder.meetingStatus === 'ended';

  const meetingUrlParts = useMemo(() => {
    if (!meetingUrlInContent) {
      return { before: reminderContent, url: null as string | null, after: '' };
    }
    const at = reminderContent.indexOf(meetingUrlInContent);
    if (at < 0) {
      return { before: reminderContent, url: null as string | null, after: '' };
    }
    return {
      before: reminderContent.slice(0, at),
      url: meetingUrlInContent,
      after: reminderContent.slice(at + meetingUrlInContent.length),
    };
  }, [meetingUrlInContent, reminderContent]);

  useEffect(() => {
    if (!showSnoozeOptions) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!snoozeAreaRef.current?.contains(target)) setShowSnoozeOptions(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showSnoozeOptions]);

  const handleView = () => {
    toast.dismiss(toastId);
    const targetTab = reminder.status === 'triggered' || reminder.status === 'dismissed'
      ? 'past'
      : 'upcoming';
    window.location.assign(`/reminder?tab=${targetTab}&focus=${encodeURIComponent(reminder._id)}`);
  };

  const handleSnooze = async (minutes: 5 | 10 | 30 | 60) => {
    try {
      setLoadingAction('snooze');
      await snoozeReminderAsync(reminder._id, minutes);
      toast.dismiss(toastId);
      toast.success(`Đã hẹn nhắc lại sau ${minutes} phút`);
    } catch (error) {
      console.error('Snooze reminder failed:', error);
      toast.error('Không thể nhắc lại lúc này');
    } finally {
      setLoadingAction(null);
      setShowSnoozeOptions(false);
    }
  };

  const handleMeetingLinkNavigate = (event: React.MouseEvent<HTMLAnchorElement>, targetUrl: string) => {
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(targetUrl);
  };

  const handleCloseToast = () => {
    toast.dismiss(toastId);
    setShowSnoozeOptions(false);
  };

  const handleJoinMeeting = async () => {
    if (!reminder.meetingRoomName) return;

    try {
      setJoiningMeeting(true);
      await joinExistingMeeting(reminder.meetingRoomName);
      toast.dismiss(toastId);
      navigate('/meet');
    } catch {
      toast.error('Không thể tham gia cuộc họp lúc này');
    } finally {
      setJoiningMeeting(false);
    }
  };

  return (
    <div className="relative w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border/70 bg-card p-4 font-sans text-foreground shadow-[0_18px_45px_-26px_hsl(var(--foreground)/0.35)] antialiased animate-in slide-in-from-right-4 fade-in duration-300 sm:w-[408px]">
      <div className="absolute inset-x-0 top-0 h-1 bg-primary/85" />

      <button
        type="button"
        onClick={handleCloseToast}
        aria-label="Đóng"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted/60"
      >
        <X className="h-4 w-4" strokeWidth={1.65} />
      </button>

      <div className="flex gap-3.5 pt-1">
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/40 text-foreground">
          <Bell className="h-5 w-5" strokeWidth={1.65} />
        </div>

        <div className="min-w-0 flex-1 pr-7">
          <p className="text-[12px] font-semibold leading-none text-primary">
            Nhắc hẹn
          </p>

          <p className="mt-2 whitespace-pre-wrap break-words text-base font-semibold leading-6 text-foreground">
            {meetingUrlParts.before}
            {meetingUrlParts.url && (
              <a
                href={meetingUrl || meetingUrlParts.url}
                onClick={(event) => handleMeetingLinkNavigate(event, meetingUrl ?? meetingUrlParts.url ?? '')}
                className="break-all font-medium text-primary underline-offset-2 transition-colors hover:text-primary/80 hover:underline"
              >
                {meetingUrlParts.url}
              </a>
            )}
            {meetingUrlParts.after}
          </p>

          {!meetingUrlInContent && meetingUrl && (
            <a
              href={meetingUrl}
              onClick={(event) => handleMeetingLinkNavigate(event, meetingUrl)}
              className="mt-1.5 block break-all text-[13px] font-medium text-primary underline-offset-2 transition-colors hover:text-primary/80 hover:underline"
            >
              {meetingUrl}
            </a>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-muted-foreground">
            <CalendarClock className="h-4 w-4 text-foreground" strokeWidth={1.65} />
            <span>{formatReminderTime(reminder.remindAt)}</span>
            {reminder.source?.type === 'message' && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/35" />
                <span>Từ tin nhắn</span>
              </>
            )}
          </div>

          {isMeetingEnded && (
            <span className="mt-2 inline-block text-xs text-muted-foreground">
              Cuộc họp đã kết thúc
            </span>
          )}

          {canJoinMeeting && (
            <button
              type="button"
              onClick={() => {
                void handleJoinMeeting();
              }}
              disabled={joiningMeeting}
              className="mt-3 inline-flex h-9 items-center rounded-xl border border-primary/30 bg-primary/10 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
            >
              {joiningMeeting ? 'Đang vào phòng...' : 'Tham gia cuộc họp'}
            </button>
          )}
        </div>
      </div>

      {/* Snooze Options */}
      <div ref={snoozeAreaRef}>
        <div className={`grid transition-all duration-200 ${showSnoozeOptions ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
              <p className="mb-2 text-[12px] font-semibold text-muted-foreground">
                Nhắc lại sau
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 30, 60].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() => void handleSnooze(minutes as 5 | 10 | 30 | 60)}
                    className="h-9 rounded-lg border border-border bg-background text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {minutes < 60 ? `${minutes}p` : '1h'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="my-3.5 border-t border-border/70" />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleView}
            disabled={loadingAction !== null}
            className="flex h-10 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Xem
          </button>

          <button
            type="button"
            disabled={loadingAction !== null}
            onClick={() => setShowSnoozeOptions((prev) => !prev)}
            className={cn(
              "flex h-10 items-center justify-center rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50",
              showSnoozeOptions
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-background text-foreground hover:bg-muted/60"
            )}
          >
            Nhắc lại
          </button>
        </div>
      </div>
    </div>
  );
}
