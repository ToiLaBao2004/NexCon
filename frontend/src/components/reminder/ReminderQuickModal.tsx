import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Clock3, Hourglass, MessageSquareQuote, MoonStar, Sunrise, Timer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useReminderStore } from '@/stores/useReminderStore';
import { useIsMobile } from '@/hooks/use-mobile';
import ReminderFormModal from './ReminderFormModal';
import type { CreateReminderPayload, Reminder } from '@/types/reminder';

interface ReminderQuickModalProps {
  conversationId: string;
  messageId: string;
  messagePreview: string;
  onClose: () => void;
  onCreated?: (reminder: Reminder) => void;
}

type ReminderCreateMode = 'shared' | 'personal';

const truncateContent = (text: string, max = 120): string => {
  const normalized = text.trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}...`;
};

const getTonightAt20 = (): Date => {
  const date = new Date();
  date.setHours(20, 0, 0, 0);
  return date;
};

const getTomorrowAt8 = (): Date => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return date;
};

export default function ReminderQuickModal({ conversationId, messageId, messagePreview, onClose, onCreated }: ReminderQuickModalProps) {
  const isMobile = useIsMobile();
  const createReminderAsync = useReminderStore((state) => state.createReminderAsync);
  const createSharedReminderFromMessageAsync = useReminderStore((state) => state.createSharedReminderFromMessageAsync);

  const [openQuick, setOpenQuick] = useState(true);
  const [openCustomForm, setOpenCustomForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createMode, setCreateMode] = useState<ReminderCreateMode>('shared');

  const normalizedContent = useMemo(() => truncateContent(messagePreview || 'Tin nhắn'), [messagePreview]);
  const disableTonight = useMemo(() => new Date() > getTonightAt20(), []);
  const isSharedMode = createMode === 'shared';

  const closeAll = () => {
    setOpenQuick(false);
    setOpenCustomForm(false);
    onClose();
  };

  const createFromDate = async (date: Date) => {
    try {
      setIsSubmitting(true);
      const payload: CreateReminderPayload = {
        content: normalizedContent,
        remindAt: date.toISOString(),
        source: { type: 'message', refId: messageId },
      };

      const reminder = isSharedMode
        ? await createSharedReminderFromMessageAsync({
          conversationId,
          messageId,
          content: payload.content,
          remindAt: payload.remindAt,
          repeatRule: payload.repeatRule,
          notifyChannels: payload.notifyChannels,
        })
        : await createReminderAsync(payload);

      onCreated?.(reminder);
      toast.success(isSharedMode ? 'Đã tạo nhắc hẹn chung ✓' : 'Đã tạo nhắc hẹn cho riêng bạn ✓');
      closeAll();
    } catch (error) {
      console.error('Create reminder quick failed:', error);
      const maybeError = error as { response?: { data?: { message?: string } } };
      toast.error(
        maybeError?.response?.data?.message
        || (isSharedMode ? 'Không thể tạo nhắc hẹn chung lúc này' : 'Không thể tạo nhắc hẹn cá nhân lúc này')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickActions: Array<{
    label: string;
    description: string;
    icon: typeof Timer;
    onClick: () => void;
    disabled?: boolean;
  }> = [
      {
        label: 'Sau 20 phút',
        description: 'Nhắc nhanh trong phiên làm việc',
        icon: Timer,
        onClick: () => createFromDate(new Date(Date.now() + 20 * 60000)),
      },
      {
        label: 'Sau 1 giờ',
        description: 'Tạm hoãn một khoảng dài hơn',
        icon: Hourglass,
        onClick: () => createFromDate(new Date(Date.now() + 60 * 60000)),
      },
      {
        label: 'Tối nay 20:00',
        description: disableTonight ? 'Đã qua giờ đặt nhắc tối nay' : 'Phù hợp việc cần xử lý cuối ngày',
        icon: MoonStar,
        onClick: () => createFromDate(getTonightAt20()),
        disabled: disableTonight,
      },
      {
        label: 'Ngày mai 08:00',
        description: 'Bắt đầu buổi sáng với việc này',
        icon: Sunrise,
        onClick: () => createFromDate(getTomorrowAt8()),
      },
    ];

  const quickBody = (
    <div className="flex-1 flex flex-col justify-between px-6 pb-6 pt-4 bg-gradient-to-b from-background to-muted/10 overflow-y-auto min-h-0">
      <div className="space-y-4">
        {/* Create Mode Toggle */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1">
          <button
            type="button"
            onClick={() => setCreateMode("shared")}
            className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${isSharedMode ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"}`}
          >
            Nhắc hẹn chung
          </button>
          <button
            type="button"
            onClick={() => setCreateMode("personal")}
            className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${!isSharedMode ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"}`}
          >
            Chỉ nhắc tôi
          </button>
        </div>

        {/* Message Preview Section */}
        <div className="overflow-hidden rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/50 p-3.5">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MessageSquareQuote className="h-3.5 w-3.5" />
            Nội dung
          </label>
          <p className="text-[14px] font-semibold leading-relaxed text-slate-900 dark:text-slate-200 line-clamp-3">
            {messagePreview || "[Không có nội dung]"}
          </p>
          <div className="mt-2.5 flex items-center gap-2 border-t border-slate-200/40 dark:border-slate-700/60 pt-2.5">
            <p className="text-[11px] italic text-slate-500 dark:text-slate-400 leading-normal">
              {isSharedMode
                ? "Mọi thành viên trong nhóm đều nhận được thông báo."
                : "Lời nhắc này chỉ hiển thị với riêng bạn."}
            </p>
          </div>
        </div>

        {/* Quick Action Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {quickActions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <button
                key={action.label}
                title={action.description}
                disabled={isSubmitting || action.disabled}
                className={`group relative flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 p-4 text-center shadow-sm transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 active:scale-[0.98] ${action.disabled ? "opacity-50 grayscale cursor-not-allowed" : "cursor-pointer"}`}
                onClick={action.onClick}
              >
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 transition-colors group-hover:border-slate-300 dark:group-hover:border-slate-500 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:text-slate-900 dark:group-hover:text-white">
                  <ActionIcon className="h-4 w-4" />
                </div>
                <p className="text-[14px] font-bold text-slate-900 dark:text-slate-100">
                  {action.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Secondary Edit Action */}
      <div className="pt-3">
        <Button
          className="w-full h-11 rounded-xl bg-primary text-white hover:bg-primary/90 text-sm font-bold transition-all shadow-md active:scale-[0.98]"
          disabled={isSubmitting}
          onClick={() => {
            setOpenQuick(false);
            setOpenCustomForm(true);
          }}
        >
          <Clock3 className="h-4 w-4 mr-2" />
          Chỉnh sửa chi tiết
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <Sheet
          open={openQuick}
          onOpenChange={(nextOpen) => {
            setOpenQuick(nextOpen);
            if (!nextOpen) onClose();
          }}
        >
          <SheetContent side="bottom" className="rounded-t-3xl p-0 border-t-0 dark:border-slate-800 dark:bg-slate-900 shadow-2xl" showCloseButton={false}>
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
            <SheetHeader className="border-b border-border/40 bg-card/80 px-6 py-4">
              <SheetTitle className="text-xl font-semibold text-foreground text-left">
                Tạo nhắc hẹn nhanh
              </SheetTitle>
              <p className="text-[11px] text-muted-foreground mt-1 text-left">
                {isSharedMode
                  ? "Gửi nhắc hẹn cho mọi thành viên trong hội thoại này."
                  : "Đặt một lời nhắc cá nhân dựa trên tin nhắn này."}
              </p>
            </SheetHeader>
            {quickBody}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog
          open={openQuick}
          onOpenChange={(nextOpen) => {
            setOpenQuick(nextOpen);
            if (!nextOpen) onClose();
          }}
        >
          <DialogContent className="max-w-[540px] w-[95vw] p-0 gap-0 h-[680px] max-h-[86vh] overflow-hidden border-border/40 flex flex-col shadow-2xl">
            <DialogHeader className="border-b border-border/40 bg-card/80 px-6 py-4">
              <DialogTitle className="text-xl font-semibold text-foreground">
                Tạo nhắc hẹn nhanh
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-1">
                {isSharedMode
                  ? "Gửi nhắc hẹn cho mọi thành viên để cùng theo dõi sự kiện quan trọng."
                  : "Đặt nhắc hẹn riêng bảo mật cho bản thân bạn."}
              </p>
            </DialogHeader>
            {quickBody}
          </DialogContent>
        </Dialog>
      )}

      <ReminderFormModal
        open={openCustomForm}
        onOpenChange={(nextOpen) => {
          setOpenCustomForm(nextOpen);
          if (!nextOpen) onClose();
        }}
        mode="create"
        prefillData={{
          content: normalizedContent,
          source: { type: 'message', refId: messageId },
        }}
        onCreateSubmit={async (payload) => {
          const reminder = isSharedMode
            ? await createSharedReminderFromMessageAsync({
              conversationId,
              messageId,
              content: payload.content,
              remindAt: payload.remindAt,
              repeatRule: payload.repeatRule,
              notifyChannels: payload.notifyChannels,
            })
            : await createReminderAsync(payload);
          return reminder;
        }}
        syncStore={false}
        onSuccess={(reminder) => {
          onCreated?.(reminder);
        }}
      />
    </>
  );
}

