import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DISAPPEARED_MESSAGE_PLACEHOLDER,
    DISAPPEARING_MESSAGE_TTL_SECONDS,
    canManageDisappearingMessages,
    getMessageExpirationFields,
    normalizeDisappearingDurationSeconds,
    sanitizeExpiredMessageForClient,
} from '../src/utils/disappearingMessages.js';

test('normalizeDisappearingDurationSeconds enforces one minute to thirty days', () => {
    assert.equal(normalizeDisappearingDurationSeconds(60), 60);
    assert.equal(normalizeDisappearingDurationSeconds(30 * 24 * 60 * 60), 2592000);
    assert.throws(() => normalizeDisappearingDurationSeconds(59), /between 60 and 2592000/);
    assert.throws(() => normalizeDisappearingDurationSeconds(60.5), /integer/);
});

test('getMessageExpirationFields uses a fixed twenty-four-hour TTL from server delivery time', () => {
    const deliveredAt = new Date('2026-05-31T10:00:00.000Z');
    const result = getMessageExpirationFields({
        conversation: {
            disappearingEnabled: true,
            disappearingAutoDisableSeconds: 300,
            disappearingDisableAt: '2026-05-31T10:05:00.000Z',
        },
        deliveredAt,
    });

    assert.equal(result.deliveryStartedAt.toISOString(), deliveredAt.toISOString());
    assert.equal(result.expiresAt.toISOString(), '2026-06-01T10:00:00.000Z');
    assert.equal(DISAPPEARING_MESSAGE_TTL_SECONDS, 86400);
});

test('messages sent after the mode auto-disable deadline remain permanent', () => {
    const result = getMessageExpirationFields({
        conversation: {
            disappearingEnabled: true,
            disappearingAutoDisableSeconds: 300,
            disappearingDisableAt: '2026-05-31T10:05:00.000Z',
        },
        deliveredAt: new Date('2026-05-31T10:06:00.000Z'),
    });

    assert.deepEqual(result, {});
});

test('forwarded disappearing messages remain disappearing with the fixed TTL', () => {
    const result = getMessageExpirationFields({
        conversation: { disappearingEnabled: false },
        inheritedDisappearing: true,
        deliveredAt: new Date('2026-05-31T10:00:00.000Z'),
    });

    assert.equal(result.expiresAt.toISOString(), '2026-06-01T10:00:00.000Z');
});

test('direct participants or group admins can manage disappearing messages', () => {
    assert.equal(canManageDisappearingMessages({
        type: 'direct',
        participants: [{ userId: 'user-a' }, { userId: 'user-b' }],
    }, 'user-a'), true);
    assert.equal(canManageDisappearingMessages({
        type: 'direct',
        participants: [{ userId: 'user-a' }, { userId: 'user-b' }],
    }, 'user-b'), true);
    assert.equal(canManageDisappearingMessages({
        type: 'direct',
        participants: [{ userId: 'user-a' }, { userId: 'user-b' }],
    }, 'user-c'), false);
    assert.equal(canManageDisappearingMessages({
        type: 'group',
        group: { admins: ['user-b'] },
    }, 'user-b'), true);
    assert.equal(canManageDisappearingMessages({
        type: 'group',
        group: { admins: ['user-b'] },
    }, 'user-a'), false);
});

test('sanitizeExpiredMessageForClient keeps audit metadata out of client payload', () => {
    const result = sanitizeExpiredMessageForClient({
        _id: 'message-1',
        isExpired: true,
        content: 'audit content',
        searchContent: 'audit search',
        filePublicId: 'asset-1',
        reactions: [{ userId: 'user-1', emoji: 'ok' }],
        isPinned: true,
    });

    assert.equal(result.content, null);
    assert.equal(result.searchContent, undefined);
    assert.equal(result.filePublicId, undefined);
    assert.deepEqual(result.reactions, []);
    assert.equal(result.isPinned, false);
    assert.equal(DISAPPEARED_MESSAGE_PLACEHOLDER, 'Tin nhắn này đã biến mất.');
});

test('sanitizeExpiredMessageForClient hides a due message before the batch sweep updates the database', () => {
    const result = sanitizeExpiredMessageForClient({
        _id: 'message-2',
        expiresAt: '2020-01-01T00:00:00.000Z',
        isExpired: false,
        content: 'content waiting for sweep',
    });

    assert.equal(result.content, null);
    assert.equal(result.isExpired, true);
    assert.equal(result.expiredAt, '2020-01-01T00:00:00.000Z');
});
