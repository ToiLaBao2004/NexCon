import { create } from 'zustand';
import { useSocketStore } from './useSocketStore';
import { meetingService } from '@/services/meetingService';
import type { Meeting } from '@/types/meeting';

export type MeetCallStatus = 'idle' | 'waiting' | 'rejected';
export type MeetViewStatus = 'idle' | 'preview' | 'waiting' | 'active' | 'rejected';
export type RejectedReason = 'host-rejected' | 'timeout' | 'meeting-ended' | null;

export interface WaitingRoomParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  metadata?: string;
  joinedAt: string;
}

interface MeetState {
  isInMeeting: boolean;
  token: string | null;
  roomName: string | null;
  isHost: boolean;
  meetingStatus: MeetViewStatus;
  preferredCameraEnabled: boolean;
  preferredMicEnabled: boolean;
  isMinimized: boolean;
  callStatus: MeetCallStatus;
  waitingRoom: WaitingRoomParticipant[];
  participantCount: number;
  rejectedReason: RejectedReason;
  currentMeeting: Meeting | null;
  isLoadingMeeting: boolean;

  joinMeeting: (token: string, roomName: string, isHost?: boolean, initialWaitingRoom?: WaitingRoomParticipant[]) => void;
  leaveMeeting: () => void;
  leaveAndReset: () => void;
  setMinimized: (v: boolean) => void;
  maximize: () => void;
  setCallStatus: (status: MeetCallStatus) => void;
  setMeetingStatus: (status: MeetViewStatus) => void;
  setWaitingRoom: (waitingRoom: WaitingRoomParticipant[]) => void;
  setParticipantCount: (n: number) => void;
  setRejectedReason: (reason: RejectedReason) => void;
  setJoinPreferences: (prefs: { cameraEnabled: boolean; micEnabled: boolean }) => void;
  admitParticipant: (roomName: string, targetUserId: string) => void;
  rejectParticipant: (roomName: string, targetUserId: string) => void;
  admitAllParticipants: (roomName: string) => void;
  cancelWaiting: (roomName?: string) => void;
  handleMeetingEnded: () => void;
  handleRejected: (reason: RejectedReason) => void;

  createMeeting: (options?: { requireApproval?: boolean; conversationId?: string }) => Promise<Meeting>;
  joinExistingMeeting: (roomName: string, requestApproval?: boolean) => Promise<void>;
  fetchMeetingInfo: (roomName: string) => Promise<void>;
  endMeeting: () => Promise<void>;
}

const IDLE_STATE = {
  isInMeeting: false,
  token: null,
  roomName: null,
  isHost: false,
  meetingStatus: 'idle' as MeetViewStatus,
  preferredCameraEnabled: true,
  preferredMicEnabled: true,
  isMinimized: false,
  callStatus: 'idle' as const,
  waitingRoom: [] as WaitingRoomParticipant[],
  participantCount: 0,
  rejectedReason: null as RejectedReason,
  currentMeeting: null as Meeting | null,
  isLoadingMeeting: false,
};

const toCallStatus = (status: MeetViewStatus): MeetCallStatus => {
  if (status === 'waiting') return 'waiting';
  if (status === 'rejected') return 'rejected';
  return 'idle';
};

const normalizeRoomName = (value: string) => String(value || '').trim().toLowerCase();

