import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CalendarClock, Repeat2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useReminderStore } from '@/stores/useReminderStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { REMINDER_MIN_LEAD_TIME_MS } from '@/pages/reminder/constants';
import type {
  CreateReminderPayload,
  Reminder,
  ReminderNotifyChannel,
  ReminderRepeatRule,
  UpdateReminderPayload,
} from '@/types/reminder';

type ReminderFormValues = {
  content?: string;
  remindAt?: string;
  repeatRule?: ReminderRepeatRule;
  notifyChannels: ReminderNotifyChannel[];
};

const buildReminderFormSchema = (notifyOnly: boolean) => z
  .object({
    content: z.string().trim().max(1200, 'Tối đa 1200 ký tự').optional(),
    remindAt: z.string().optional(),
    repeatRule: z.enum(['none', 'daily', 'weekly', 'monthly']).optional(),
    notifyChannels: z.array(z.enum(['inapp', 'email'])).min(1, 'Vui lòng chọn ít nhất một kênh thông báo'),
  })
  .superRefine((value, ctx) => {
    if (notifyOnly) return;

    if (!value.content || value.content.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'Nội dung là bắt buộc',
      });
    }

    if (!value.remindAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remindAt'],
        message: 'Vui lòng chọn thời gian nhắc',
      });
      return;
    }

    const remindAtTime = new Date(value.remindAt).getTime();
    if (Number.isNaN(remindAtTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remindAt'],
        message: 'Thời gian không hợp lệ',
      });
      return;
    }

    if (remindAtTime <= Date.now() + REMINDER_MIN_LEAD_TIME_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remindAt'],
        message: 'Thời gian nhắc cần cách hiện tại tối thiểu 10 giây',
      });
    }

    if (!value.repeatRule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repeatRule'],
        message: 'Vui lòng chọn kiểu lặp',
      });
    }
  });

export interface ReminderFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  editScope?: 'full' | 'notifyOnly';
  reminder?: Reminder;
  prefillData?: Partial<CreateReminderPayload>;
  onCreateSubmit?: (payload: CreateReminderPayload) => Promise<Reminder>;
  onSuccess?: (reminder: Reminder) => void;
  syncStore?: boolean;
}

const CHANNEL_OPTIONS: Array<{ value: ReminderNotifyChannel; label: string; description: string }> = [
  { value: 'inapp', label: 'Trong app', description: 'Hiện popup ngay trong NexCon' },
  { value: 'email', label: 'Email', description: 'Gửi nhắc nhở vào hộp thư của bạn' },
];

const isoToDatetimeLocal = (isoDate: string): string => {
  const date = new Date(isoDate);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const getNowDatetimeLocal = (offsetMs = 0): string => {
  const now = new Date(Date.now() + offsetMs);
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

const getServerErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { response?: { data?: { message?: string } } };
    if (maybeError.response?.data?.message) {
      return maybeError.response.data.message;
    }
  }
  return 'Có lỗi xảy ra, vui lòng thử lại.';
};

