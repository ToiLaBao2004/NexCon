import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import {
    AlarmClock,
    CalendarRange,
    CalendarDays,
    History,
    LayoutList,
    ListFilter,
    Plus,
    Search,
    SlidersHorizontal,
    Trash2,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { removeAccents } from '@/lib/utils';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router';
import { useReminderStore } from '@/stores/useReminderStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { reminderService } from '@/services/reminderService';

import type {
    CreateReminderPayload,
    GetRemindersParams,
    Reminder,
    ReminderStatus,
} from '@/types/reminder';
import ReminderFormModal from '@/components/reminder/ReminderFormModal';
import ReminderCard from '@/components/reminder/ReminderCard';
import ReminderCalendarView from '@/components/reminder/ReminderCalendarView';
import {
    ALL_STATUSES,
    CALENDAR_BUCKET_MINUTES,
    CALENDAR_END_HOUR,
    CALENDAR_HALF_HOUR_OFFSET,
    CALENDAR_HOUR_ROW_HEIGHT,
    CALENDAR_STACK_EVENT_GAP,
    CALENDAR_STACK_EVENT_HEIGHT,
    CALENDAR_START_HOUR,
} from '@/pages/reminder/constants';
import {
    addDays,
    formatMonthYearLabel,
    formatDayLabel,
    getDefaultReuseRemindAt,
    getMonthGridCells,
    getReminderContent,
    getReminderMeetingUrl,
    getReminderTabFromQuery,
    getWeekStartMonday,
    normalizeForSort,
    parseDateKey,
    toDateKey,
    toMinutesInVnDay,
    formatClock,
    shiftMonth,
    startOfMonth,
} from '@/pages/reminder/utils';
import type { CalendarDay, CalendarDensity, CalendarEventLayout, ReminderCardOptions, ReminderTab, ReminderViewMode } from '@/pages/reminder/types';

const ReminderPage = () => {
    const [searchParams] = useSearchParams();
    const {
        reminders,
        isLoading,
        lastFetchParams,
        fetchReminders,
        fetchUpcomingCount,
        snoozeReminderAsync,
        updateSharedReminderParticipationAsync,
        deleteReminderAsync,
        deleteRemindersByScopeAsync,
        updateReminderInStore,
        fetchMoreReminders,
        isLoadingMore,
        hasMore,
    } = useReminderStore();

    const tabQuery = getReminderTabFromQuery(searchParams.get('tab'));
    const focusReminderId = searchParams.get('focus');
    const focusSharedKey = (searchParams.get('shared') || '').trim();
    const editQuery = (searchParams.get('edit') || '').trim().toLowerCase();
    const shouldOpenEditFromQuery = editQuery === '1' || editQuery === 'true' || editQuery === 'yes';
    const currentUserId = useAuthStore((state) => state.user?._id);

    const [activeTab, setActiveTab] = useState<ReminderTab>(() => tabQuery ?? 'all');
    const [viewMode, setViewMode] = useState<ReminderViewMode>('list');
    const [calendarDensity, setCalendarDensity] = useState<CalendarDensity>('workweek');
    const [calendarAnchorDayKey, setCalendarAnchorDayKey] = useState(() => toDateKey(new Date()));
    const [selectedCalendarDayKey, setSelectedCalendarDayKey] = useState(() => toDateKey(new Date()));
    const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
    const [monthPickerMonth, setMonthPickerMonth] = useState(() => startOfMonth(new Date()));
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createPrefillData, setCreatePrefillData] = useState<Partial<CreateReminderPayload> | undefined>(undefined);
    const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
    const [deleteReminderId, setDeleteReminderId] = useState<string | null>(null);
    const [reminderToConfirmDelete, setReminderToConfirmDelete] = useState<Reminder | null>(null);
    const [isDeletingReminder, setIsDeletingReminder] = useState(false);
    const [deleteScope, setDeleteScope] = useState<'upcoming' | 'past' | 'all' | null>(null);
    const [isDeletingScope, setIsDeletingScope] = useState(false);
    const [highlightedReminderId, setHighlightedReminderId] = useState<string | null>(null);
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

    const [selectedStatuses, setSelectedStatuses] = useState<ReminderStatus[]>(ALL_STATUSES);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [searchReminderName, setSearchReminderName] = useState('');
    const [includePersonalReminders, setIncludePersonalReminders] = useState(true);
    const [includeSharedReminders, setIncludeSharedReminders] = useState(true);

    const deepLinkRef = useRef('');
    const reminderCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const fetchedFocusReminderRef = useRef<string | null>(null);
    const openedEditFromQueryRef = useRef<string | null>(null);

    const handleEditReminder = useCallback((reminder: Reminder) => {
        setShowCreateModal(false);
        setCreatePrefillData(undefined);
        setEditingReminder(reminder);
    }, []);

    const handleOpenDeleteConfirm = useCallback((reminderOrId: Reminder | string) => {
        if (typeof reminderOrId === 'string') {
            const found = reminders.find(r => r._id === reminderOrId);
            if (found) {
                setReminderToConfirmDelete(found);
                setDeleteReminderId(reminderOrId);
            } else {
                setDeleteReminderId(reminderOrId);
            }
        } else {
            setReminderToConfirmDelete(reminderOrId);
            setDeleteReminderId(reminderOrId._id);
        }
    }, [reminders]);

    useEffect(() => {
        const deepLinkKey = `${tabQuery ?? ''}|${focusReminderId ?? ''}`;
        if (!deepLinkKey || deepLinkKey === '|') return;
        if (deepLinkRef.current === deepLinkKey) return;

        if (tabQuery) {
            setActiveTab(tabQuery);
        }
        if (focusReminderId) {
            setHighlightedReminderId(focusReminderId);
        }

        deepLinkRef.current = deepLinkKey;
    }, [tabQuery, focusReminderId]);

    const currentQueryParams = useMemo<GetRemindersParams>(() => {
        const sharedFilters = {
            from: fromDate || undefined,
            to: toDate || undefined,
            sharedKey: focusSharedKey || undefined,
            limit: 50,
        };

        if (activeTab === 'upcoming') {
            return {
                status: 'pending,snoozed',
                ...sharedFilters,
                sort: 'remindAt_asc',
            };
        }

        if (activeTab === 'past') {
            return {
                status: 'triggered,dismissed',
                ...sharedFilters,
                sort: 'remindAt_asc',
            };
        }

        const status = selectedStatuses.length > 0
            ? selectedStatuses.join(',')
            : ALL_STATUSES.join(',');

        return {
            status,
            ...sharedFilters,
            sort: 'remindAt_desc',
        };
    }, [activeTab, selectedStatuses, fromDate, toDate, focusSharedKey]);

    const queryKey = useMemo(() => JSON.stringify(currentQueryParams), [currentQueryParams]);
    const lastQueryKey = useMemo(() => JSON.stringify(lastFetchParams ?? null), [lastFetchParams]);

    useEffect(() => {
        if (isLoading) return;
        if (queryKey !== lastQueryKey) {
            void fetchReminders(currentQueryParams);
        }
    }, [fetchReminders, currentQueryParams, queryKey, lastQueryKey, isLoading]);

    useEffect(() => {
        if (!focusReminderId || !highlightedReminderId) return;

        const hasFocusedItem = reminders.some((item) => item._id === focusReminderId);
        if (hasFocusedItem) return;
        if (fetchedFocusReminderRef.current === focusReminderId) return;

        fetchedFocusReminderRef.current = focusReminderId;

        void (async () => {
            try {
                const { reminder } = await reminderService.getReminderById(focusReminderId);
                updateReminderInStore(reminder);
            } catch (error) {
                console.error('Load focused reminder failed:', error);
            }
        })();
    }, [focusReminderId, highlightedReminderId, reminders, updateReminderInStore]);

    useEffect(() => {
        if (!focusSharedKey) return;
        if (highlightedReminderId) return;

        const matched = reminders.find((item) => item.sharedKey === focusSharedKey);
        if (!matched) return;

        setHighlightedReminderId(matched._id);
    }, [focusSharedKey, highlightedReminderId, reminders]);

    useEffect(() => {
        if (!highlightedReminderId) return;

        const hasFocusedItem = reminders.some((item) => item._id === highlightedReminderId);
        if (!hasFocusedItem) return;

        const el = reminderCardRefs.current[highlightedReminderId];
        if (!el) return;

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const timeout = window.setTimeout(() => {
            setHighlightedReminderId((current) => (current === highlightedReminderId ? null : current));
        }, 2200);

        return () => window.clearTimeout(timeout);
    }, [highlightedReminderId, reminders]);

    const handleScroll = (e: UIEvent<HTMLDivElement>) => {
        if (viewMode === 'calendar' || isLoadingMore || !hasMore || isLoading) return;
        const t = e.currentTarget;
        const threshold = 100; // Trigger when within 100px of bottom
        if (t.scrollHeight - t.scrollTop - t.clientHeight < threshold) {
            void fetchMoreReminders(currentQueryParams);
        }
    };

    useEffect(() => {
        if (!shouldOpenEditFromQuery || !focusReminderId) return;

        const targetReminder = reminders.find((item) => item._id === focusReminderId);
        if (!targetReminder) return;

        if (openedEditFromQueryRef.current === focusReminderId) return;
        openedEditFromQueryRef.current = focusReminderId;
        handleEditReminder(targetReminder);
    }, [shouldOpenEditFromQuery, focusReminderId, reminders, handleEditReminder]);

    const normalizedReminders = useMemo(() => normalizeForSort(reminders), [reminders]);
    const normalizedSearchReminderName = useMemo(
        () => removeAccents(searchReminderName.trim().toLowerCase()),
        [searchReminderName]
    );

    const filteredReminders = useMemo(
        () => normalizedReminders.filter((item) => {
            const normalizedName = removeAccents(getReminderContent(item).toLowerCase());
            const matchedByName = !normalizedSearchReminderName || normalizedName.includes(normalizedSearchReminderName);

            if (!matchedByName) return false;
            if (item.scope === 'personal') return includePersonalReminders;
            if (item.scope === 'shared') {
                // Hide reminders the user has declined; they should reappear only after rejoin.
                if (item.participationStatus === 'declined') return false;
                return includeSharedReminders;
            }
            return true;
        }),
        [normalizedReminders, includePersonalReminders, includeSharedReminders, normalizedSearchReminderName]
    );

    const groupedUpcoming = useMemo(() => {
        const groups = new Map<string, Reminder[]>();

        for (const reminder of filteredReminders) {
            const key = toDateKey(new Date(reminder.remindAt));
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)?.push(reminder);
        }

        return Array.from(groups.entries()).map(([key, items]) => ({ key, label: formatDayLabel(key), items }));
    }, [filteredReminders]);

    const visiblePersonalReminderCount = useMemo(
        () => filteredReminders.filter((item) => item.scope === 'personal').length,
        [filteredReminders]
    );
    const activeAdvancedFilterCount = useMemo(() => {
        let count = 0;
        if (fromDate) count += 1;
        if (toDate) count += 1;
        if (!includePersonalReminders) count += 1;
        if (!includeSharedReminders) count += 1;
        return count;
    }, [fromDate, toDate, includePersonalReminders, includeSharedReminders]);
    const hasAdvancedFilters = activeAdvancedFilterCount > 0;

    const hasUpcomingData = groupedUpcoming.length > 0;
    const isAllTabStatusUnselected = activeTab === 'all' && selectedStatuses.length === 0;

    const reminderPendingDelete = reminderToConfirmDelete;

    const deleteModalContext = useMemo(() => {
        const reminder = reminderPendingDelete;
        if (!reminder) {
            return {
                title: 'Xóa nhắc nhở?',
                description: 'Nhắc nhở này sẽ bị xóa vĩnh viễn và không thể hoàn tác.',
                confirmText: 'Xóa',
            };
        }

        const isShared = reminder.scope === 'shared';
        const isCreator = Boolean(isShared && reminder.createdBy === currentUserId);

        if (!isShared) {
            return {
                title: 'Xóa nhắc nhở?',
                description: 'Nhắc nhở sẽ bị xóa vĩnh viễn.',
                confirmText: 'Xóa',
            };
        }

        if (isCreator) {
            return {
                title: 'Hủy cho tất cả thành viên và xóa nhắc hẹn này?',
                description: 'Nhắc hẹn chung sẽ bị hủy cho tất cả thành viên và bị xóa vĩnh viễn.',
                confirmText: 'Hủy cho tất cả và xóa',
            };
        }

        return {
            title: 'Không tham gia nhắc hẹn?',
            description: 'Bạn sẽ không tham gia nhắc hẹn này nữa.',
            confirmText: 'Không tham gia',
        };
    }, [currentUserId, reminderPendingDelete]);

    const calendarHourTicks = useMemo(
        () => Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR }, (_, index) => CALENDAR_START_HOUR + index),
        []
    );

    const calendarDays = useMemo<CalendarDay[]>(() => {
        const anchor = parseDateKey(calendarAnchorDayKey);
        const weekStart = getWeekStartMonday(anchor);
        const count = calendarDensity === 'workweek' ? 5 : 7;

        return Array.from({ length: count }, (_, index) => {
            const date = addDays(weekStart, index);
            return {
                date,
                key: toDateKey(date),
            };
        });
    }, [calendarAnchorDayKey, calendarDensity]);

    const calendarDayKeySet = useMemo(() => new Set(calendarDays.map((day) => day.key)), [calendarDays]);

    const calendarHeaderLabel = useMemo(() => {
        if (calendarDays.length === 0) return '';

        const firstDate = calendarDays[0].date;
        const lastDate = calendarDays[calendarDays.length - 1].date;
        const sameMonth = firstDate.getMonth() === lastDate.getMonth() && firstDate.getFullYear() === lastDate.getFullYear();

        if (sameMonth) return formatMonthYearLabel(firstDate);

        return `${formatMonthYearLabel(firstDate)} - ${formatMonthYearLabel(lastDate)}`;
    }, [calendarDays]);

    const calendarLayout = useMemo(() => {
        const startMinutes = CALENDAR_START_HOUR * 60;
        const endMinutes = CALENDAR_END_HOUR * 60;
        const startBucket = Math.floor(startMinutes / CALENDAR_BUCKET_MINUTES);
        const endBucket = Math.floor(endMinutes / CALENDAR_BUCKET_MINUTES);

        const remindersByDay = new Map<string, Reminder[]>();
        const maxBucketCount = new Map<number, number>();

        for (const day of calendarDays) {
            const dayItems = normalizedReminders
                .filter((item) => toDateKey(new Date(item.remindAt)) === day.key)
                .filter((item) => {
                    const minute = toMinutesInVnDay(item.remindAt);
                    return minute >= startMinutes && minute < endMinutes;
                })
                .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime());

            remindersByDay.set(day.key, dayItems);

            const localCounts = new Map<number, number>();
            for (const item of dayItems) {
                const bucket = Math.floor(toMinutesInVnDay(item.remindAt) / CALENDAR_BUCKET_MINUTES);
                localCounts.set(bucket, (localCounts.get(bucket) || 0) + 1);
            }

            for (const [bucket, count] of localCounts.entries()) {
                const previous = maxBucketCount.get(bucket) || 0;
                maxBucketCount.set(bucket, Math.max(previous, count));
            }
        }

        const offsetBeforeBucket = new Map<number, number>();
        let cumulativeExtra = 0;

        for (let bucket = startBucket; bucket < endBucket; bucket += 1) {
            offsetBeforeBucket.set(bucket, cumulativeExtra);

            const count = maxBucketCount.get(bucket) || 0;
            const requiredHeight = count > 0
                ? count * CALENDAR_STACK_EVENT_HEIGHT + (count - 1) * CALENDAR_STACK_EVENT_GAP
                : 0;
            const bucketHeight = Math.max(CALENDAR_HALF_HOUR_OFFSET, requiredHeight);
            cumulativeExtra += bucketHeight - CALENDAR_HALF_HOUR_OFFSET;
        }

        const getBucketOffset = (bucket: number): number => offsetBeforeBucket.get(bucket) || 0;

        const majorLineTops = calendarHourTicks.map((_, index) => {
            const bucket = startBucket + index * 2;
            return index * CALENDAR_HOUR_ROW_HEIGHT + getBucketOffset(bucket);
        });

        const minorLineTops = calendarHourTicks.map((_, index) => {
            const bucket = startBucket + index * 2 + 1;
            return index * CALENDAR_HOUR_ROW_HEIGHT + CALENDAR_HALF_HOUR_OFFSET + getBucketOffset(bucket);
        });

        const axisLabelTops = majorLineTops.map((top) => top - 8);

        const eventsByDay = new Map<string, CalendarEventLayout[]>();

        for (const day of calendarDays) {
            const dayItems = remindersByDay.get(day.key) || [];
            const bucketItems = new Map<number, Reminder[]>();

            for (const item of dayItems) {
                const bucket = Math.floor(toMinutesInVnDay(item.remindAt) / CALENDAR_BUCKET_MINUTES);
                if (!bucketItems.has(bucket)) bucketItems.set(bucket, []);
                bucketItems.get(bucket)?.push(item);
            }

            const layouts: CalendarEventLayout[] = [];

            for (const [bucket, items] of Array.from(bucketItems.entries()).sort((a, b) => a[0] - b[0])) {
                const bucketStartMinute = bucket * CALENDAR_BUCKET_MINUTES;
                const baseTop = ((bucketStartMinute - startMinutes) / 60) * CALENDAR_HOUR_ROW_HEIGHT;
                const offset = getBucketOffset(bucket);

                items.forEach((item, stackIndex) => {
                    const topPx = baseTop + offset + stackIndex * (CALENDAR_STACK_EVENT_HEIGHT + CALENDAR_STACK_EVENT_GAP);
                    const preview = getReminderContent(item).replace(/\s+/g, ' ').trim();

                    layouts.push({
                        reminder: item,
                        topPx,
                        heightPx: CALENDAR_STACK_EVENT_HEIGHT,
                        laneIndex: 0,
                        laneCount: 1,
                        timeLabel: formatClock(item.remindAt),
                        preview: preview.length > 56 ? `${preview.slice(0, 56)}...` : preview,
                    });
                });
            }

            layouts.sort((a, b) => a.topPx - b.topPx);
            eventsByDay.set(day.key, layouts);
        }

        const gridHeight = calendarHourTicks.length * CALENDAR_HOUR_ROW_HEIGHT + cumulativeExtra;

        return {
            gridHeight,
            axisLabelTops,
            majorLineTops,
            minorLineTops,
            eventsByDay,
        };
    }, [calendarDays, calendarHourTicks, filteredReminders]);

    const calendarGridHeight = calendarLayout.gridHeight;
    const calendarEventsByDay = calendarLayout.eventsByDay;

    useEffect(() => {
        if (calendarDays.length === 0) return;
        if (calendarDayKeySet.has(selectedCalendarDayKey)) return;
        setSelectedCalendarDayKey(calendarDays[0].key);
    }, [calendarDayKeySet, calendarDays, selectedCalendarDayKey]);

    useEffect(() => {
        if (!focusReminderId || !highlightedReminderId) return;
        if (highlightedReminderId !== focusReminderId) return;

        const focusedReminder = reminders.find((item) => item._id === highlightedReminderId);
        if (!focusedReminder) return;

        const focusedDayKey = toDateKey(new Date(focusedReminder.remindAt));
        setSelectedCalendarDayKey(focusedDayKey);
        if (!calendarDayKeySet.has(focusedDayKey)) {
            setCalendarAnchorDayKey(focusedDayKey);
        }
    }, [calendarDayKeySet, focusReminderId, highlightedReminderId, reminders]);

    useEffect(() => {
        const anchorDate = parseDateKey(calendarAnchorDayKey);
        setMonthPickerMonth(startOfMonth(anchorDate));
    }, [calendarAnchorDayKey]);

    const handleDeleteReminder = async () => {
        if (!deleteReminderId) return;

        setIsDeletingReminder(true);
        try {
            const result = await deleteReminderAsync(deleteReminderId, {
                syncStore: true, // Sync store immediately to remove from UI
                refreshSummary: false,
            });
            setDeleteReminderId(null);
            setReminderToConfirmDelete(null);

            void fetchUpcomingCount();
            toast.success(result.message || 'Đã xóa nhắc nhở');
        } catch (error) {
            console.error('Delete reminder failed:', error);
            toast.error('Không thể xóa nhắc nhở');
        } finally {
            setIsDeletingReminder(false);
        }
    };

    const handleRepeatReminder = async (reminder: Reminder, minutes: number) => {
        try {
            await snoozeReminderAsync(reminder._id, minutes as 5 | 10 | 30 | 60, {
                syncStore: true,
                refreshSummary: true,
            });
            toast.success(`Đã hẹn nhắc lại sau ${minutes} phút`);
        } catch (error) {
            console.error('Repeat reminder failed:', error);
            toast.error('Không thể nhắc lại lúc này');
        }
    };

    const handleRejoinSharedReminder = async (reminder: Reminder) => {
        const sharedKey = String(reminder.sharedKey || '').trim();
        if (!sharedKey) {
            toast.error('Không thể tham gia lại nhắc hẹn này');
            return;
        }

        try {
            await updateSharedReminderParticipationAsync(sharedKey, true, {
                syncStore: false,
                refreshSummary: false,
            });
            await fetchReminders(currentQueryParams);
            void fetchUpcomingCount();
            toast.success('Đã tham gia lại nhắc hẹn chung');
        } catch (error) {
            console.error('Rejoin shared reminder failed:', error);
            toast.error('Không thể tham gia lại nhắc hẹn lúc này');
        }
    };

    const handleDeleteByScope = async () => {
        if (!deleteScope) return;

        setIsDeletingScope(true);
        try {
            const result = await deleteRemindersByScopeAsync(deleteScope, {
                syncStore: false,
                refreshSummary: false,
            });
            await fetchReminders(currentQueryParams);
            void fetchUpcomingCount();
            toast.success(`Đã xóa ${result.deletedCount} nhắc hẹn cá nhân`);
            setDeleteScope(null);
        } catch (error) {
            console.error('Bulk delete reminders failed:', error);
            toast.error('Không thể xóa nhắc hẹn lúc này');
        } finally {
            setIsDeletingScope(false);
        }
    };


    const handleReuseReminder = (reminder: Reminder) => {
        setEditingReminder(null);
        setCreatePrefillData({
            content: getReminderContent(reminder),
            remindAt: getDefaultReuseRemindAt(),
            repeatRule: reminder.repeatRule,
            notifyChannels: reminder.notifyChannels,
            source: { type: 'manual' },
        });
        setShowCreateModal(true);
    };

    const handleReminderPrimaryAction = useCallback((reminder: Reminder) => {
        if (reminder.scope === 'shared' && reminder.participationStatus === 'declined') {
            void handleRejoinSharedReminder(reminder);
            return;
        }

        handleEditReminder(reminder);
    }, [handleEditReminder, handleRejoinSharedReminder]);

    const isReminderEditable = (reminder: Reminder): boolean =>
        reminder.status === 'pending' || reminder.status === 'snoozed';

    const getReminderCardOptions = useCallback((reminder: Reminder): ReminderCardOptions => {
        const isShared = reminder.scope === 'shared';
        const isSharedCreator = isShared && reminder.createdBy === currentUserId;
        const isSharedDeclined = reminder.participationStatus === 'declined';
        const shouldShowSharedCancel = !isSharedDeclined;
        const isPastLikeStatus = reminder.status === 'triggered' || reminder.status === 'dismissed';
        const canEditSharedForOwner = isReminderEditable(reminder) && !isSharedDeclined;
        const canEditSharedAsCreator = Boolean(isSharedCreator) && canEditSharedForOwner;
        const canEditSharedNotifyOnly = !isSharedCreator && canEditSharedForOwner;

        if (isShared) {
            if (activeTab === 'upcoming') {
                return {
                    editable: canEditSharedAsCreator || canEditSharedNotifyOnly,
                    showEdit: canEditSharedAsCreator || canEditSharedNotifyOnly,
                    editLabel: canEditSharedNotifyOnly ? 'Tùy chỉnh thông báo' : 'Chỉnh sửa',
                    showCancel: shouldShowSharedCancel,
                    cancelVariant: isSharedCreator ? 'cancel' : 'decline',
                    cancelLabel: isSharedCreator ? 'Hủy cho tất cả' : 'Không tham gia',
                    highlighted: highlightedReminderId === reminder._id,
                };
            }

            if (activeTab === 'past') {
                return {
                    faded: false,
                    editable: false,
                    showCancel: Boolean(isSharedCreator) && shouldShowSharedCancel,
                    cancelVariant: 'cancel',
                    cancelLabel: 'Hủy cho tất cả',
                    showReuse: true,
                    showRepeat: true,
                    highlighted: highlightedReminderId === reminder._id,
                };
            }

            if (isPastLikeStatus) {
                return {
                    faded: false,
                    editable: false,
                    showEdit: isSharedDeclined,
                    editLabel: 'Tham gia lại',
                    showCancel: Boolean(isSharedCreator) && shouldShowSharedCancel,
                    cancelVariant: 'cancel',
                    cancelLabel: 'Hủy cho tất cả',
                    showRepeat: !isSharedDeclined,
                    showReuse: !isSharedDeclined,
                    highlighted: highlightedReminderId === reminder._id,
                };
            }

            return {
                faded: false,
                editable: isSharedDeclined ? false : canEditSharedAsCreator || canEditSharedNotifyOnly,
                showEdit: isSharedDeclined ? true : canEditSharedAsCreator || canEditSharedNotifyOnly,
                editLabel: isSharedDeclined
                    ? 'Tham gia lại'
                    : (canEditSharedNotifyOnly ? 'Tùy chỉnh thông báo' : 'Chỉnh sửa'),
                showCancel: isSharedDeclined ? false : shouldShowSharedCancel,
                cancelVariant: isSharedCreator ? 'cancel' : 'decline',
                cancelLabel: isSharedCreator ? 'Hủy cho tất cả' : 'Không tham gia',
                showRepeat: isSharedDeclined ? false : reminder.status === 'triggered',
                showReuse: isSharedDeclined ? false : reminder.status === 'triggered',
                highlighted: highlightedReminderId === reminder._id,
            };
        }

        if (activeTab === 'upcoming') {
            return {
                editable: isReminderEditable(reminder),
                showEdit: true,
                showCancel: true,
                cancelVariant: 'cancel',
                highlighted: highlightedReminderId === reminder._id,
            };
        }

        if (activeTab === 'past') {
            return {
                faded: false,
                editable: false,
                showReuse: true,
                showRepeat: true,
                highlighted: highlightedReminderId === reminder._id,
            };
        }

        return {
            faded: false,
            editable: isReminderEditable(reminder),
            showEdit: isReminderEditable(reminder),
            showCancel: isReminderEditable(reminder),
            cancelVariant: 'cancel',
            showRepeat: reminder.status === 'triggered',
            showReuse: reminder.status === 'triggered',
            highlighted: highlightedReminderId === reminder._id,
        };
    }, [activeTab, currentUserId, highlightedReminderId]);

    const shiftCalendarWeek = useCallback((direction: -1 | 1) => {
        setCalendarAnchorDayKey((current) => {
            const shifted = addDays(parseDateKey(current), direction * 7);
            return toDateKey(shifted);
        });
        setHighlightedReminderId(null);
    }, []);

    const jumpCalendarToToday = useCallback(() => {
        const todayKey = toDateKey(new Date());
        setCalendarAnchorDayKey(todayKey);
        setSelectedCalendarDayKey(todayKey);
        setHighlightedReminderId(null);
        setIsMonthPickerOpen(false);
    }, []);

    const jumpCalendarToDate = useCallback((date: Date) => {
        const anchorMonday = getWeekStartMonday(date);
        const dateKey = toDateKey(date);

        setCalendarAnchorDayKey(toDateKey(anchorMonday));
        setSelectedCalendarDayKey(dateKey);
        setHighlightedReminderId(null);
        setIsMonthPickerOpen(false);
    }, []);

    const openReminderMeetingLink = useCallback((reminder: Reminder) => {
        const targetUrl = getReminderMeetingUrl(reminder);
        if (!targetUrl) return;

        window.location.assign(targetUrl);
    }, []);

    const handleCalendarReminderClick = (entry: CalendarEventLayout, dayKey: string) => {
        const reminder = entry.reminder;
        setSelectedCalendarDayKey(dayKey);
        setHighlightedReminderId(reminder._id);

        if (isReminderEditable(reminder)) {
            handleEditReminder(reminder);
        }
    };

    const bindReminderCardRef = useCallback((reminderId: string, node: HTMLDivElement | null) => {
        reminderCardRefs.current[reminderId] = node;
    }, []);

    const upcomingEmpty = (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/70 px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10">
                <AlarmClock className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-base">Chưa có nhắc nhở sắp tới</h3>
            <p className="text-sm text-muted-foreground mt-1">Tạo nhắc nhở để không bỏ lỡ việc quan trọng.</p>
        </div>
    );

    const pastEmpty = (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/70 px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-muted/60">
                <History className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-base">Chưa có lịch sử nhắc nhở</h3>
            <p className="text-sm text-muted-foreground mt-1">Các nhắc nhở đã qua sẽ hiển thị tại đây.</p>
        </div>
    );

    const allEmpty = (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/70 px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-muted/60">
                <ListFilter className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-base">Không có nhắc nhở phù hợp</h3>
            <p className="text-sm text-muted-foreground mt-1">Thử thay đổi bộ lọc để xem thêm kết quả.</p>
        </div>
    );

    const todayKey = toDateKey(new Date());

    const selectedCalendarWeekStartKey = useMemo(
        () => toDateKey(getWeekStartMonday(parseDateKey(calendarAnchorDayKey))),
        [calendarAnchorDayKey]
    );

    const monthPickerRows = useMemo(() => {
        const cells = getMonthGridCells(monthPickerMonth);
        return Array.from({ length: 6 }, (_, rowIndex) => {
            const rowCells = cells.slice(rowIndex * 7, rowIndex * 7 + 7);
            const weekStartKey = toDateKey(getWeekStartMonday(rowCells[0].date));
            return {
                cells: rowCells,
                weekStartKey,
            };
        });
    }, [monthPickerMonth]);

    const monthPickerTitle = useMemo(() => formatMonthYearLabel(monthPickerMonth), [monthPickerMonth]);

    const resetAdvancedFilters = () => {
        setFromDate('');
        setToDate('');
        setIncludePersonalReminders(true);
        setIncludeSharedReminders(true);
    };

    const filterPanel = (onDone?: () => void) => (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Từ ngày</span>
                    <Input
                        type="date"
                        value={fromDate}
                        onChange={(event) => setFromDate(event.target.value)}
                        className="h-10 rounded-lg border-border/70 bg-background"
                    />
                </label>

                <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Đến ngày</span>
                    <Input
                        type="date"
                        value={toDate}
                        min={fromDate || undefined}
                        onChange={(event) => setToDate(event.target.value)}
                        className="h-10 rounded-lg border-border/70 bg-background"
                    />
                </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <label className="inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-lg border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={includePersonalReminders}
                        onChange={(event) => setIncludePersonalReminders(event.target.checked)}
                    />
                    Nhắc hẹn riêng
                </label>
                <label className="inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-lg border border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={includeSharedReminders}
                        onChange={(event) => setIncludeSharedReminders(event.target.checked)}
                    />
                    Nhắc hẹn chung
                </label>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 text-muted-foreground hover:text-foreground"
                    disabled={!hasAdvancedFilters}
                    onClick={resetAdvancedFilters}
                >
                    Xóa lọc
                </Button>
                {onDone && (
                    <Button type="button" size="sm" className="h-9 px-4" onClick={onDone}>
                        Xong
                    </Button>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex h-full flex-1 flex-col overflow-hidden rounded-none border-0 bg-background md:rounded-l-none md:rounded-r-2xl md:border-y md:border-r md:border-l-0 md:border-border/50">
            <div className="border-b border-border/50 bg-card/95 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
                            <CalendarDays className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                                <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">Nhắc hẹn</h1>
                            </div>
                            <p className="hidden text-sm text-muted-foreground md:block">
                                Quản lý các việc cần nhớ của bạn
                            </p>
                        </div>
                    </div>

                    <Button
                        onClick={() => {
                            setEditingReminder(null);
                            setCreatePrefillData(undefined);
                            setShowCreateModal(true);
                        }}
                        size="sm"
                        title="Tạo nhắc hẹn mới"
                        className="h-9 shrink-0 rounded-lg px-3 text-sm font-semibold shadow-sm"
                    >
                        <Plus className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Tạo nhắc hẹn</span>
                    </Button>
                </div>

                {isAllTabStatusUnselected && activeTab === 'all' && (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-700">
                        <span>Chưa chọn trạng thái nào, hệ thống đang hiển thị tất cả trạng thái.</span>
                        <button
                            type="button"
                            onClick={() => setSelectedStatuses(ALL_STATUSES)}
                            className="shrink-0 font-semibold underline underline-offset-2"
                        >
                            Khôi phục
                        </button>
                    </div>
                )}

                <div className="mt-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div className="inline-flex max-w-full items-center rounded-lg border border-border/60 bg-muted/40 p-1">
                            <button
                                type="button"
                                className={`h-8 rounded-md px-3 text-sm transition-colors sm:px-4 ${activeTab === 'all' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                                onClick={() => setActiveTab('all')}
                            >
                                Tất cả
                            </button>
                            <button
                                type="button"
                                className={`h-8 rounded-md px-3 text-sm transition-colors sm:px-4 ${activeTab === 'upcoming' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                                onClick={() => setActiveTab('upcoming')}
                            >
                                Sắp tới
                            </button>
                            <button
                                type="button"
                                className={`h-8 rounded-md px-3 text-sm transition-colors sm:px-4 ${activeTab === 'past' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                                onClick={() => setActiveTab('past')}
                            >
                                Đã qua
                            </button>
                        </div>

                        <div className="inline-flex max-w-full items-center rounded-lg border border-border/60 bg-muted/40 p-1">
                            <button
                                type="button"
                                className={`flex h-8 items-center rounded-md px-3 text-sm transition-colors sm:px-4 ${viewMode === 'list' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                                onClick={() => setViewMode('list')}
                            >
                                <LayoutList className={`h-4 w-4 transition-colors sm:mr-2 ${viewMode === 'list' ? 'text-foreground' : 'text-muted-foreground'}`} />
                                <span className="hidden sm:inline">Danh sách</span>
                            </button>
                            <button
                                type="button"
                                className={`flex h-8 items-center rounded-md px-3 text-sm transition-colors sm:px-4 ${viewMode === 'calendar' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                                onClick={() => setViewMode('calendar')}
                            >
                                <CalendarRange className={`h-4 w-4 transition-colors sm:mr-2 ${viewMode === 'calendar' ? 'text-foreground' : 'text-muted-foreground'}`} />
                                <span className="hidden sm:inline">Lịch biểu</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex min-w-0 items-center gap-2 xl:w-[560px]">
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={searchReminderName}
                                onChange={(event) => setSearchReminderName(event.target.value)}
                                placeholder="Tìm nhắc hẹn"
                                className="h-9 w-full rounded-lg border-border/70 bg-background pl-9 text-sm placeholder:text-muted-foreground transition-colors hover:border-border focus-visible:ring-1 focus-visible:ring-primary/25"
                            />
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            className="h-9 shrink-0 rounded-lg border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 md:hidden"
                            onClick={() => setIsFilterSheetOpen(true)}
                        >
                            <SlidersHorizontal className="h-4 w-4 sm:mr-1.5" />
                            <span className="hidden sm:inline">Bộ lọc</span>
                            {hasAdvancedFilters && (
                                <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                                    {activeAdvancedFilterCount}
                                </span>
                            )}
                        </Button>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="hidden h-9 shrink-0 rounded-lg border-border/70 bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 md:inline-flex"
                                >
                                    <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                                    Bộ lọc
                                    {hasAdvancedFilters && (
                                        <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                                            {activeAdvancedFilterCount}
                                        </span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-[420px] rounded-xl border-border/70 p-4 shadow-xl">
                                <div className="mb-3">
                                    <h2 className="text-sm font-semibold text-foreground">Bộ lọc nâng cao</h2>
                                    <p className="mt-0.5 text-xs text-muted-foreground">Lọc theo thời gian và phạm vi nhắc hẹn.</p>
                                </div>
                                {filterPanel()}
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>

            {viewMode === 'list' && (
                <div className="shrink-0 bg-muted/20 px-4 pt-4 md:px-6 md:pt-6">
                    <div className="flex justify-end">
                        <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 rounded-lg border-border/70 bg-background text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                            disabled={isLoading || !includePersonalReminders || visiblePersonalReminderCount === 0}
                            onClick={() => setDeleteScope(activeTab)}
                            title="XÃ³a táº¥t cáº£"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            <div
                className={
                    viewMode === 'calendar'
                        ? 'flex-1 min-h-0 overflow-hidden bg-background'
                        : 'flex-1 min-h-0 overflow-y-auto beautiful-scrollbar bg-muted/20 p-4 md:p-6'
                }
                onScroll={handleScroll}
            >
                {false && viewMode === 'list' && (
                    <div className="mb-4 flex justify-end">
                        <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 rounded-lg border-border/70 bg-background text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                            disabled={isLoading || !includePersonalReminders || visiblePersonalReminderCount === 0}
                            onClick={() => setDeleteScope(activeTab)}
                            title="Xóa tất cả"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center py-14">
                        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : viewMode === 'calendar' ? (
                    filteredReminders.length === 0 ? (
                        activeTab === 'upcoming' ? upcomingEmpty : activeTab === 'past' ? pastEmpty : allEmpty
                    ) : (
                        <ReminderCalendarView
                            calendarDensity={calendarDensity}
                            onCalendarDensityChange={setCalendarDensity}
                            onJumpCalendarToToday={jumpCalendarToToday}
                            onShiftCalendarWeek={shiftCalendarWeek}
                            calendarHeaderLabel={calendarHeaderLabel}
                            isMonthPickerOpen={isMonthPickerOpen}
                            onMonthPickerOpenChange={setIsMonthPickerOpen}
                            monthPickerTitle={monthPickerTitle}
                            monthPickerRows={monthPickerRows}
                            selectedCalendarWeekStartKey={selectedCalendarWeekStartKey}
                            selectedCalendarDayKey={selectedCalendarDayKey}
                            todayKey={todayKey}
                            onJumpCalendarToDate={jumpCalendarToDate}
                            onMonthPrev={() => setMonthPickerMonth((current) => shiftMonth(current, -1))}
                            onMonthNext={() => setMonthPickerMonth((current) => shiftMonth(current, 1))}
                            calendarGridHeight={calendarGridHeight}
                            calendarDays={calendarDays}
                            calendarHourTicks={calendarHourTicks}
                            axisLabelTops={calendarLayout.axisLabelTops}
                            majorLineTops={calendarLayout.majorLineTops}
                            minorLineTops={calendarLayout.minorLineTops}
                            calendarEventsByDay={calendarEventsByDay}
                            onSelectCalendarDay={setSelectedCalendarDayKey}
                            onCalendarEventClick={handleCalendarReminderClick}
                            onDeleteReminder={handleOpenDeleteConfirm}
                            onOpenReminderMeetingLink={openReminderMeetingLink}
                        />
                    )
                ) : activeTab === 'upcoming' ? (
                    !hasUpcomingData ? (
                        upcomingEmpty
                    ) : (
                        <div className="space-y-6 md:space-y-8">
                            {groupedUpcoming.map((group) => (
                                <div key={group.key} className="space-y-3">
                                    <h3 className="px-1 text-sm font-bold text-muted-foreground/80 flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                                        {group.label}
                                    </h3>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {group.items.map((item) => (
                                            <ReminderCard
                                                key={item._id}
                                                reminder={item}
                                                activeTab={activeTab}
                                                options={getReminderCardOptions(item)}
                                                onEdit={handleReminderPrimaryAction}
                                                onDelete={handleOpenDeleteConfirm}
                                                onReuse={handleReuseReminder}
                                                onRepeat={(reminder, minutes) => {
                                                    void handleRepeatReminder(reminder, minutes);
                                                }}
                                                onBindRef={bindReminderCardRef}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : activeTab === 'past' ? (
                    filteredReminders.length === 0 ? (
                        pastEmpty
                    ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {filteredReminders.map((item) => (
                                <ReminderCard
                                    key={item._id}
                                    reminder={item}
                                    activeTab={activeTab}
                                    options={getReminderCardOptions(item)}
                                    onEdit={handleReminderPrimaryAction}
                                    onDelete={handleOpenDeleteConfirm}
                                    onReuse={handleReuseReminder}
                                    onRepeat={(reminder, minutes) => {
                                        void handleRepeatReminder(reminder, minutes);
                                    }}
                                    onBindRef={bindReminderCardRef}
                                />
                            ))}
                        </div>
                    )
                ) : filteredReminders.length === 0 ? (
                    allEmpty
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {filteredReminders.map((item) => (
                            <ReminderCard
                                key={item._id}
                                reminder={item}
                                activeTab={activeTab}
                                options={getReminderCardOptions(item)}
                                onEdit={handleReminderPrimaryAction}
                                onDelete={handleOpenDeleteConfirm}
                                onReuse={handleReuseReminder}
                                onRepeat={(reminder, minutes) => {
                                    void handleRepeatReminder(reminder, minutes);
                                }}
                                onBindRef={bindReminderCardRef}
                            />
                        ))}
                    </div>
                )}
                
                {isLoadingMore && (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}
            </div>

            <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
                <SheetContent side="bottom" className="rounded-t-3xl p-0" showCloseButton={false}>
                    <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
                    <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-4">
                        <SheetTitle>Bộ lọc nâng cao</SheetTitle>
                    </SheetHeader>

                    <div className="px-4 py-4">
                        {filterPanel(() => setIsFilterSheetOpen(false))}
                    </div>
                </SheetContent>
            </Sheet>

            <ReminderFormModal
                open={showCreateModal || Boolean(editingReminder)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setShowCreateModal(false);
                        setCreatePrefillData(undefined);
                        setEditingReminder(null);
                    }
                }}
                mode={editingReminder ? 'edit' : 'create'}
                editScope={
                    editingReminder
                        && editingReminder.scope === 'shared'
                        && editingReminder.createdBy !== currentUserId
                        ? 'notifyOnly'
                        : 'full'
                }
                reminder={editingReminder ?? undefined}
                prefillData={editingReminder ? undefined : createPrefillData}
                syncStore={false}
                onSuccess={() => {
                    void fetchReminders(currentQueryParams);
                    void fetchUpcomingCount();
                }}
            />

            <ConfirmationModal
                isOpen={Boolean(deleteReminderId)}
                onClose={() => {
                    if (isDeletingReminder) return;
                    setDeleteReminderId(null);
                    setReminderToConfirmDelete(null);
                }}
                onConfirm={() => {
                    void handleDeleteReminder();
                }}
                title={deleteModalContext.title}
                description={deleteModalContext.description}
                confirmText={deleteModalContext.confirmText}
                variant="destructive"
                isLoading={isDeletingReminder}
            />

            <ConfirmationModal
                isOpen={Boolean(deleteScope)}
                onClose={() => {
                    if (isDeletingScope) return;
                    setDeleteScope(null);
                }}
                onConfirm={() => {
                    void handleDeleteByScope();
                }}
                title="Xóa tất cả nhắc hẹn?"
                description={
                    deleteScope === 'upcoming'
                        ? 'Toàn bộ nhắc hẹn cá nhân trong tab Sắp tới sẽ bị xóa.'
                        : deleteScope === 'past'
                            ? 'Toàn bộ nhắc hẹn cá nhân trong tab Đã qua sẽ bị xóa.'
                            : 'Toàn bộ nhắc hẹn cá nhân sẽ bị xóa.'
                }
                confirmText="Xóa tất cả"
                variant="destructive"
                isLoading={isDeletingScope}
            />
        </div>
    );
};

export default ReminderPage;