export const useMeetStore = create<MeetState>((set, get) => ({
  ...IDLE_STATE,

  joinMeeting: (token, roomName, isHost = false, initialWaitingRoom = []) =>
    set((state) => ({
      isInMeeting: true,
      token,
      roomName: normalizeRoomName(roomName),
      isHost,
      preferredCameraEnabled: state.preferredCameraEnabled,
      preferredMicEnabled: state.preferredMicEnabled,
      isMinimized: false,
      meetingStatus: 'active',
      callStatus: 'idle',
      waitingRoom: initialWaitingRoom,
      participantCount: 0,
      rejectedReason: null,
      isLoadingMeeting: false,
    })),

  leaveMeeting: () => {
    const { callStatus, roomName } = get();

    // Chỉ hủy yêu cầu chờ khi đang ở trạng thái waiting.
    if (callStatus === 'waiting' && roomName) {
      get().cancelWaiting(roomName);
    }

    set((state) => ({
      ...IDLE_STATE,
      preferredCameraEnabled: state.preferredCameraEnabled,
      preferredMicEnabled: state.preferredMicEnabled,
    }));
  },

  leaveAndReset: () => {
    get().leaveMeeting();
  },

  setMinimized: (v) => set({ isMinimized: v }),

  maximize: () => set({ isMinimized: false }),

  setCallStatus: (status) => set({
    callStatus: status,
    meetingStatus: status === 'waiting' || status === 'rejected' ? status : get().meetingStatus,
  }),

  setMeetingStatus: (status) => set({
    meetingStatus: status,
    callStatus: toCallStatus(status),
  }),

  setWaitingRoom: (waitingRoom) => set({ waitingRoom }),

  setParticipantCount: (n) => set({ participantCount: Math.max(0, Number(n) || 0) }),

  setRejectedReason: (reason) => set({ rejectedReason: reason }),

  setJoinPreferences: ({ cameraEnabled, micEnabled }) => set({
    preferredCameraEnabled: Boolean(cameraEnabled),
    preferredMicEnabled: Boolean(micEnabled),
  }),

  admitParticipant: (roomName, targetUserId) => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !roomName || !targetUserId) return;

    socket.emit('admit-participant', {
      roomName,
      targetUserId,
    });
  },

  rejectParticipant: (roomName, targetUserId) => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !roomName || !targetUserId) return;

    socket.emit('reject-participant', {
      roomName,
      targetUserId,
    });
  },

  admitAllParticipants: (roomName) => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !roomName) return;

    socket.emit('admit-all-participants', {
      roomName,
    });
  },

  cancelWaiting: (roomName) => {
    const socket = useSocketStore.getState().socket;
    const targetRoomName = roomName || get().roomName;
    if (!socket || !targetRoomName) return;

    socket.emit('cancel-waiting', {
      roomName: targetRoomName,
    });
  },

  handleMeetingEnded: () => {
    get().setRejectedReason('meeting-ended');
    get().leaveMeeting();
  },

  handleRejected: (reason) => {
    set({
      meetingStatus: 'rejected',
      callStatus: 'rejected',
      rejectedReason: reason,
      isLoadingMeeting: false,
    });
  },

  createMeeting: async (options) => {
    set({ isLoadingMeeting: true });
    try {
      const { meeting, token } = await meetingService.create(options ?? {});
      set({
        currentMeeting: meeting,
        isLoadingMeeting: false,
      });

      if (token && typeof token === 'string') {
        set({
          token: token,
          roomName: meeting.roomName,
          isHost: true,
          meetingStatus: 'preview',
          callStatus: 'idle',
          rejectedReason: null,
        });
      }

      return meeting;
    } catch (error) {
      set({ isLoadingMeeting: false });
      throw error;
    }
  },

  joinExistingMeeting: async (roomName: string, requestApproval = false) => {
    const normalizedRoomName = normalizeRoomName(roomName);
    set({
      isLoadingMeeting: true,
      rejectedReason: null,
      token: null,
      isHost: false,
    });

    try {
      const result = await meetingService.join(normalizedRoomName, { requestApproval });

      set({
        isLoadingMeeting: false,
        roomName: normalizedRoomName,
      });

      if (result.token && typeof result.token === 'string') {
        set({
          token: result.token,
          isHost: !!result.isHost,
          meetingStatus: 'preview',
          callStatus: 'idle',
          waitingRoom: result.waitingRoom || [],
        });
      } else if (result.token && typeof result.token !== 'string') {
        console.error('[MeetStore] Received token is not a string:', result.token);
        set({
          token: String((result.token as any).token || result.token),
          isHost: !!result.isHost,
          meetingStatus: 'preview',
          callStatus: 'idle',
          waitingRoom: result.waitingRoom || [],
        });
      } else if (result.status === 'waiting') {
        set({
          token: null,
          meetingStatus: 'waiting',
          callStatus: 'waiting',
        });
      } else if (result.status === 'needs_approval') {
        set({
          token: null,
          isHost: false,
          meetingStatus: 'preview',
          callStatus: 'idle',
        });
      }
    } catch (error) {
      set({ isLoadingMeeting: false });
      throw error;
    }
  },

  fetchMeetingInfo: async (roomName) => {
    const meeting = await meetingService.get(normalizeRoomName(roomName));
    set({ currentMeeting: meeting });
  },

  endMeeting: async () => {
    const { roomName } = get();
    if (!roomName) return;

    await meetingService.end(roomName);
  },
}));
