export const MIN_DISAPPEARING_DURATION_SECONDS = 60;
export const MAX_DISAPPEARING_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const DEFAULT_DISAPPEARING_DURATION_SECONDS = 24 * 60 * 60;
export const DISAPPEARED_MESSAGE_PLACEHOLDER = 'This message has disappeared.';

export function normalizeDisappearingDurationSeconds(value, { required = true } = {}) {
    if ((value === undefined || value === null || value === '') && !required) {
        return null;
    }

    const durationSeconds = Number(value);
    if (
        !Number.isInteger(durationSeconds)
        || durationSeconds < MIN_DISAPPEARING_DURATION_SECONDS
        || durationSeconds > MAX_DISAPPEARING_DURATION_SECONDS
    ) {
        throw new Error(
            `durationSeconds must be an integer between ${MIN_DISAPPEARING_DURATION_SECONDS} and ${MAX_DISAPPEARING_DURATION_SECONDS}.`
        );
    }

    return durationSeconds;
}

export function canManageDisappearingMessages(conversation, userId) {
    const normalizedUserId = userId?.toString?.() || '';
    if (!conversation || !normalizedUserId) return false;

    if (conversation.type === 'group') {
        return Boolean(conversation.group?.admins?.some(
            (adminId) => (adminId?._id || adminId)?.toString?.() === normalizedUserId
        ));
    }

    const initiatorId = (
        conversation.initiatedBy
        || conversation.participants?.[0]?.userId
    );
    return (initiatorId?._id || initiatorId)?.toString?.() === normalizedUserId;
}

export function getMessageExpirationFields({
    conversation,
    inheritedDurationSeconds = null,
    deliveredAt = new Date(),
} = {}) {
    const rawDuration = inheritedDurationSeconds
        ?? (conversation?.disappearingEnabled ? conversation.disappearingDurationSeconds : null);

    if (rawDuration === undefined || rawDuration === null) {
        return {};
    }

    const durationSeconds = normalizeDisappearingDurationSeconds(rawDuration);
    const deliveryStartedAt = new Date(deliveredAt);
    if (Number.isNaN(deliveryStartedAt.getTime())) {
        throw new Error('deliveredAt must be a valid date.');
    }

    return {
        deliveryStartedAt,
        disappearingDurationSeconds: durationSeconds,
        expiresAt: new Date(deliveryStartedAt.getTime() + durationSeconds * 1000),
        isExpired: false,
    };
}

export function sanitizeExpiredMessageForClient(message) {
    if (!message?.isExpired) return message;

    return {
        ...message,
        content: null,
        searchContent: undefined,
        filePublicId: undefined,
        fileUrl: undefined,
        signedUrl: null,
        fileName: undefined,
        fileSize: undefined,
        mimeType: undefined,
        reactions: [],
        isPinned: false,
        pinnedAt: null,
    };
}

export function buildDisappearingSetting(conversation) {
    return {
        enabled: conversation?.disappearingEnabled === true,
        durationSeconds: conversation?.disappearingDurationSeconds ?? null,
        enabledBy: conversation?.disappearingEnabledBy ?? null,
        enabledAt: conversation?.disappearingEnabledAt ?? null,
    };
}
