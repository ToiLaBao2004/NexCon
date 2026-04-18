import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlarmClock,
    CalendarRange,
    CalendarDays,
    Clock3,
    History,
    LayoutList,
    ListFilter,
    Plus,
    Search,
    SlidersHorizontal,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { removeAccents } from '@/lib/utils';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router';
import { useReminderStore } from '@/stores/useReminderStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { reminderService } from '@/services/reminderService';
import { extractMeetingCode, rememberMeetingTitle } from '@/utils/meetingLink';
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
    getReminderMeetingTitle,
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
        hasMore,
        isLoading,
        isLoadingMore,
        fetchReminders,
        fetchMoreReminders,
        fetchUpcomingCount,
        createReminderAsync,
        updateSharedReminderParticipationAsync,
        deleteReminderAsync,
        deleteRemindersByScopeAsync,
        updateReminderInStore,
    } = useReminderStore();

    const tabQuery = getReminderTabFromQuery(searchParams.get('tab'));
    const focusReminderId = searchParams.get('focus');
    const focusSharedKey = (searchParams.get('shared') || '').trim();
    const editQuery = (searchParams.get('edit') || '').trim().toLowerCase();
    const shouldOpenEditFromQuery = editQuery === '1' || editQuery === 'true' || editQuery === 'yes';
    const currentUserId = useAuthStore((state) => state.user?._id);
    const isMobile = useIsMobile();

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

    const loadMoreRef = useRef<HTMLDivElement | null>(null);
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
        };

        if (activeTab === 'upcoming') {
            return {
                status: 'pending,snoozed',
                ...sharedFilters,
                sort: 'remindAt_asc',
                limit: 10,
            };
        }

        if (activeTab === 'past') {
            return {
                status: 'triggered,dismissed',
                ...sharedFilters,
                sort: 'remindAt_asc',
                limit: 10,
            };
        }

        const status = selectedStatuses.length > 0
            ? selectedStatuses.join(',')
            : ALL_STATUSES.join(',');

        return {
            status,
            ...sharedFilters,
            sort: 'remindAt_desc',
            limit: 10,
        };
    }, [activeTab, selectedStatuses, fromDate, toDate, focusSharedKey]);

    useEffect(() => {
        void fetchReminders(currentQueryParams);
    }, [fetchReminders, currentQueryParams]);

    const shouldLoadMore = viewMode === 'list';

    useEffect(() => {
        if (!shouldLoadMore || !hasMore) return;
        const sentinel = loadMoreRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    void fetchMoreReminders(currentQueryParams);
                }
            },
            { threshold: 0.2 }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [shouldLoadMore, hasMore, fetchMoreReminders, currentQueryParams]);

    useEffect(() => {
        if (!focusReminderId || !highlightedReminderId) return;
        if (activeTab !== 'past' && activeTab !== 'all') return;

        const hasFocusedItem = reminders.some((item) => item._id === focusReminderId);
        if (!hasFocusedItem && hasMore && !isLoading && !isLoadingMore) {
            void fetchMoreReminders(currentQueryParams);
        }
    }, [
        activeTab,
        currentQueryParams,
        fetchMoreReminders,
        focusReminderId,
        hasMore,
        highlightedReminderId,
        isLoading,
        isLoadingMore,
        reminders,
    ]);

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
            const payload: CreateReminderPayload = {
                content: getReminderContent(reminder),
                remindAt: new Date(Date.now() + minutes * 60000).toISOString(),
                repeatRule: reminder.repeatRule,
                notifyChannels: reminder.notifyChannels,
                source: reminder.source,
            };

            await createReminderAsync(payload, {
                syncStore: false,
                refreshSummary: false,
            });
            await fetchReminders(currentQueryParams);
            void fetchUpcomingCount();
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

        const roomCode = extractMeetingCode(targetUrl);
        const meetingTitle = getReminderMeetingTitle(reminder);
        if (roomCode && meetingTitle) {
            rememberMeetingTitle(roomCode, meetingTitle);
        }

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
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                <AlarmClock className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-base">Chưa có nhắc nhở sắp tới</h3>
            <p className="text-sm text-muted-foreground mt-1">Tạo nhắc nhở để không bỏ lỡ việc quan trọng.</p>
        </div>
    );

    const pastEmpty = (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-md bg-muted/60 flex items-center justify-center mb-4">
                <History className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-base">Chưa có lịch sử nhắc nhở</h3>
            <p className="text-sm text-muted-foreground mt-1">Các nhắc nhở đã qua sẽ hiển thị tại đây.</p>
        </div>
    );

    const allEmpty = (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-md bg-muted/60 flex items-center justify-center mb-4">
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

    return (
        <div className="flex h-full flex-1 flex-col overflow-hidden rounded-none border border-border/60 bg-background md:rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-4 py-4 backdrop-blur-sm md:px-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
                        <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nhắc hẹn</h1>
                        <p className="text-xs text-muted-foreground">Quản lý các việc cần nhớ của bạn</p>
                    </div>
                </div>

                <Button
                    onClick={() => {
                        setEditingReminder(null);
                        setCreatePrefillData(undefined);
                        setShowCreateModal(true);
                    }}
                    size="icon"
                    variant="outline"
                    title="Tạo nhắc nhở mới"
                    className="h-10 w-10 rounded-lg border border-border bg-background text-foreground shadow-sm transition-all hover:bg-muted/60 hover:border-border/80"
                >
                    <Plus className="h-6 w-6 stroke-2 text-foreground" />
                </Button>
            </div>

            <div className="border-b border-border/60 bg-card/80 px-4 pb-3 pt-3 md:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center lg:gap-3">
                        <div className="inline-flex w-full items-center rounded-lg bg-muted p-1 sm:w-auto">
                            <button
                                type="button"
                                className={`h-8 rounded-md px-4 text-sm transition-colors ${activeTab === 'all' ? 'bg-background text-foreground shadow-sm font-normal' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}
                                onClick={() => setActiveTab('all')}
                            >
                                Tất cả
                            </button>
                            <button
                                type="button"
                                className={`h-8 rounded-md px-4 text-sm transition-colors ${activeTab === 'upcoming' ? 'bg-background text-foreground shadow-sm font-normal' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}
                                onClick={() => setActiveTab('upcoming')}
                            >
                                Sắp tới
                            </button>
                            <button
                                type="button"
                                className={`h-8 rounded-md px-4 text-sm transition-colors ${activeTab === 'past' ? 'bg-background text-foreground shadow-sm font-normal' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}
                                onClick={() => setActiveTab('past')}
                            >
                                Đã qua
                            </button>
                        </div>

                        <div className="inline-flex w-full items-center rounded-lg bg-muted p-1 sm:w-auto">
                            <button
                                type="button"
                                className={`flex h-8 items-center rounded-md px-4 text-sm transition-colors ${viewMode === 'list' ? 'bg-background text-foreground shadow-sm font-normal' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}
                                onClick={() => setViewMode('list')}
                            >
                                <LayoutList className={`mr-2 h-4 w-4 transition-colors ${viewMode === 'list' ? 'text-foreground' : 'text-muted-foreground'}`} />
                                Danh sách
                            </button>
                            <button
                                type="button"
                                className={`flex h-8 items-center rounded-md px-4 text-sm transition-colors ${viewMode === 'calendar' ? 'bg-background text-foreground shadow-sm font-normal' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}
                                onClick={() => setViewMode('calendar')}
                            >
                                <CalendarRange className={`mr-2 h-4 w-4 transition-colors ${viewMode === 'calendar' ? 'text-foreground' : 'text-muted-foreground'}`} />
                                Lịch biểu
                            </button>
                        </div>
                    </div>

                    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                        {isMobile && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-10 rounded-lg border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-border/80 hover:bg-muted/60"
                                onClick={() => setIsFilterSheetOpen(true)}
                            >
                                <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                                Bộ lọc
                            </Button>
                        )}
                    </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-card/70 p-3 md:flex-row md:flex-wrap md:items-center">
                    {isAllTabStatusUnselected && activeTab === 'all' && (
                        <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-700">
                            <span>Chưa chọn trạng thái nào, hệ thống đang hiển thị tất cả trạng thái.</span>
                            <button
                                type="button"
                                onClick={() => setSelectedStatuses(ALL_STATUSES)}
                                className="font-semibold underline underline-offset-2"
                            >
                                Khôi phục
                            </button>
                        </div>
                    )}

                    <div className="relative w-full md:w-auto">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchReminderName}
                            onChange={(event) => setSearchReminderName(event.target.value)}
                            placeholder="Tìm theo tên nhắc hẹn"
                            className="h-10 w-full rounded-lg border-border bg-background pl-9 text-sm placeholder:text-muted-foreground placeholder:italic transition-colors hover:border-border/80 focus-visible:ring-0 md:w-[240px]"
                        />
                    </div>

                    {!isMobile && (
                        <>
                            <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                                <span className="text-sm font-normal text-foreground">Từ</span>
                                <Input
                                    type="date"
                                    value={fromDate}
                                    onChange={(event) => setFromDate(event.target.value)}
                                    className="h-10 w-full rounded-lg border-border bg-background text-sm transition-colors hover:border-border/80 sm:w-[168px]"
                                />
                                <span className="text-sm font-normal text-foreground">đến</span>
                                <Input
                                    type="date"
                                    value={toDate}
                                    min={fromDate || undefined}
                                    onChange={(event) => setToDate(event.target.value)}
                                    className="h-10 w-full rounded-lg border-border bg-background text-sm transition-colors hover:border-border/80 sm:w-[168px]"
                                />
                            </div>

                            <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
                                <label className="inline-flex h-10 w-full cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-normal text-foreground transition-colors hover:border-border/80 sm:w-auto">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-input accent-primary"
                                        checked={includePersonalReminders}
                                        onChange={(event) => setIncludePersonalReminders(event.target.checked)}
                                    />
                                    Nhắc hẹn riêng
                                </label>
                                <label className="inline-flex h-10 w-full cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-normal text-foreground transition-colors hover:border-border/80 sm:w-auto">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-input accent-primary"
                                        checked={includeSharedReminders}
                                        onChange={(event) => setIncludeSharedReminders(event.target.checked)}
                                    />
                                    Nhắc hẹn chung
                                </label>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className={`flex-1 min-h-0 bg-muted/20 p-4 md:p-8 ${viewMode === 'calendar' ? 'overflow-hidden' : 'overflow-y-auto beautiful-scrollbar'}`}>
                {viewMode === 'list' && (
                    <div className="mb-3 flex justify-end">
                        <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 rounded-lg border-border bg-background text-foreground transition-colors hover:border-border/80 hover:bg-muted/60"
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
                        <div className="space-y-4 md:space-y-6">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
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

                        </div>
                    )
                ) : activeTab === 'past' ? (
                    filteredReminders.length === 0 ? (
                        pastEmpty
                    ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
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
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
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

                {viewMode === 'list' && reminders.length > 0 && (
                    <div ref={loadMoreRef} className="h-8 mt-2 flex items-center justify-center">
                        {isLoadingMore && <Clock3 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                )}
            </div>

            <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
                <SheetContent side="bottom" className="rounded-t-3xl p-0" showCloseButton={false}>
                    <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
                    <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-4">
                        <SheetTitle>Bộ lọc nhắc hẹn</SheetTitle>
                    </SheetHeader>

                    <div className="space-y-3 px-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Từ ngày</label>
                            <Input
                                type="date"
                                value={fromDate}
                                onChange={(event) => setFromDate(event.target.value)}
                                className="h-10 rounded-lg border-border bg-background"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Đến ngày</label>
                            <Input
                                type="date"
                                value={toDate}
                                min={fromDate || undefined}
                                onChange={(event) => setToDate(event.target.value)}
                                className="h-10 rounded-lg border-border bg-background"
                            />
                        </div>

                        <div className="space-y-2 rounded-xl border border-border/60 bg-card/70 p-3">
                            <label className="inline-flex h-10 w-full cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-normal text-foreground transition-colors hover:border-border/80">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-input accent-primary"
                                    checked={includePersonalReminders}
                                    onChange={(event) => setIncludePersonalReminders(event.target.checked)}
                                />
                                Nhắc hẹn riêng
                            </label>

                            <label className="inline-flex h-10 w-full cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-normal text-foreground transition-colors hover:border-border/80">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-input accent-primary"
                                    checked={includeSharedReminders}
                                    onChange={(event) => setIncludeSharedReminders(event.target.checked)}
                                />
                                Nhắc hẹn chung
                            </label>
                        </div>

                        <div className="flex justify-end pt-1">
                            <Button
                                type="button"
                                className="h-10 rounded-lg px-5"
                                onClick={() => setIsFilterSheetOpen(false)}
                            >
                                Xong
                            </Button>
                        </div>
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
