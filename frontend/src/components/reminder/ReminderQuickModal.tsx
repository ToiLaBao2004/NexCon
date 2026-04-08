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
    <div className="space-y-4 px-5 pb-6 pt-4">
      {/* Create Mode Toggle */}
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setCreateMode('shared')}
          className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all duration-200 ${isSharedMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Nhắc hẹn chung
        </button>
        <button
          type="button"
          onClick={() => setCreateMode('personal')}
          className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all duration-200 ${!isSharedMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Chỉ nhắc tôi
        </button>
      </div>

      {/* Message Preview Section */}
      <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
        <label className="mb-2 flex items-center gap-2 text-[13px] font-medium text-slate-500">
          <MessageSquareQuote className="h-4 w-4 text-slate-400" />
          Nội dung tin nhắn
        </label>
        <p className="text-[15px] font-semibold leading-relaxed text-slate-900 line-clamp-3">
          {messagePreview || '[Không có nội dung]'}
        </p>
        <div className="mt-3 flex items-center gap-2 border-t border-slate-200/40 pt-3">
          <p className="text-[12px] italic text-slate-500 leading-normal">
            {isSharedMode
              ? 'Mọi thành viên trong cuộc trò chuyện đều nhận được nhắc hẹn.'
              : 'Nhắc hẹn này chỉ hiển thị cho riêng bạn.'}
          </p>
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-2 gap-3">
        {quickActions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <button
              key={action.label}
              disabled={isSubmitting || action.disabled}
              className={`group relative flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50/50 active:scale-[0.98] ${action.disabled ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
              onClick={action.onClick}
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 transition-colors group-hover:border-slate-300 group-hover:bg-white group-hover:text-slate-900">
                <ActionIcon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-slate-900">{action.label}</p>
                <p className="text-[11px] font-normal leading-snug text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
                  {action.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Secondary Edit Action */}
      <Button
        variant="outline"
        className="w-full h-11 rounded-xl border-slate-200 bg-slate-100 text-slate-900 text-sm font-semibold transition-all hover:bg-slate-200 hover:border-slate-300 shadow-sm"
        disabled={isSubmitting}
        onClick={() => {
          setOpenQuick(false);
          setOpenCustomForm(true);
        }}
      >
        <Clock3 className="h-4 w-4 mr-2 text-slate-500" />
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
          <SheetContent side="bottom" className="rounded-t-3xl p-0 border-t-0 shadow-2xl" showCloseButton={false}>
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200" />
            <SheetHeader className="px-6 pt-6 pb-2">
              <SheetTitle className="text-lg font-bold flex items-center gap-2.5 text-slate-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <BellRing className="h-5 w-5" />
                </div>
                Tạo nhắc hẹn nhanh
              </SheetTitle>
              <p className="text-[13px] font-normal leading-relaxed text-left italic text-slate-500">
                {isSharedMode
                  ? 'Gửi nhắc hẹn cho mọi thành viên trong hội thoại này.'
                  : 'Đặt một lời nhắc cá nhân dựa trên tin nhắn này.'}
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
          <DialogContent className="max-w-[480px] p-0 gap-0 overflow-hidden border-0 rounded-3xl shadow-2xl">
            <DialogHeader className="px-6 pt-7 pb-2 text-left">
              <DialogTitle className="text-xl font-bold flex items-center gap-3 text-slate-900">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <BellRing className="h-6 w-6" />
                </div>
                Tạo nhắc hẹn nhanh
              </DialogTitle>
              <p className="mt-1 text-[13px] font-normal leading-relaxed italic text-slate-500">
                {isSharedMode
                  ? 'Gửi nhắc hẹn cho mọi thành viên để cùng theo dõi sự kiện quan trọng.'
                  : 'Đặt nhắc hẹn riêng bảo mật cho bản thân bạn.'}
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