export default function ReminderFormModal({
  open,
  onOpenChange,
  mode,
  editScope = 'full',
  reminder,
  prefillData,
  onCreateSubmit,
  onSuccess,
  syncStore = true,
}: ReminderFormModalProps) {
  const isMobile = useIsMobile();
  const addReminder = useReminderStore((state) => state.addReminder);
  const createReminderAsync = useReminderStore((state) => state.createReminderAsync);
  const updateReminderAsync = useReminderStore((state) => state.updateReminderAsync);
  const [serverError, setServerError] = useState<string | null>(null);
  const isNotifyOnlyEdit = mode === 'edit' && editScope === 'notifyOnly';
  const validationSchema = useMemo(() => buildReminderFormSchema(isNotifyOnlyEdit), [isNotifyOnlyEdit]);

  const defaultValues = useMemo<ReminderFormValues>(() => {
    const source = mode === 'edit' ? reminder : undefined;
    const remindAtRaw = source?.remindAt ?? prefillData?.remindAt;

    const channelsFromSource = source?.notifyChannels;
    const channelsFromPrefill = prefillData?.notifyChannels;

    return {
      content: source?.content ?? prefillData?.content ?? '',
      remindAt: remindAtRaw ? isoToDatetimeLocal(remindAtRaw) : '',
      repeatRule: (source?.repeatRule ?? prefillData?.repeatRule ?? 'none') as ReminderRepeatRule,
      notifyChannels: (channelsFromSource ?? channelsFromPrefill ?? ['inapp']) as ReminderNotifyChannel[],
    };
  }, [mode, reminder, prefillData]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReminderFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues,
  });

  const currentChannels = watch('notifyChannels');
  const minRemindAt = useMemo(() => getNowDatetimeLocal(REMINDER_MIN_LEAD_TIME_MS), [open]);

  useEffect(() => {
    if (!open) return;
    reset(defaultValues);
    setServerError(null);
  }, [open, defaultValues, reset]);

  const toggleChannel = (channel: ReminderNotifyChannel) => {
    const next = currentChannels.includes(channel)
      ? currentChannels.filter((item) => item !== channel)
      : [...currentChannels, channel];
    setValue('notifyChannels', next, { shouldValidate: true });
  };

  const onSubmit = async (values: ReminderFormValues) => {
    setServerError(null);

    try {
      if (mode === 'create') {
        const remindAtIso = new Date(String(values.remindAt || '')).toISOString();
        const payload: CreateReminderPayload = {
          content: String(values.content || '').trim(),
          remindAt: remindAtIso,
          repeatRule: values.repeatRule || 'none',
          notifyChannels: values.notifyChannels,
          source: prefillData?.source,
        };

        const created = onCreateSubmit
          ? await onCreateSubmit(payload)
          : await createReminderAsync(payload, {
            syncStore,
            refreshSummary: syncStore,
          });
        if (onCreateSubmit && syncStore) {
          addReminder(created);
        }
        onSuccess?.(created);
        toast.success('Đã tạo nhắc nhở');
      } else {
        if (!reminder?._id) {
          setServerError('Không tìm thấy nhắc nhở để cập nhật.');
          return;
        }

        const payload: UpdateReminderPayload = isNotifyOnlyEdit
          ? {
            notifyChannels: values.notifyChannels,
          }
          : {
            content: String(values.content || '').trim(),
            remindAt: new Date(String(values.remindAt || '')).toISOString(),
            repeatRule: values.repeatRule || 'none',
            notifyChannels: values.notifyChannels,
          };

        const updated = await updateReminderAsync(reminder._id, payload, {
          syncStore,
          refreshSummary: syncStore,
        });
        onSuccess?.(updated);
        toast.success('Đã cập nhật');
      }

      onOpenChange(false);
    } catch (error) {
      setServerError(getServerErrorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!isMobile}
        className={cn(
          'gap-0 p-0 overflow-hidden border-border/40 flex flex-col',
          isMobile
            ? 'w-screen h-svh max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0'
            : 'max-w-[540px] max-h-[86vh]'
        )}
      >
        <DialogHeader className="px-6 py-4 border-b border-border/40 bg-white">
          <DialogTitle className="text-xl font-semibold text-slate-900">
            {mode === 'create'
              ? 'Tạo nhắc nhở mới'
              : isNotifyOnlyEdit
                ? 'Tùy chỉnh thông báo cá nhân'
                : 'Chỉnh sửa nhắc nhở'}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            {isNotifyOnlyEdit
              ? 'Bạn chỉ thay đổi kênh thông báo cho tài khoản của mình, không ảnh hưởng thành viên khác.'
              : 'Đặt thời gian phù hợp để không bỏ lỡ công việc quan trọng.'}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="px-4 py-3 space-y-3 overflow-y-auto flex-1 min-h-0 bg-gradient-to-b from-background to-muted/10">
            {!isNotifyOnlyEdit && (
              <>
                <div className="space-y-1.5 rounded-md border border-border/40 bg-card/70 p-2.5">
                  <Label htmlFor="reminder-content">Nội dung</Label>
                  <Textarea id="reminder-content" maxLength={1200} rows={3} {...register('content')} />
                  {errors.content && <p className="text-sm text-destructive">{errors.content.message}</p>}
                </div>

                <div className="space-y-1.5 rounded-md border border-border/40 bg-card/70 p-2.5">
                  <Label htmlFor="reminder-datetime" className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Thời gian nhắc
                  </Label>
                  <Input id="reminder-datetime" type="datetime-local" min={minRemindAt} {...register('remindAt')} />
                  {errors.remindAt && <p className="text-sm text-destructive">{errors.remindAt.message}</p>}
                </div>

                <div className="space-y-1.5 rounded-md border border-border/40 bg-card/70 p-2.5">
                  <Label htmlFor="reminder-repeat" className="inline-flex items-center gap-1.5">
                    <Repeat2 className="h-3.5 w-3.5" />
                    Lặp lại
                  </Label>
                  <select
                    id="reminder-repeat"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    {...register('repeatRule')}
                  >
                    <option value="none">Không lặp</option>
                    <option value="daily">Hàng ngày</option>
                    <option value="weekly">Hàng tuần</option>
                    <option value="monthly">Hàng tháng</option>
                  </select>
                </div>
              </>
            )}

            <div className="space-y-1.5 rounded-md border border-border/40 bg-card/70 p-2.5">
              <Label>Kênh thông báo</Label>
              <div className="grid grid-cols-1 gap-2">
                {CHANNEL_OPTIONS.map((option) => {
                  const active = currentChannels.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleChannel(option.value)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left transition-colors',
                        active
                          ? 'border-primary/40 bg-primary/10'
                          : 'border-border/60 bg-background hover:bg-muted/40'
                      )}
                    >
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{option.description}</p>
                    </button>
                  );
                })}
              </div>
              {errors.notifyChannels && <p className="text-sm text-destructive">{errors.notifyChannels.message}</p>}
            </div>

            {serverError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </div>
            )}
          </div>

          <DialogFooter className="px-4 py-3 border-t border-border/40 bg-card/30 flex-row justify-end gap-2 shrink-0">
            <Button type="button" variant="outline" className="rounded-md font-semibold" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              Hủy bỏ
            </Button>
            <Button type="submit" className="rounded-md bg-primary text-white hover:bg-primary/90 font-semibold px-6" disabled={isSubmitting}>
              {isSubmitting
                ? 'Đang lưu...'
                : mode === 'create'
                  ? 'Tạo nhắc nhở'
                  : isNotifyOnlyEdit
                    ? 'Lưu tùy chọn'
                    : 'Lưu thay đổi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

