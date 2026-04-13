import { create } from 'zustand';
import { reminderService } from '@/services/reminderService';
import type { Reminder } from '@/types/reminder';
import type { ReminderState } from '@/types/store';

const isUpcomingStatus = (status: Reminder['status']): boolean =>
  status === 'pending' || status === 'snoozed';

let reminderFetchSequence = 0;

export const useReminderStore = create<ReminderState>((set, get) => ({
  reminders: [],
  removedReminderIds: [],
  hasMore: false,
  nextCursor: null,
  isLoading: false,
  isLoadingMore: false,
  upcomingCount: 0,

  fetchUpcomingCount: async () => {
    try {
      const { upcomingCount } = await reminderService.getReminderSummary();
      set({ upcomingCount });
    } catch (error) {
      console.error('Lỗi khi tải reminder summary:', error);
    }
  },

  fetchReminders: async (params) => {
    const currentSequence = ++reminderFetchSequence;

    set({
      reminders: [],
      nextCursor: null,
      hasMore: false,
      isLoading: true,
    });

    try {
      const { reminders, hasMore, nextCursor } = await reminderService.getReminders(params);

      if (currentSequence !== reminderFetchSequence) {
        return;
      }

      set({
        reminders,
        hasMore,
        nextCursor,
      });
    } catch (error) {
      console.error('Lỗi khi tải reminders:', error);
      set({
        reminders: [],
        hasMore: false,
        nextCursor: null,
      });
    } finally {
      if (currentSequence === reminderFetchSequence) {
        set({ isLoading: false });
      }
    }
  },

  fetchMoreReminders: async (params) => {
    // Intentionally do not increment here: this request belongs to the current
    // fetchReminders sequence and should be dropped if a newer sequence starts.
    const currentSequence = reminderFetchSequence;
    const { isLoadingMore, hasMore, nextCursor, reminders } = get();

    if (isLoadingMore || !hasMore || !nextCursor) return;

    set({ isLoadingMore: true });

    try {
      const { reminders: nextPage, hasMore: more, nextCursor: cursor } = await reminderService.getReminders({
        ...params,
        cursor: nextCursor,
      });

      if (currentSequence !== reminderFetchSequence) {
        return;
      }

      const existingIds = new Set(reminders.map((item) => item._id));
      const uniqueItems = nextPage.filter((item) => !existingIds.has(item._id));
      const merged = [...reminders, ...uniqueItems];

      set({
        reminders: merged,
        hasMore: more,
        nextCursor: cursor,
      });
    } catch (error) {
      console.error('Lỗi khi tải thêm reminders:', error);
    } finally {
      set({ isLoadingMore: false });
    }
  },

  createReminderAsync: async (payload, options) => {
    const { reminder } = await reminderService.createReminder(payload);

    if (options?.syncStore !== false) {
      get().updateReminderInStore(reminder);
    }

    if (options?.refreshSummary !== false) {
      await get().fetchUpcomingCount();
    }

    return reminder;
  },

  createSharedReminderFromMessageAsync: async (payload, options) => {
    const { reminder } = await reminderService.createSharedReminderFromMessage(payload);

    if (options?.syncStore !== false) {
      get().updateReminderInStore(reminder);
    }

    if (options?.refreshSummary !== false) {
      await get().fetchUpcomingCount();
    }

    return reminder;
  },

  updateReminderAsync: async (id, payload, options) => {
    const { reminder } = await reminderService.updateReminder(id, payload);

    if (options?.syncStore !== false) {
      get().updateReminderInStore(reminder);
    }

    if (options?.refreshSummary !== false) {
      await get().fetchUpcomingCount();
    }

    return reminder;
  },

  snoozeReminderAsync: async (id, minutes, options) => {
    const { reminder } = await reminderService.snoozeReminder(id, minutes);

    if (options?.syncStore !== false) {
      get().updateReminderInStore(reminder);
    }

    if (options?.refreshSummary !== false) {
      await get().fetchUpcomingCount();
    }

    return reminder;
  },

  dismissReminderAsync: async (id, options) => {
    const { reminder } = await reminderService.dismissReminder(id);

    if (options?.syncStore !== false) {
      get().updateReminderInStore(reminder);
    }

    if (options?.refreshSummary !== false) {
      await get().fetchUpcomingCount();
    }

    return reminder;
  },

  updateSharedReminderParticipationAsync: async (sharedKey, participate, options) => {
    const { reminder } = await reminderService.updateSharedReminderParticipation(sharedKey, participate);

    if (options?.syncStore !== false) {
      get().updateReminderInStore(reminder);
    }

    if (options?.refreshSummary !== false) {
      await get().fetchUpcomingCount();
    }

    return reminder;
  },

  deleteReminderAsync: async (id, options) => {
    const response = await reminderService.deleteReminder(id);

    if (options?.syncStore !== false) {
      if (response.reminder) {
        get().updateReminderInStore(response.reminder);
      } else {
        get().removeReminder(id);
      }
    }

    if (options?.refreshSummary !== false) {
      await get().fetchUpcomingCount();
    }

    return response;
  },

  deleteRemindersByScopeAsync: async (scope, options) => {
    const response = await reminderService.deleteRemindersByScope(scope);

    if (options?.syncStore !== false) {
      get().removeRemindersByScope(scope);
    }

    if (options?.refreshSummary !== false) {
      await get().fetchUpcomingCount();
    }

    return response;
  },

  addReminder: (reminder) => {
    get().updateReminderInStore(reminder);
  },

  updateReminderInStore: (reminder) => {
    set((state) => {
      const previous = state.reminders.find((item) => item._id === reminder._id);
      const exists = Boolean(previous);
      const merged = exists
        ? state.reminders.map((item) => (item._id === reminder._id ? reminder : item))
        : [reminder, ...state.reminders];

      let nextUpcomingCount = state.upcomingCount;
      const wasUpcoming = previous ? isUpcomingStatus(previous.status) : false;
      const isUpcoming = isUpcomingStatus(reminder.status);

      if (exists) {
        if (wasUpcoming && !isUpcoming) nextUpcomingCount = Math.max(0, nextUpcomingCount - 1);
        if (!wasUpcoming && isUpcoming) nextUpcomingCount += 1;
      } else if (isUpcoming) {
        nextUpcomingCount += 1;
      }

      return {
        reminders: merged,
        removedReminderIds: state.removedReminderIds.filter((item) => item !== reminder._id),
        upcomingCount: nextUpcomingCount,
      };
    });
  },

  removeRemindersByScope: (scope) => {
    set((state) => {
      const shouldRemove = (item: Reminder): boolean => {
        if (item.scope !== 'personal') return false;
        if (scope === 'all') return true;
        if (scope === 'upcoming') return item.status === 'pending' || item.status === 'snoozed';
        return item.status === 'triggered' || item.status === 'dismissed';
      };

      const removedUpcomingCount = state.reminders.filter(
        (item) => shouldRemove(item) && isUpcomingStatus(item.status)
      ).length;
      const removedIds = state.reminders
        .filter((item) => shouldRemove(item))
        .map((item) => item._id);

      return {
        reminders: state.reminders.filter((item) => !shouldRemove(item)),
        removedReminderIds: Array.from(new Set([...state.removedReminderIds, ...removedIds])),
        upcomingCount: Math.max(0, state.upcomingCount - removedUpcomingCount),
      };
    });
  },

  removeRemindersBySharedKey: (sharedKey) => {
    const normalizedSharedKey = String(sharedKey || '').trim();
    if (!normalizedSharedKey) return;

    set((state) => {
      const removedUpcomingCount = state.reminders.filter(
        (item) => item.sharedKey === normalizedSharedKey && isUpcomingStatus(item.status)
      ).length;

      return {
        reminders: state.reminders.filter((item) => item.sharedKey !== normalizedSharedKey),
        upcomingCount: Math.max(0, state.upcomingCount - removedUpcomingCount),
      };
    });
  },

  removeReminder: (id) => {
    set((state) => {
      const removed = state.reminders.find((item) => item._id === id);
      const merged = state.reminders.filter((item) => item._id !== id);

      return {
        reminders: merged,
        removedReminderIds: state.removedReminderIds.includes(id)
          ? state.removedReminderIds
          : [...state.removedReminderIds, id],
        upcomingCount:
          removed && isUpcomingStatus(removed.status)
            ? Math.max(0, state.upcomingCount - 1)
            : state.upcomingCount,
      };
    });
  },
}));
