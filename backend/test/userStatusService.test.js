import test from 'node:test';
import assert from 'node:assert/strict';
import {
    canViewerSeePresence,
    formatRelativeTimeVi,
    normalizeManualStatus,
    normalizeStatusMode,
} from '../src/services/userStatusService.js';

test('normalizeManualStatus accepts common manual status aliases', () => {
    assert.equal(normalizeManualStatus('Online'), 'online');
    assert.equal(normalizeManualStatus('Do Not Disturb'), 'do_not_disturb');
    assert.equal(normalizeManualStatus('dnd'), 'do_not_disturb');
    assert.equal(normalizeManualStatus('offline'), 'invisible');
    assert.equal(normalizeManualStatus('invalid'), null);
});

test('normalizeStatusMode only accepts auto and manual', () => {
    assert.equal(normalizeStatusMode('auto'), 'auto');
    assert.equal(normalizeStatusMode('manual'), 'manual');
    assert.equal(normalizeStatusMode('hidden'), null);
});

test('canViewerSeePresence only allows self and friends', () => {
    assert.equal(canViewerSeePresence('user-1', 'user-1', []), true);
    assert.equal(canViewerSeePresence('user-1', 'user-2', ['user-2']), true);
    assert.equal(canViewerSeePresence('user-1', 'user-3', ['user-2']), false);
    assert.equal(canViewerSeePresence(null, 'user-2', ['user-2']), false);
});

test('formatRelativeTimeVi formats recent activity in Vietnamese', () => {
    const now = new Date('2026-05-23T12:00:00.000Z').getTime();

    assert.equal(formatRelativeTimeVi('2026-05-23T11:59:30.000Z', now), 'vừa xong');
    assert.equal(formatRelativeTimeVi('2026-05-23T11:57:00.000Z', now), 'vài phút trước');
    assert.equal(formatRelativeTimeVi('2026-05-23T11:42:00.000Z', now), '18 phút trước');
    assert.equal(formatRelativeTimeVi('2026-05-23T09:00:00.000Z', now), '3 giờ trước');
    assert.equal(formatRelativeTimeVi('2026-05-20T12:00:00.000Z', now), '3 ngày trước');
});
