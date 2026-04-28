import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bell, CalendarClock, X } from 'lucide-react';
import { useReminderStore } from '@/stores/useReminderStore';
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
  const [loadingAction, setLoadingAction] = useState<'snooze' | null>(null);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const snoozeAreaRef = useRef<HTMLDivElement | null>(null);
  const snoozeReminderAsync = useReminderStore((state) => state.snoozeReminderAsync);
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

  return (
    <div className="relative w-[calc(100vw-1rem)] rounded-2xl border border-border/80 bg-card p-4 text-foreground shadow-sm animate-in slide-in-from-right-4 fade-in duration-300 sm:w-[380px]">

      {/* Close Button */}
      <button
        type="button"
        onClick={handleCloseToast}
        aria-label="Đóng"
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/60 transition-all hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>

      <div className="flex gap-3.5">
        {/* Icon */}
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-600/25 dark:shadow-cyan-900/35">
          <Bell className="h-5 w-5 animate-ring" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nhắc hẹn
          </p>
          
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] font-semibold leading-snug tracking-tight text-foreground">
            {meetingUrlParts.before}
            {meetingUrlParts.url && (
              <a
                href={meetingUrl || meetingUrlParts.url}
                onClick={(event) => handleMeetingLinkNavigate(event, meetingUrl ?? meetingUrlParts.url ?? '')}
                className="break-all font-medium text-primary underline transition-colors hover:text-primary/80"
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
              className="mt-1 block break-all text-xs font-medium text-primary underline transition-colors hover:text-primary/80"
            >
              {meetingUrl}
            </a>
          )}

          {/* Meta */}
          <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            <span>{formatReminderTime(reminder.remindAt)}</span>
            {reminder.source?.type === 'message' && (
              <>
                <span className="mx-1 h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span>Từ tin nhắn</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Snooze Options */}
      <div ref={snoozeAreaRef}>
        <div className={`grid transition-all duration-200 ${showSnoozeOptions ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="rounded-xl border border-border/60 bg-muted/50 p-2.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nhắc lại sau
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {[5, 10, 30, 60].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() => void handleSnooze(minutes as 5 | 10 | 30 | 60)}
                    className="rounded-md border border-border bg-background py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {minutes < 60 ? `${minutes}p` : '1h'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-3 border-t border-border/60" />

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleView}
            disabled={loadingAction !== null}
            className="flex h-9 items-center justify-center rounded-md bg-primary text-[12px] font-semibold text-white shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            Xem
          </button>

          <button
            type="button"
            disabled={loadingAction !== null}
            onClick={() => setShowSnoozeOptions((prev) => !prev)}
            className={cn(
              "flex h-9 items-center justify-center rounded-md border text-[12px] font-semibold transition-all disabled:opacity-50",
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
