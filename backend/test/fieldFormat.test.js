import test from 'node:test';
import assert from 'node:assert/strict';

import { checkFieldFormat } from '../src/utils/fieldFormat.js';

test('checkFieldFormat accepts valid profile fields', () => {
    assert.equal(checkFieldFormat('displayName', '  NexCon User  '), null);
    assert.equal(checkFieldFormat('phone', '0901234567'), null);
    assert.equal(checkFieldFormat('nickname', null), null);
});

test('checkFieldFormat rejects empty display name', () => {
    const error = checkFieldFormat('displayName', '   ');

    assert.equal(typeof error, 'string');
});

test('checkFieldFormat rejects invalid phone and overly long nickname', () => {
    assert.equal(typeof checkFieldFormat('phone', '09012abc'), 'string');
    assert.match(checkFieldFormat('nickname', 'x'.repeat(51)), /50/);
});
