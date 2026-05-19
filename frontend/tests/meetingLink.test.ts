import { describe, expect, it } from 'vitest';

import {
  buildMeetingUrl,
  extractFirstHttpUrl,
  extractMeetingCode,
  generateMeetingCode,
} from '../src/utils/meetingLink';

describe('meetingLink utilities', () => {
  it('extracts meeting codes from direct codes and room URLs', () => {
    expect(extractMeetingCode('ABC-1234-XYZ')).toBe('abc-1234-xyz');
    expect(extractMeetingCode('https://nexcon.app/meet?room=abc-2345-def')).toBe('abc-2345-def');
    expect(extractMeetingCode('not-a-meeting')).toBeNull();
  });

  it('extracts the first http URL without trailing punctuation', () => {
    expect(extractFirstHttpUrl('Join https://nexcon.app/meet?room=abc-2345-def.')).toBe(
      'https://nexcon.app/meet?room=abc-2345-def',
    );
    expect(extractFirstHttpUrl('no link here')).toBeNull();
  });

  it('generates stable seeded meeting codes', () => {
    const first = generateMeetingCode('NexCon 2026');
    const second = generateMeetingCode('NexCon 2026');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/);
  });

  it('builds meeting URLs from a room code and optional origin', () => {
    expect(buildMeetingUrl('ABC-2345-DEF')).toBe('/meet?room=abc-2345-def');
    expect(buildMeetingUrl('ABC-2345-DEF', 'https://nexcon.app')).toBe(
      'https://nexcon.app/meet?room=abc-2345-def',
    );
  });
});
