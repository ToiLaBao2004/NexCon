const MEETING_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
const MEETING_CODE_REGEX = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/;
const MEETING_TITLE_CACHE_KEY = 'nexcon-meeting-title-cache';
const MEETING_TITLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEETING_TITLE_CACHE_MAX = 40;

type MeetingTitleCacheItem = {
  title: string;
  updatedAt: number;
};

type MeetingTitleCache = Record<string, MeetingTitleCacheItem>;

const normalizeSeed = (seed: string): string =>
  seed.toLowerCase().replace(/[^a-z0-9]/g, '');

const safeOrigin = (): string => {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
};

const readMeetingTitleCache = (): MeetingTitleCache => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.sessionStorage.getItem(MEETING_TITLE_CACHE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as MeetingTitleCache;
    if (!parsed || typeof parsed !== 'object') return {};

    return parsed;
  } catch {
    return {};
  }
};

const writeMeetingTitleCache = (cache: MeetingTitleCache): void => {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(MEETING_TITLE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage write errors in private mode / restricted environments.
  }
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

export const extractMeetingTitle = (input: string): string | null => {
  const value = input.trim();
  if (!value || !/^https?:\/\//i.test(value)) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const title = (parsed.searchParams.get('title') || '').trim();
    return title || null;
  } catch {
    return null;
  }
};

export const extractFirstHttpUrl = (text: string): string | null => {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  return match[0].replace(/[),.;!?]+$/, '');
};

export const rememberMeetingTitle = (meetingInput: string, titleInput?: string | null): void => {
  const roomCode = extractMeetingCode(meetingInput) || meetingInput.trim().toLowerCase();
  const title = typeof titleInput === 'string' ? titleInput.trim() : '';

  if (!roomCode || !title) return;

  const now = Date.now();
  const cache = readMeetingTitleCache();

  cache[roomCode] = {
    title,
    updatedAt: now,
  };

  const entries = Object.entries(cache)
    .filter(([, value]) => value && typeof value.title === 'string' && value.updatedAt > now - MEETING_TITLE_TTL_MS)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, MEETING_TITLE_CACHE_MAX);

  writeMeetingTitleCache(Object.fromEntries(entries));
};

export const getRememberedMeetingTitle = (meetingInput: string): string | null => {
  const roomCode = extractMeetingCode(meetingInput) || meetingInput.trim().toLowerCase();
  if (!roomCode) return null;

  const now = Date.now();
  const cache = readMeetingTitleCache();
  const record = cache[roomCode];

  if (!record || now - record.updatedAt > MEETING_TITLE_TTL_MS) {
    if (record) {
      delete cache[roomCode];
      writeMeetingTitleCache(cache);
    }
    return null;
  }

  return record.title.trim() || null;
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

export const buildMeetingUrl = (meetingCode: string, origin = safeOrigin(), meetingTitle?: string): string => {
  const room = meetingCode.trim().toLowerCase();
  const params = new URLSearchParams({ room });

  const normalizedTitle = typeof meetingTitle === 'string' ? meetingTitle.trim() : '';
  if (normalizedTitle) {
    params.set('title', normalizedTitle);
  }

  const path = `/meet?${params.toString()}`;
  if (!origin) return path;
  return `${origin}${path}`;
};
