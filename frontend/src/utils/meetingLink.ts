const MEETING_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
const MEETING_CODE_REGEX = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/;

const normalizeSeed = (seed: string): string =>
  seed.toLowerCase().replace(/[^a-z0-9]/g, '');

const safeOrigin = (): string => {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
};

export const extractMeetingCode = (input: string): string | null => {
  const value = input.trim().toLowerCase();
  if (!value) return null;

  if (MEETING_CODE_REGEX.test(value)) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const room = (parsed.searchParams.get('room') || '').trim().toLowerCase();
      if (MEETING_CODE_REGEX.test(room)) {
        return room;
      }
    } catch {
      return null;
    }
  }

  return null;
};

export const extractFirstHttpUrl = (text: string): string | null => {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  return match[0].replace(/[),.;!?]+$/, '');
};

export const generateMeetingCode = (seed?: string): string => {
  const normalizedSeed = seed ? normalizeSeed(seed) : '';

  const pickAt = (index: number): string => {
    if (!normalizedSeed) {
      return MEETING_CHARS[Math.floor(Math.random() * MEETING_CHARS.length)];
    }

    const seedCharCode = normalizedSeed.charCodeAt(index % normalizedSeed.length);
    const charIndex = (seedCharCode + index * 17) % MEETING_CHARS.length;
    return MEETING_CHARS[charIndex];
  };

  const buildSegment = (length: number, offset: number): string =>
    Array.from({ length }, (_, i) => pickAt(offset + i)).join('');

  return `${buildSegment(3, 0)}-${buildSegment(4, 3)}-${buildSegment(3, 7)}`;
};

export const buildMeetingUrl = (meetingCode: string, origin = safeOrigin()): string => {
  const room = meetingCode.trim().toLowerCase();
  const params = new URLSearchParams({ room });

  const path = `/meet?${params.toString()}`;
  if (!origin) return path;
  return `${origin}${path}`;
};
