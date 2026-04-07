import { createElement } from 'react';
import { toast } from 'sonner';
import { ReminderToastCard } from '@/components/reminder/ReminderToast';
import type { Reminder } from '@/types/reminder';

export function showReminderToast(reminder: Reminder): void {
  const toastKey = `reminder-toast-${reminder._id}`;

  toast.custom(
    (toastId) =>
      createElement(ReminderToastCard, {
        reminder,
        toastId,
      }),
    {
      id: toastKey,
      duration: Number.POSITIVE_INFINITY,
      position: 'bottom-right',
    }
  );
}
