import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bell, CalendarClock, Clock3, X } from 'lucide-react';
import { useReminderStore } from '@/stores/useReminderStore';
import type { Reminder } from '@/types/reminder';
import { buildMeetingUrl, extractFirstHttpUrl, extractMeetingCode, generateMeetingCode, rememberMeetingTitle } from '@/utils/meetingLink';

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
  const reminderMeetingTitle = (reminderContent.match(/Nhắc về cuộc họp:\s*(.+)/i)?.[1] || '').trim();
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
    const roomCode = extractMeetingCode(targetUrl);
    if (roomCode && reminderMeetingTitle) rememberMeetingTitle(roomCode, reminderMeetingTitle);
    window.location.assign(targetUrl);
  };

  const handleCloseToast = () => {
    toast.dismiss(toastId);
  };

  return (
    <div className="relative w-[calc(100vw-1rem)] sm:w-[340px] rounded-md border border-border bg-background shadow-lg overflow-visible animate-in slide-in-from-right-4 fade-in duration-300 before:absolute before:inset-0 before:rounded-md before:border-[3px] before:border-primary/70 before:pointer-events-none before:animate-pulse">
      <button
        type="button"
        onClick={handleCloseToast}
        aria-label="Đóng thông báo"
        className="absolute right-2.5 top-2.5 h-6 w-6 rounded-md border border-border/40 bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center justify-center"
      >
        <X className="h-3 w-3" />
      </button>

      <div className="px-3.5 pt-3.5 pb-3">
        {/* Header */}
        <div className="flex items-start gap-2.5 pr-5">
          <div className="mt-0.5 h-8 w-8 rounded-md border border-border/40 bg-muted/50 flex items-center justify-center shrink-0">
            <Bell className="h-3.5 w-3.5 text-foreground animate-ring" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug text-foreground whitespace-pre-wrap break-words">
              {meetingUrlParts.before}
              {meetingUrlParts.url && (
                <a
                  href={meetingUrl || meetingUrlParts.url}
                  onClick={(event) => handleMeetingLinkNavigate(event, meetingUrl ?? meetingUrlParts.url ?? '')}
                  className="underline text-primary break-all"
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
                className="mt-0.5 block text-xs underline text-primary break-all"
              >
                {meetingUrl}
              </a>
            )}

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                <CalendarClock className="h-3 w-3" />
                {formatReminderTime(reminder.remindAt)}
              </span>
              {reminder.source?.type === 'message' && (
                <span className="inline-flex items-center text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                  Từ tin nhắn
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-2.5 border-t border-border/40" />

        {/* Actions */}
        <div ref={snoozeAreaRef}>
          {showSnoozeOptions && (
            <div className="mb-2 rounded-md border border-border/40 bg-muted/30 p-2">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
                Nhắc lại sau
              </p>
              <div className="grid grid-cols-4 gap-1">
                {[5, 10, 30, 60].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() => void handleSnooze(minutes as 5 | 10 | 30 | 60)}
                    className="h-7 rounded-md border border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {minutes < 60 ? `${minutes}p` : '1 giờ'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleView}
              className="h-8 px-4 text-xs font-medium rounded-md inline-flex items-center gap-1.5 bg-sky-600 text-white hover:bg-sky-700 transition-colors"
            >
              Xem
            </button>
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => {
                setShowSnoozeOptions((prev) => !prev);
              }}
              className="h-8 px-3 text-xs font-medium rounded-md border border-amber-200 bg-amber-50 text-amber-700 inline-flex items-center gap-1.5 hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Clock3 className="h-3 w-3" />
              Nhắc lại
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
