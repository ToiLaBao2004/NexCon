import type { Message } from '@/types/chat';

export type CallMode = 'direct' | 'group';
export type CallType = 'voice' | 'video';
export type CallOverallStatus = 'active' | 'ended' | 'canceled' | 'missed';

export interface CallParticipantSnapshot {
  userId: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  status: string;
  joinedAt: string | null;
  leftAt: string | null;
}

export interface CallEventSnapshot {
  callId: string;
  mode: CallMode;
  callType: CallType;
  overallStatus: CallOverallStatus;
  duration: number;
  startedAt: string | null;
  endedAt: string | null;
  initiatorUser: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  participants: CallParticipantSnapshot[];
}

function toObject(metadata: any): Record<string, any> {
  if (!metadata) return {};
  if (metadata instanceof Map) return Object.fromEntries(metadata);
  return metadata;
}

export function parseCallSnapshot(message: Message): CallEventSnapshot | null {
  if (message.type !== 'system' || message.systemType !== 'call') {
    return null;
  }

  const metadata = toObject(message.metadata);
  const fallbackInitiatorId = String(message.senderId || '').trim();
  const fallbackInitiatorName = message.senderInfo?.displayName || 'Người dùng';
  const fallbackInitiatorAvatar = message.senderInfo?.avatarUrl ?? null;

  const rawParticipants = Array.isArray(metadata.participants)
    ? metadata.participants
    : [];

  const participants: CallParticipantSnapshot[] = rawParticipants
    .map((item: any) => {
      const userObj = item?.userId || {};
      const uid = String(userObj?._id || userObj || '').trim();
      if (!uid) return null;

      return {
        userId: {
          _id: uid,
          displayName: userObj.displayName || 'Người dùng',
          avatarUrl: userObj.avatarUrl ?? null,
        },
        status: String(item?.status || 'missed'),
        joinedAt: item?.joinedAt ? String(item.joinedAt) : null,
        leftAt: item?.leftAt ? String(item.leftAt) : null,
      };
    })
    .filter(Boolean) as CallParticipantSnapshot[];

  const initiatorMeta = metadata.initiatorUser || {};
  const initiatorId = String(initiatorMeta._id || fallbackInitiatorId).trim();

  if (!initiatorId) {
    return null;
  }

  return {
    callId: String(metadata.callId || message._id || `${message.conversationId}-${message.createdAt}`),
    mode: metadata.mode === 'group' ? 'group' : 'direct',
    callType: metadata.callType === 'video' ? 'video' : 'voice',
    overallStatus: ['active', 'ended', 'canceled', 'missed'].includes(metadata.overallStatus)
      ? metadata.overallStatus
      : 'ended',
    duration: Number.isFinite(metadata.duration) ? Number(metadata.duration) : 0,
    startedAt: metadata.startedAt ? String(metadata.startedAt) : null,
    endedAt: metadata.endedAt ? String(metadata.endedAt) : null,
    initiatorUser: {
      _id: initiatorId,
      displayName: String(initiatorMeta.displayName || fallbackInitiatorName),
      avatarUrl: initiatorMeta.avatarUrl ?? fallbackInitiatorAvatar,
    },
    participants,
  };
}
