import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Clock3, Hourglass, MessageSquareQuote, MoonStar, Sunrise, Timer } from 'lucide-react';
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
      toast.error(isSharedMode ? 'Không thể tạo nhắc hẹn chung lúc này' : 'Không thể tạo nhắc hẹn cá nhân lúc này');
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
    <div className="space-y-3 px-4 pb-4 pt-3">
      <div className="rounded-md border border-border bg-background p-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setCreateMode('shared')}
          className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors ${isSharedMode ? 'bg-sky-100 text-sky-700' : 'text-muted-foreground hover:bg-muted/60'}`}
        >
          Nhắc hẹn chung
        </button>
        <button
          type="button"
          onClick={() => setCreateMode('personal')}
          className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors ${!isSharedMode ? 'bg-emerald-100 text-emerald-700' : 'text-muted-foreground hover:bg-muted/60'}`}
        >
          Chỉ nhắc tôi
        </button>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <MessageSquareQuote className="h-3.5 w-3.5" />
          Nội dung tin nhắn
        </p>
        <p className="text-sm text-foreground line-clamp-2 leading-relaxed">{messagePreview || '[Không có nội dung]'}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {isSharedMode
            ? 'Mọi thành viên đều nhận được nhắc hẹn này và có thể chọn tham gia.'
            : 'Nhắc hẹn này chỉ hiển thị trong danh sách nhắc nhở của bạn.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {quickActions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <Button
              key={action.label}
              variant="outline"
              disabled={isSubmitting || action.disabled}
              className="h-auto min-h-[84px] py-3 px-3 whitespace-normal text-left justify-start rounded-md border-sky-200 bg-sky-50/60 text-sky-800 hover:bg-sky-100"
              onClick={action.onClick}
            >
              <div className="w-full">
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-6 w-6 rounded-md border border-sky-200 bg-white text-sky-700 inline-flex items-center justify-center">
                    <ActionIcon className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm font-medium leading-tight">{action.label}</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{action.description}</p>
              </div>
            </Button>
          );
        })}
      </div>

      <Button
        variant="outline"
        className="w-full h-10 rounded-md border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100"
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
          <SheetContent side="bottom" className="rounded-t-md p-0" showCloseButton={false}>
            <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/40 bg-background/95">
              <SheetTitle className="text-base flex items-center gap-2">
                <BellRing className="h-4.5 w-4.5 text-muted-foreground" />
                {isSharedMode ? 'Tạo nhắc hẹn chung từ tin nhắn' : 'Tạo nhắc hẹn cá nhân từ tin nhắn'}
              </SheetTitle>
              <p className="text-xs text-muted-foreground text-left">
                {isSharedMode
                  ? 'Mọi thành viên trong cuộc trò chuyện sẽ nhận nhắc hẹn này và có thể chọn tham gia hoặc không tham gia.'
                  : 'Nhắc hẹn chỉ tạo cho riêng bạn, không ảnh hưởng thành viên khác.'}
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
          <DialogContent className="max-w-[560px] p-0 gap-0 overflow-hidden border-border">
            <DialogHeader className="px-5 pt-4 pb-3 border-b border-border/40 bg-background/95">
              <DialogTitle className="text-base flex items-center gap-2">
                <BellRing className="h-4.5 w-4.5 text-muted-foreground" />
                {isSharedMode ? 'Tạo nhắc hẹn chung từ tin nhắn' : 'Tạo nhắc hẹn cá nhân từ tin nhắn'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {isSharedMode
                  ? 'Mọi thành viên trong cuộc trò chuyện sẽ nhận nhắc hẹn này và có thể chọn tham gia hoặc không tham gia.'
                  : 'Nhắc hẹn chỉ tạo cho riêng bạn, không ảnh hưởng thành viên khác.'}
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

