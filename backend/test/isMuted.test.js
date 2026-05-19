import test from 'node:test';
import assert from 'node:assert/strict';

import { isMuted } from '../src/utils/isMuted.js';

test('isMuted returns false when no mute deadline exists', () => {
    assert.equal(isMuted({}, 'messages'), false);
    assert.equal(isMuted(null, 'meetings'), false);
});

test('isMuted follows future and past mute deadlines', () => {
    const now = Date.now();

    assert.equal(isMuted({ messages: new Date(now + 60_000).toISOString() }, 'messages'), true);
    assert.equal(isMuted({ messages: new Date(now - 60_000).toISOString() }, 'messages'), false);
});
