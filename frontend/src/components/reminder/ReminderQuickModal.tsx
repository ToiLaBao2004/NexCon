import { useEffect, useMemo, useState } from 'react';
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
  sharedDisabled?: boolean;
  sharedDisabledReason?: string;
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

export default function ReminderQuickModal({ conversationId, messageId, messagePreview, sharedDisabled = false, sharedDisabledReason, onClose, onCreated }: ReminderQuickModalProps) {
  const isMobile = useIsMobile();
  const createReminderAsync = useReminderStore((state) => state.createReminderAsync);
  const createSharedReminderFromMessageAsync = useReminderStore((state) => state.createSharedReminderFromMessageAsync);

  const [openQuick, setOpenQuick] = useState(true);
  const [openCustomForm, setOpenCustomForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createMode, setCreateMode] = useState<ReminderCreateMode>(sharedDisabled ? 'personal' : 'shared');

  const normalizedContent = useMemo(() => truncateContent(messagePreview || 'Tin nhắn'), [messagePreview]);
  const disableTonight = useMemo(() => new Date() > getTonightAt20(), []);
  const isSharedMode = createMode === 'shared';

  useEffect(() => {
    if (sharedDisabled && createMode === 'shared') {
      setCreateMode('personal');
    }
  }, [createMode, sharedDisabled]);

  const closeAll = () => {
    setOpenQuick(false);
    setOpenCustomForm(false);
    onClose();
  };

  const createFromDate = async (date: Date) => {
    try {
      setIsSubmitting(true);
      if (isSharedMode && sharedDisabled) {
        toast.error(sharedDisabledReason || 'Bạn không có quyền tạo nhắc hẹn chung trong nhóm này.');
        return;
      }

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
    <div className="flex-1 flex flex-col justify-between px-6 pb-6 pt-4 bg-card overflow-y-auto beautiful-scrollbar min-h-0">
      <div className="space-y-4">
        {/* Create Mode Toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
          <button
            type="button"
            disabled={sharedDisabled}
            onClick={() => setCreateMode("shared")}
            title={sharedDisabled ? (sharedDisabledReason || 'Bạn không có quyền tạo nhắc hẹn chung trong nhóm này.') : undefined}
            className={`flex-1 h-9 rounded-lg text-sm transition-colors ${sharedDisabled ? "cursor-not-allowed opacity-50" : ""} ${isSharedMode ? "bg-background text-foreground shadow-sm font-semibold" : "text-foreground/75 hover:bg-background/50 hover:text-foreground"}`}
          >
            Nhắc hẹn chung
          </button>
          <button
            type="button"
            onClick={() => setCreateMode("personal")}
            className={`flex-1 h-9 rounded-lg text-sm transition-colors ${!isSharedMode ? "bg-background text-foreground shadow-sm font-semibold" : "text-foreground/75 hover:bg-background/50 hover:text-foreground"}`}
          >
            Chỉ nhắc tôi
          </button>
        </div>

        {/* Message Preview Section */}
        <div className="overflow-hidden rounded-xl border border-border/60 bg-background p-4">
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <MessageSquareQuote className="h-4 w-4" strokeWidth={1.65} />
            Nội dung
          </label>
          <p className="text-base font-semibold leading-relaxed text-foreground line-clamp-3">
            {messagePreview || "[Không có nội dung]"}
          </p>
          <div className="mt-2.5 flex items-center gap-2 border-t border-border/50 pt-2.5">
            <p className="text-xs italic text-muted-foreground leading-normal">
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
                className={`group relative flex flex-col items-center justify-center rounded-xl border border-border/60 bg-background p-4 text-center shadow-none transition-colors hover:bg-muted/60 active:scale-[0.98] ${action.disabled ? "opacity-50 grayscale cursor-not-allowed" : "cursor-pointer"}`}
                onClick={action.onClick}
              >
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted/40 text-foreground transition-colors">
                  <ActionIcon className="h-4 w-4" strokeWidth={1.65} />
                </div>
                <p className="text-[15px] font-semibold text-foreground">
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
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold transition-all shadow-md active:scale-[0.98]"
          disabled={isSubmitting}
          onClick={() => {
            setOpenQuick(false);
            setOpenCustomForm(true);
          }}
        >
          <Clock3 className="h-4 w-4 mr-2" strokeWidth={1.65} />
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
          <SheetContent side="bottom" className="rounded-t-2xl p-0 border-t border-border/40 bg-card shadow-2xl" showCloseButton={false}>
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
            <SheetHeader className="border-b border-border/40 bg-card px-6 py-4">
              <SheetTitle className="text-xl font-semibold text-foreground text-left">
                Tạo nhắc hẹn nhanh
              </SheetTitle>
            <p className="mt-1 text-left text-sm leading-relaxed text-muted-foreground">
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
          <DialogContent className="max-w-[540px] w-[95vw] p-0 gap-0 h-[680px] max-h-[86vh] overflow-hidden rounded-xl border-border/40 bg-card flex flex-col shadow-2xl">
            <DialogHeader className="border-b border-border/40 bg-card px-6 py-4">
              <DialogTitle className="text-xl font-semibold text-foreground">
                Tạo nhắc hẹn nhanh
              </DialogTitle>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
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
          if (isSharedMode && sharedDisabled) {
            throw new Error(sharedDisabledReason || 'Bạn không có quyền tạo nhắc hẹn chung trong nhóm này.');
          }

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

