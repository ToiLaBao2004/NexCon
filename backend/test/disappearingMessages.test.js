import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DISAPPEARED_MESSAGE_PLACEHOLDER,
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

test('getMessageExpirationFields starts the timer at server delivery time', () => {
    const deliveredAt = new Date('2026-05-31T10:00:00.000Z');
    const result = getMessageExpirationFields({
        conversation: {
            disappearingEnabled: true,
            disappearingDurationSeconds: 300,
        },
        deliveredAt,
    });

    assert.equal(result.deliveryStartedAt.toISOString(), deliveredAt.toISOString());
    assert.equal(result.expiresAt.toISOString(), '2026-05-31T10:05:00.000Z');
    assert.equal(result.disappearingDurationSeconds, 300);
});

test('forwarded disappearing messages inherit source duration in a permanent conversation', () => {
    const result = getMessageExpirationFields({
        conversation: { disappearingEnabled: false },
        inheritedDurationSeconds: 3600,
        deliveredAt: new Date('2026-05-31T10:00:00.000Z'),
    });

    assert.equal(result.disappearingDurationSeconds, 3600);
    assert.equal(result.expiresAt.toISOString(), '2026-05-31T11:00:00.000Z');
});

test('only direct initiator or group admins can manage disappearing messages', () => {
    assert.equal(canManageDisappearingMessages({
        type: 'direct',
        initiatedBy: 'user-a',
        participants: [{ userId: 'user-a' }, { userId: 'user-b' }],
    }, 'user-a'), true);
    assert.equal(canManageDisappearingMessages({
        type: 'direct',
        initiatedBy: 'user-a',
        participants: [{ userId: 'user-a' }, { userId: 'user-b' }],
    }, 'user-b'), false);
    assert.equal(canManageDisappearingMessages({
        type: 'group',
        group: { admins: ['user-b'] },
    }, 'user-b'), true);
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
    assert.equal(DISAPPEARED_MESSAGE_PLACEHOLDER, 'This message has disappeared.');
});
