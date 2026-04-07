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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router';
import { useReminderStore } from '@/stores/useReminderStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { reminderService } from '@/services/reminderService';
import { extractMeetingCode, rememberMeetingTitle } from '@/utils/meetingLink';
import type {
    CreateReminderPayload,
    GetRemindersParams,
    Reminder,
    ReminderSourceType,
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
    SOURCE_OPTIONS,
    STATUS_OPTIONS,
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
    const [isDeletingReminder, setIsDeletingReminder] = useState(false);
    const [deleteScope, setDeleteScope] = useState<'upcoming' | 'past' | 'all' | null>(null);
    const [isDeletingScope, setIsDeletingScope] = useState(false);
    const [highlightedReminderId, setHighlightedReminderId] = useState<string | null>(null);

    const [selectedStatuses, setSelectedStatuses] = useState<ReminderStatus[]>(ALL_STATUSES);
    const [sourceType, setSourceType] = useState<ReminderSourceType | ''>('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [declinedSharedUpcomingReminders, setDeclinedSharedUpcomingReminders] = useState<Reminder[]>([]);

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
            sourceType: sourceType || undefined,
            from: fromDate || undefined,
            to: toDate || undefined,
            sharedKey: focusSharedKey || undefined,
        };

        if (activeTab === 'upcoming') {
            return {
                status: 'pending,snoozed',
                ...sharedFilters,
                sort: 'remindAt_asc',
                limit: 50,
            };
        }

        if (activeTab === 'past') {
            return {
                status: 'triggered,dismissed',
                ...sharedFilters,
                sort: 'remindAt_asc',
                limit: 50,
            };
        }

        const status = selectedStatuses.length > 0
            ? selectedStatuses.join(',')
            : ALL_STATUSES.join(',');

        return {
            status,
            ...sharedFilters,
            sort: 'remindAt_desc',
            limit: 100,
        };
    }, [activeTab, selectedStatuses, sourceType, fromDate, toDate, focusSharedKey]);

    useEffect(() => {
        void fetchReminders(currentQueryParams);
    }, [fetchReminders, currentQueryParams]);

    useEffect(() => {
        if (activeTab !== 'upcoming') {
            setDeclinedSharedUpcomingReminders([]);
            return;
        }

        let cancelled = false;

        void (async () => {
            try {
                const { reminders: dismissedReminders } = await reminderService.getReminders({
                    status: 'dismissed',
                    sourceType: sourceType || undefined,
                    from: fromDate || undefined,
                    to: toDate || undefined,
                    sharedKey: focusSharedKey || undefined,
                    sort: 'remindAt_asc',
                    limit: 100,
                });

                if (cancelled) return;

                const nowTs = Date.now();
                const declinedUpcoming = dismissedReminders.filter((item) =>
                    item.scope === 'shared'
                    && item.participationStatus === 'declined'
                    && new Date(item.remindAt).getTime() >= nowTs
                );

                setDeclinedSharedUpcomingReminders(declinedUpcoming);
            } catch (error) {
                if (!cancelled) {
                    setDeclinedSharedUpcomingReminders([]);
                }
                console.error('Load declined shared upcoming reminders failed:', error);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [activeTab, sourceType, fromDate, toDate, focusSharedKey]);

    const shouldLoadMore = activeTab === 'past' || activeTab === 'all';

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

    const groupedUpcoming = useMemo(() => {
        const groups = new Map<string, Reminder[]>();

        for (const reminder of normalizedReminders) {
            const key = toDateKey(new Date(reminder.remindAt));
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)?.push(reminder);
        }

        return Array.from(groups.entries()).map(([key, items]) => ({ key, label: formatDayLabel(key), items }));
    }, [normalizedReminders]);

    const groupedDeclinedSharedUpcoming = useMemo(() => {
        const groups = new Map<string, Reminder[]>();

        for (const reminder of declinedSharedUpcomingReminders) {
            const key = toDateKey(new Date(reminder.remindAt));
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)?.push(reminder);
        }

        return Array.from(groups.entries()).map(([key, items]) => ({ key, label: formatDayLabel(key), items }));
    }, [declinedSharedUpcomingReminders]);

    const hasUpcomingData = groupedUpcoming.length > 0 || groupedDeclinedSharedUpcoming.length > 0;
    const isAllTabStatusUnselected = activeTab === 'all' && selectedStatuses.length === 0;

    const reminderPendingDelete = useMemo(() => {
        if (!deleteReminderId) return null;
        return reminders.find((item) => item._id === deleteReminderId) || null;
    }, [deleteReminderId, reminders]);

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
                title: 'Hủy nhắc hẹn chung?',
                description: 'Nhắc hẹn chung sẽ bị hủy cho tất cả thành viên.',
                confirmText: 'Hủy cho tất cả',
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
    }, [calendarDays, calendarHourTicks, normalizedReminders]);

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
                syncStore: false,
                refreshSummary: false,
            });
            await fetchReminders(currentQueryParams);
            void fetchUpcomingCount();
            toast.success(result.message || 'Đã xóa nhắc nhở');
            setDeleteReminderId(null);
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

    const toggleStatus = useCallback((status: ReminderStatus) => {
        setSelectedStatuses((prev) =>
            prev.includes(status) ? prev.filter((item) => item !== status) : [...prev, status]
        );
    }, []);

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

    const isReminderEditable = (reminder: Reminder): boolean =>
        reminder.status === 'pending' || reminder.status === 'snoozed';

    const getReminderCardOptions = useCallback((reminder: Reminder): ReminderCardOptions => {
        const isShared = reminder.scope === 'shared';
        const isSharedCreator = isShared && reminder.createdBy === currentUserId;
        const isSharedDeclined = reminder.participationStatus === 'declined';
        const shouldShowSharedCancel = !isSharedDeclined;
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
                    showReuse: true,
                    showRepeat: true,
                    highlighted: highlightedReminderId === reminder._id,
                };
            }

            return {
                faded: false,
                editable: canEditSharedAsCreator || canEditSharedNotifyOnly,
                showEdit: canEditSharedAsCreator || canEditSharedNotifyOnly,
                editLabel: canEditSharedNotifyOnly ? 'Tùy chỉnh thông báo' : 'Chỉnh sửa',
                showCancel: shouldShowSharedCancel,
                cancelVariant: isSharedCreator ? 'cancel' : 'decline',
                cancelLabel: isSharedCreator ? 'Hủy cho tất cả' : 'Không tham gia',
                showRepeat: reminder.status === 'triggered',
                showReuse: reminder.status === 'triggered',
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
        <div className="flex-1 h-full flex flex-col bg-gradient-to-b from-card/30 via-card/15 to-background rounded-none md:rounded-md shadow-soft border-0 md:border border-border/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border/40 bg-card/60 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md bg-primary/10 border border-primary/10 flex items-center justify-center">
                        <CalendarDays className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Lời nhắc</h1>
                        <p className="text-xs text-muted-foreground">Quản lý các việc cần nhớ của bạn</p>
                    </div>
                </div>

                <Button
                    onClick={() => {
                        setEditingReminder(null);
                        setCreatePrefillData(undefined);
                        setShowCreateModal(true);
                    }}
                    className="gap-2 rounded-md bg-sky-600 text-white hover:bg-sky-700"
                >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Tạo nhắc nhở</span>
                    <span className="sm:hidden">Tạo</span>
                </Button>
            </div>

            <div className="px-4 md:px-6 pt-3 pb-2 border-b border-border/30 bg-background/60">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Button
                            variant={activeTab === 'all' ? 'default' : 'outline'}
                            size="sm"
                            className="rounded-md"
                            onClick={() => setActiveTab('all')}
                        >
                            Tất cả
                        </Button>
                        <Button
                            variant={activeTab === 'upcoming' ? 'default' : 'outline'}
                            size="sm"
                            className="rounded-md"
                            onClick={() => setActiveTab('upcoming')}
                        >
                            Sắp tới
                        </Button>
                        <Button
                            variant={activeTab === 'past' ? 'default' : 'outline'}
                            size="sm"
                            className="rounded-md"
                            onClick={() => setActiveTab('past')}
                        >
                            Đã qua
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="inline-flex items-center border border-border/70 bg-card p-1 rounded-md">
                            <Button
                                size="sm"
                                variant={viewMode === 'list' ? 'default' : 'ghost'}
                                className="h-7 px-2.5 rounded-md"
                                onClick={() => setViewMode('list')}
                            >
                                <LayoutList className="h-3.5 w-3.5 mr-1" />
                                Danh sách
                            </Button>
                            <Button
                                size="sm"
                                variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                                className="h-7 px-2.5 rounded-md"
                                onClick={() => setViewMode('calendar')}
                            >
                                <CalendarRange className="h-3.5 w-3.5 mr-1" />
                                Lịch
                            </Button>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            className="rounded-md border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300"
                            disabled={isLoading || reminders.length === 0}
                            onClick={() => setDeleteScope(activeTab)}
                        >
                            Xóa tất cả
                        </Button>
                    </div>
                </div>

                <div className="mt-3 border border-border/50 bg-card/60 p-2.5 flex flex-wrap items-center gap-2 rounded-md">
                    {activeTab === 'all' && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-2 rounded-md">
                                    <ListFilter className="h-3.5 w-3.5" />
                                    Trạng thái ({selectedStatuses.length})
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuLabel>Chọn trạng thái</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {STATUS_OPTIONS.map((option) => (
                                    <DropdownMenuCheckboxItem
                                        key={option.value}
                                        checked={selectedStatuses.includes(option.value)}
                                        onCheckedChange={() => toggleStatus(option.value)}
                                    >
                                        {option.label}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {isAllTabStatusUnselected && (
                        <div className="w-full border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-700 flex items-center justify-between gap-2 rounded-md">
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

                    <select
                        value={sourceType}
                        onChange={(event) => setSourceType(event.target.value as ReminderSourceType | '')}
                        className="h-9 border border-input bg-background px-3 text-sm rounded-md"
                    >
                        <option value="">Nguồn: Tất cả</option>
                        {SOURCE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <div className="flex items-center gap-2">
                        <Input
                            type="date"
                            value={fromDate}
                            onChange={(event) => setFromDate(event.target.value)}
                            className="h-9 w-[160px] rounded-md"
                        />
                        <span className="text-xs text-muted-foreground">đến</span>
                        <Input
                            type="date"
                            value={toDate}
                            min={fromDate || undefined}
                            onChange={(event) => setToDate(event.target.value)}
                            className="h-9 w-[160px] rounded-md"
                        />
                    </div>
                </div>
            </div>

            <div className={`flex-1 min-h-0 p-4 md:p-6 ${viewMode === 'calendar' ? 'overflow-hidden' : 'overflow-y-auto beautiful-scrollbar'}`}>
                {isLoading ? (
                    <div className="flex items-center justify-center py-14">
                        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : viewMode === 'calendar' ? (
                    reminders.length === 0 ? (
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
                            onDeleteReminder={setDeleteReminderId}
                            onOpenReminderMeetingLink={openReminderMeetingLink}
                        />
                    )
                ) : activeTab === 'upcoming' ? (
                    !hasUpcomingData ? (
                        upcomingEmpty
                    ) : (
                        <div className="space-y-5">
                            {groupedUpcoming.map((group) => (
                                <section key={group.key} className="space-y-2">
                                    <div className="sticky top-0 z-10 bg-background/90 backdrop-blur py-1">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                                    </div>
                                    <div className="space-y-2">
                                        {group.items.map((item) => (
                                            <ReminderCard
                                                key={item._id}
                                                reminder={item}
                                                activeTab={activeTab}
                                                options={getReminderCardOptions(item)}
                                                onEdit={handleEditReminder}
                                                onDelete={setDeleteReminderId}
                                                onReuse={handleReuseReminder}
                                                onRepeat={(reminder, minutes) => {
                                                    void handleRepeatReminder(reminder, minutes);
                                                }}
                                                onBindRef={bindReminderCardRef}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}

                            {groupedDeclinedSharedUpcoming.length > 0 && (
                                <div className="pt-1">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                        Đã từ chối (có thể tham gia lại từ thông báo trong chat)
                                    </p>
                                    <div className="space-y-2">
                                        {groupedDeclinedSharedUpcoming.flatMap((group) =>
                                            group.items.map((item) => (
                                                <ReminderCard
                                                    key={item._id}
                                                    reminder={item}
                                                    activeTab={activeTab}
                                                    options={{
                                                        highlighted: highlightedReminderId === item._id,
                                                        editable: false,
                                                        showEdit: false,
                                                        showCancel: false,
                                                        showRepeat: false,
                                                        showReuse: false,
                                                    }}
                                                    onEdit={handleEditReminder}
                                                    onDelete={setDeleteReminderId}
                                                    onReuse={handleReuseReminder}
                                                    onRepeat={(reminder, minutes) => {
                                                        void handleRepeatReminder(reminder, minutes);
                                                    }}
                                                    onBindRef={bindReminderCardRef}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                ) : activeTab === 'past' ? (
                    reminders.length === 0 ? (
                        pastEmpty
                    ) : (
                        <div className="space-y-3">
                            {normalizedReminders.map((item) => (
                                <ReminderCard
                                    key={item._id}
                                    reminder={item}
                                    activeTab={activeTab}
                                    options={getReminderCardOptions(item)}
                                    onEdit={handleEditReminder}
                                    onDelete={setDeleteReminderId}
                                    onReuse={handleReuseReminder}
                                    onRepeat={(reminder, minutes) => {
                                        void handleRepeatReminder(reminder, minutes);
                                    }}
                                    onBindRef={bindReminderCardRef}
                                />
                            ))}
                        </div>
                    )
                ) : reminders.length === 0 ? (
                    allEmpty
                ) : (
                    <div className="space-y-3">
                        {normalizedReminders.map((item) => (
                            <ReminderCard
                                key={item._id}
                                reminder={item}
                                activeTab={activeTab}
                                options={getReminderCardOptions(item)}
                                onEdit={handleEditReminder}
                                onDelete={setDeleteReminderId}
                                onReuse={handleReuseReminder}
                                onRepeat={(reminder, minutes) => {
                                    void handleRepeatReminder(reminder, minutes);
                                }}
                                onBindRef={bindReminderCardRef}
                            />
                        ))}
                    </div>
                )}

                {(activeTab === 'past' || activeTab === 'all') && reminders.length > 0 && (
                    <div ref={loadMoreRef} className="h-8 mt-2 flex items-center justify-center">
                        {isLoadingMore && <Clock3 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                )}
            </div>

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
