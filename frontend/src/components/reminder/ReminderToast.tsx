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
    <div className="relative w-[calc(100vw-1rem)] overflow-visible rounded-2xl border-2 border-black bg-white shadow-[0_18px_36px_-22px_rgba(15,23,42,0.45)] animate-in slide-in-from-right-4 fade-in duration-300 sm:w-[372px]">
      <button
        type="button"
        onClick={handleCloseToast}
        aria-label="Đóng thông báo"
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 pr-8">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-black shadow-sm">
            <Bell className="h-4 w-4 animate-ring" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap break-words text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
              {meetingUrlParts.before}
              {meetingUrlParts.url && (
                <a
                  href={meetingUrl || meetingUrlParts.url}
                  onClick={(event) => handleMeetingLinkNavigate(event, meetingUrl ?? meetingUrlParts.url ?? '')}
                  className="break-all font-medium text-slate-900 underline transition-colors hover:text-black"
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
                className="mt-1 block break-all text-xs font-medium text-slate-900 underline transition-colors hover:text-black"
              >
                {meetingUrl}
              </a>
            )}

            {/* Meta */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-900">
                <CalendarClock className="h-3 w-3" />
                {formatReminderTime(reminder.remindAt)}
              </span>
              {reminder.source?.type === 'message' && (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-900">
                  Từ tin nhắn
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-3 border-t border-slate-100" />

        {/* Actions */}
        <div ref={snoozeAreaRef}>
          {showSnoozeOptions && (
            <div className="mb-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Nhắc lại sau
              </p>
              <div className="grid grid-cols-4 gap-1">
                {[5, 10, 30, 60].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() => void handleSnooze(minutes as 5 | 10 | 30 | 60)}
                    className="h-8 rounded-lg border border-slate-200 bg-slate-100 text-[11px] font-semibold text-black transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {minutes < 60 ? `${minutes}p` : '1 giờ'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleView}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-5 text-sm font-semibold text-black transition-colors hover:bg-slate-200"
            >
              Xem
            </button>
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => {
                setShowSnoozeOptions((prev) => !prev);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-black transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Clock3 className="h-3.5 w-3.5 text-black" />
              Nhắc lại
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
