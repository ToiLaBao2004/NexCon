import { create } from 'zustand';

interface MeetState {
  isInMeeting: boolean;
  setIsInMeeting: (v: boolean) => void;
}

export const useMeetStore = create<MeetState>((set) => ({
  isInMeeting: false,
  setIsInMeeting: (v) => set({ isInMeeting: v }),
}));
