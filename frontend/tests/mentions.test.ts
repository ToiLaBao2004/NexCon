import { describe, expect, it } from 'vitest';

import {
  buildMentionMessagePayload,
  decodeMentionTokens,
  getActiveMentionToken,
  insertMentionIntoText,
  normalizeMentionSearch,
  type DraftMention,
  type MentionCandidate,
} from '../src/utils/mentions';

const candidate: MentionCandidate = {
  userId: '507f1f77bcf86cd799439011',
  displayName: 'Bảo Trần',
  canonicalDisplayName: 'Bao Tran',
  avatarUrl: null,
};

describe('mention helpers', () => {
  it('detects an active mention trigger', () => {
    expect(getActiveMentionToken('hello @ba', 9)).toEqual({
      query: 'ba',
      start: 6,
      end: 9,
    });
    expect(getActiveMentionToken('email@domain.com', 16)).toBeNull();
  });

  it('normalizes Vietnamese search text', () => {
    expect(normalizeMentionSearch('  Bảo Đặng  ')).toBe('bao dang');
  });

  it('inserts and tokenizes selected mentions', () => {
    const inserted = insertMentionIntoText({
      text: 'chao @ba',
      range: { start: 5, end: 8 },
      candidate,
      mentions: [],
    });

    expect(inserted.text).toBe('chao @Bảo Trần ');
    expect(inserted.cursor).toBe(inserted.text.length);

    const payload = buildMentionMessagePayload(inserted.text, inserted.mentions);
    expect(payload.content).toBe('chao @[USER:507f1f77bcf86cd799439011] ');
    expect(payload.mentions).toHaveLength(1);
    expect(payload.mentions[0].userId).toBe(candidate.userId);
  });

  it('drops edited mention labels before tokenizing', () => {
    const mentions: DraftMention[] = [{
      userId: candidate.userId,
      displayName: 'Bảo Trần',
      canonicalDisplayName: 'Bao Tran',
      avatarUrl: null,
      start: 0,
      end: 9,
    }];

    expect(buildMentionMessagePayload('@Bao Tran', mentions)).toEqual({
      content: '@Bao Tran',
      mentions: [],
    });
  });

  it('decodes mention tokens from conversation participants', () => {
    const text = decodeMentionTokens('ping @[USER:507f1f77bcf86cd799439011]', {
      _id: 'c1',
      type: 'group',
      group: { name: 'Team', createdBy: 'u1' },
      participants: [{
        userId: {
          _id: candidate.userId,
          displayName: 'Bao Tran',
          nickname: 'Bảo',
        },
        joinedAt: '',
      }],
      lastMessageAt: '',
      lastMessage: null,
      unreadCounts: {},
      createdAt: '',
      updatedAt: '',
    });

    expect(text).toBe('ping @Bảo');
  });

  it('never exposes raw mention tokens when display data is missing', () => {
    expect(decodeMentionTokens('reply @[USER:507f1f77bcf86cd799439011]')).toBe('reply @Người dùng');
  });
});
