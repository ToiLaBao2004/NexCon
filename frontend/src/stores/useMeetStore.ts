import { create } from 'zustand';
import { useSocketStore } from './useSocketStore';

export type MeetCallStatus = 'idle' | 'waiting' | 'rejected';

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
  preferredCameraEnabled: boolean;
  preferredMicEnabled: boolean;
  isMinimized: boolean;
  callStatus: MeetCallStatus;
  waitingRoom: WaitingRoomParticipant[];
  participantCount: number;
  rejectedReason: string | null;

  joinMeeting: (token: string, roomName: string, isHost?: boolean, initialWaitingRoom?: WaitingRoomParticipant[]) => void;
  leaveMeeting: () => void;
  setMinimized: (v: boolean) => void;
  maximize: () => void;
  setCallStatus: (status: MeetCallStatus) => void;
  setWaitingRoom: (waitingRoom: WaitingRoomParticipant[]) => void;
  setParticipantCount: (n: number) => void;
  setRejectedReason: (reason: string | null) => void;
  setJoinPreferences: (prefs: { cameraEnabled: boolean; micEnabled: boolean }) => void;
  admitParticipant: (roomName: string, targetUserId: string) => void;
  rejectParticipant: (roomName: string, targetUserId: string) => void;
  admitAllParticipants: (roomName: string) => void;
  cancelWaiting: (roomName?: string) => void;
}

const IDLE_STATE = {
  isInMeeting: false,
  token: null,
  roomName: null,
  isHost: false,
  preferredCameraEnabled: true,
  preferredMicEnabled: true,
  isMinimized: false,
  callStatus: 'idle' as const,
  waitingRoom: [] as WaitingRoomParticipant[],
  participantCount: 0,
  rejectedReason: null,
};

export const useMeetStore = create<MeetState>((set, get) => ({
  ...IDLE_STATE,

  joinMeeting: (token, roomName, isHost = false, initialWaitingRoom = []) =>
    set((state) => ({
      isInMeeting: true,
      token,
      roomName,
      isHost,
      preferredCameraEnabled: state.preferredCameraEnabled,
      preferredMicEnabled: state.preferredMicEnabled,
      isMinimized: false,
      callStatus: 'idle',
      waitingRoom: initialWaitingRoom,
      participantCount: 0,
      rejectedReason: null,
    })),

  leaveMeeting: () => {
    const { callStatus, roomName } = get();

    // Chỉ hủy yêu cầu chờ khi đang ở trạng thái waiting.
    if (callStatus === 'waiting' && roomName) {
      get().cancelWaiting(roomName);
    }

    set({ ...IDLE_STATE });
  },

  setMinimized: (v) => set({ isMinimized: v }),

  maximize: () => set({ isMinimized: false }),

  setCallStatus: (status) => set({ callStatus: status }),

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
}));
