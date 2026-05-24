import { describe, expect, it } from 'vitest';

import { checkFieldFormat } from '../src/lib/fieldFormat';

describe('checkFieldFormat', () => {
  it('accepts valid profile fields', () => {
    expect(checkFieldFormat('displayName', '  NexCon User  ')).toBeNull();
    expect(checkFieldFormat('phone', '0901234567')).toBeNull();
    expect(checkFieldFormat('nickname', null)).toBeNull();
  });

  it('rejects invalid profile fields', () => {
    expect(checkFieldFormat('displayName', '   ')).toEqual(expect.any(String));
    expect(checkFieldFormat('phone', '09012abc')).toEqual(expect.any(String));
    expect(checkFieldFormat('nickname', 'x'.repeat(51))).toContain('50');
  });

  it('validates group names', () => {
    expect(checkFieldFormat('groupName', '  NexCon Team  ')).toBeNull();
    expect(checkFieldFormat('groupName', '   ')).toEqual(expect.any(String));
    expect(checkFieldFormat('groupName', 'x'.repeat(101))).toContain('100');
    expect(checkFieldFormat('groupName', '!!!')).toEqual(expect.any(String));
  });
});
