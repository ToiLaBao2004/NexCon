import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { reminderService } from '@/services/reminderService';
import { useReminderStore } from '@/stores/useReminderStore';
import { useIsMobile } from '@/hooks/use-mobile';

interface ScheduleMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

const getNowDatetimeLocal = (offsetMs = 0): string => {
  const now = new Date(Date.now() + offsetMs);
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

const MIN_LEAD_TIME_MS = 10 * 1000;

export default function ScheduleMeetingModal({ open, onOpenChange, conversationId }: ScheduleMeetingModalProps) {
  const isMobile = useIsMobile();
  const addReminder = useReminderStore((state) => state.addReminder);
  const [meetingName, setMeetingName] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minRemindAt = useMemo(() => getNowDatetimeLocal(MIN_LEAD_TIME_MS), [open]);

  const handleClose = () => {
    setMeetingName('');
    setMeetingTime('');
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = meetingName.trim();
    if (!trimmedName) {
      setError('Vui lòng nhập tên buổi họp.');
      return;
    }
    if (!meetingTime) {
      setError('Vui lòng chọn thời gian họp.');
      return;
    }

    const remindAtIso = new Date(meetingTime).toISOString();

    try {
      setIsSubmitting(true);
      const result = await reminderService.scheduleMeeting({
        conversationId,
        content: trimmedName,
        remindAt: remindAtIso,
      });

      if (result.reminder) {
        addReminder(result.reminder);
      }

      toast.success('Đã lên lịch cuộc họp thành công ✓');
      handleClose();
    } catch (err: unknown) {
      const maybeErr = err as { response?: { data?: { message?: string } } };
      const msg = maybeErr?.response?.data?.message || 'Không thể lên lịch cuộc họp lúc này.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); else onOpenChange(next); }}>
      <DialogContent
        showCloseButton={!isMobile}
        className={cn(
          'gap-0 p-0 overflow-hidden border-border/50 bg-card shadow-2xl flex flex-col',
          isMobile
            ? 'w-screen h-svh max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0'
            : 'max-w-[540px] max-h-[86vh] rounded-xl'
        )}
      >
        <DialogHeader className="border-b border-border/50 bg-card px-6 py-5">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Lên lịch họp
          </DialogTitle>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Tạo cuộc họp và thông báo tự động cho mọi thành viên trong cuộc trò chuyện.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 space-y-4 overflow-y-auto beautiful-scrollbar flex-1 min-h-0 bg-muted/20">
            <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
              <Label htmlFor="schedule-meeting-name" className="text-[15px] font-semibold text-foreground">Tên buổi họp</Label>
              <Input
                id="schedule-meeting-name"
                placeholder="VD: Họp tiến độ dự án..."
                maxLength={200}
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                className="h-11 rounded-xl text-[15px]"
                autoFocus
              />
            </div>

            <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
              <Label htmlFor="schedule-meeting-time" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
                <CalendarClock className="h-4 w-4" strokeWidth={1.65} />
                Thời gian bắt đầu
              </Label>
              <Input
                id="schedule-meeting-time"
                type="datetime-local"
                min={minRemindAt}
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                className="h-11 rounded-xl text-[15px]"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/50 bg-card flex-row justify-end gap-2 shrink-0">
            <Button type="button" variant="outline" className="h-10 rounded-xl font-semibold" disabled={isSubmitting} onClick={handleClose}>
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              className="h-10 rounded-xl bg-primary text-white hover:bg-primary/90 font-semibold px-6"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang tạo...' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
