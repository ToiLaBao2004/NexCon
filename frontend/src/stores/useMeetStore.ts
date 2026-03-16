import { create } from 'zustand';

interface MeetState {
  isInMeeting: boolean;
  token: string | null;
  roomName: string | null;
  roomLabel: string | null;
  isMinimized: boolean;

  joinMeeting: (token: string, roomName: string, roomLabel: string) => void;
  leaveMeeting: () => void;
  setMinimized: (v: boolean) => void;
  maximize: () => void;
}

const IDLE_STATE = {
  isInMeeting: false,
  token: null,
  roomName: null,
  roomLabel: null,
  isMinimized: false,
};

export const useMeetStore = create<MeetState>((set) => ({
  ...IDLE_STATE,

  joinMeeting: (token, roomName, roomLabel) =>
    set({
      isInMeeting: true,
      token,
      roomName,
      roomLabel: roomLabel || null,
      isMinimized: false,
    }),

  leaveMeeting: () => set({ ...IDLE_STATE }),

  setMinimized: (v) => set({ isMinimized: v }),

  maximize: () => set({ isMinimized: false }),
}));
