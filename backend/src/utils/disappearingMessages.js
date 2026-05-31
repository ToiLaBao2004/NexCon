export const MIN_DISAPPEARING_DURATION_SECONDS = 60;
export const MAX_DISAPPEARING_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS = 24 * 60 * 60;
export const DISAPPEARING_MESSAGE_TTL_SECONDS = 24 * 60 * 60;
export const DISAPPEARED_MESSAGE_PLACEHOLDER = 'Tin nhắn này đã biến mất.';

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

    return Boolean(conversation.participants?.some(
        (participant) => (participant.userId?._id || participant.userId)?.toString?.() === normalizedUserId
    ));
}

export function isDisappearingModeActive(conversation, at = new Date()) {
    if (conversation?.disappearingEnabled !== true) return false;
    if (!conversation.disappearingDisableAt) return true;

    const disableAt = new Date(conversation.disappearingDisableAt);
    const referenceTime = new Date(at);
    return !Number.isNaN(disableAt.getTime())
        && !Number.isNaN(referenceTime.getTime())
        && disableAt.getTime() > referenceTime.getTime();
}

export function getMessageExpirationFields({
    conversation,
    inheritedDisappearing = false,
    deliveredAt = new Date(),
} = {}) {
    const deliveryStartedAt = new Date(deliveredAt);
    if (Number.isNaN(deliveryStartedAt.getTime())) {
        throw new Error('deliveredAt must be a valid date.');
    }

    if (!inheritedDisappearing && !isDisappearingModeActive(conversation, deliveryStartedAt)) {
        return {};
    }

    return {
        deliveryStartedAt,
        expiresAt: new Date(deliveryStartedAt.getTime() + DISAPPEARING_MESSAGE_TTL_SECONDS * 1000),
        isExpired: false,
    };
}

export function isMessageExpired(message, at = new Date()) {
    if (message?.isExpired === true) return true;
    if (!message?.expiresAt) return false;

    const expiresAt = new Date(message.expiresAt);
    const referenceTime = new Date(at);
    return !Number.isNaN(expiresAt.getTime())
        && !Number.isNaN(referenceTime.getTime())
        && expiresAt.getTime() <= referenceTime.getTime();
}

export function buildUnexpiredMessageFilter(at = new Date()) {
    return {
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: new Date(at) } },
        ],
    };
}

export function sanitizeExpiredMessageForClient(message) {
    if (!message) return message;

    const replyTo = message.replyTo
        ? sanitizeExpiredMessageForClient(message.replyTo)
        : message.replyTo;
    if (!isMessageExpired(message)) {
        return replyTo === message.replyTo ? message : { ...message, replyTo };
    }

    return {
        ...message,
        replyTo,
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
        isExpired: true,
        expiredAt: message.expiredAt ?? message.expiresAt,
    };
}

export function buildDisappearingSetting(conversation) {
    return {
        enabled: isDisappearingModeActive(conversation),
        durationSeconds: conversation?.disappearingAutoDisableSeconds ?? null,
        disableAt: conversation?.disappearingDisableAt ?? null,
        enabledBy: conversation?.disappearingEnabledBy ?? null,
        enabledAt: conversation?.disappearingEnabledAt ?? null,
    };
}
