export const REMINDER_REPEAT_RULES = ['none', 'daily', 'weekly', 'monthly'];
export const REMINDER_STATUSES = ['pending', 'triggered', 'snoozed', 'dismissed'];
export const REMINDER_UPCOMING_STATUSES = ['pending', 'snoozed'];
export const REMINDER_SCOPES = ['personal', 'shared'];
export const REMINDER_PARTICIPATION_STATUSES = ['joined', 'declined'];
export const REMINDER_SOURCE_TYPES = ['manual', 'message', 'meeting'];
export const REMINDER_SOURCE_LEGACY_TYPES = ['call'];
export const REMINDER_SOURCE_ACCEPTED_TYPES = [...REMINDER_SOURCE_TYPES, ...REMINDER_SOURCE_LEGACY_TYPES];
export const REMINDER_NOTIFY_CHANNELS = ['inapp', 'email'];

export const ALLOWED_SNOOZE_MINUTES = [5, 10, 30, 60];
export const ALLOWED_UPDATE_FIELDS = ['content', 'remindAt', 'repeatRule', 'notifyChannels'];

export function resolveReminderContent({ content, title, note }) {
    const contentText = typeof content === 'string' ? content.trim() : '';
    if (contentText) return contentText;

    const titleText = typeof title === 'string' ? title.trim() : '';
    const noteText = typeof note === 'string' ? note.trim() : '';
    return [titleText, noteText].filter(Boolean).join('\n').trim();
}

export function normalizeReminderSource(source) {
    if (!source || typeof source !== 'object') return undefined;

    const sourceTypeRaw = typeof source.type === 'string' ? source.type.trim() : '';
    const sourceRefId = typeof source.refId === 'string' ? source.refId.trim() : '';
    const sourceType = sourceTypeRaw === 'call' ? 'meeting' : sourceTypeRaw;

    if (!sourceType) return undefined;

    return {
        type: sourceType,
        ...(sourceRefId ? { refId: sourceRefId } : {}),
    };
}

export function isValidDateInput(value) {
    if (!value) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
}

export function normalizeDate(value) {
    return new Date(value);
}

export function toArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === undefined || value === null) {
        return [];
    }
    return [value];
}

export function normalizeReminderOutput(reminder) {
    const raw = reminder?.toObject ? reminder.toObject() : reminder;
    if (!raw) return raw;
    const normalizedSource = normalizeReminderSource(raw.source);
    const normalizedScope = REMINDER_SCOPES.includes(raw.scope) ? raw.scope : 'personal';
    const normalizedParticipation = REMINDER_PARTICIPATION_STATUSES.includes(raw.participationStatus)
        ? raw.participationStatus
        : 'joined';

    const toIdString = (value) => {
        if (!value) return undefined;
        if (typeof value === 'string') return value;
        if (typeof value.toString === 'function') return value.toString();
        return undefined;
    };

    return {
        ...raw,
        content: resolveReminderContent(raw),
        source: normalizedSource,
        scope: normalizedScope,
        participationStatus: normalizedParticipation,
        createdBy: toIdString(raw.createdBy),
        conversationId: toIdString(raw.conversationId),
        meetingId: toIdString(raw.meetingId),
        meetingRoomName: typeof raw.meetingRoomName === 'string' ? raw.meetingRoomName : undefined,
        sharedKey: typeof raw.sharedKey === 'string' ? raw.sharedKey : undefined,
    };
}

export function validateSourcePayload(source) {
    const normalizedSource = normalizeReminderSource(source);
    if (!normalizedSource) {
        return { normalizedSource: undefined };
    }

    if (!REMINDER_SOURCE_TYPES.includes(normalizedSource.type)) {
        return { error: 'Invalid source.type value.' };
    }

    const requiresRefId = normalizedSource.type === 'message';
    if (requiresRefId && !normalizedSource.refId) {
        return { error: 'source.refId is required for message reminders.' };
    }

    return { normalizedSource };
}
