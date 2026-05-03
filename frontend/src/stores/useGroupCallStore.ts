import { create } from "zustand";
import { useSocketStore } from "./useSocketStore";
import { useCallStore } from "./useCallStore";
import { useChatStore } from "./useChatStore";
import { playRingtone, stopRingtone } from "@/utils/sound";
import { toast } from "sonner";
import type { GroupCallState } from "@/types/store";

const IDLE_STATE = {
  status: "idle" as const,
  conversationId: null,
  callId: null,
  callType: null,
  token: null,
  initiator: null,
  groupName: null,
  participants: [],
};

export const useGroupCallStore = create<GroupCallState>((set, get) => ({
  ...IDLE_STATE,
  hasLeftActiveCall: {},

  startGroupCall(conversationId, callType) {
    const socket = useSocketStore.getState().socket;
    if (!socket || get().status !== "idle") return;
    set({ status: "outgoing", conversationId, callType });
    socket.emit("group-call:start", { conversationId, callType });
  },

  joinGroupCall(conversationId) {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    stopRingtone();
    set({ status: "joining", conversationId });
    socket.emit("group-call:join", { conversationId });
  },

  declineGroupCall(conversationId) {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    stopRingtone();
    socket.emit("group-call:decline", { conversationId });
    if (
      get().conversationId === conversationId &&
      get().status === "incoming"
    ) {
      set((state) => ({
        ...IDLE_STATE,
        hasLeftActiveCall: {
          ...state.hasLeftActiveCall,
          [conversationId]: true,
        },
      }));
    }
  },

  leaveGroupCall() {
    const { conversationId } = get();
    const socket = useSocketStore.getState().socket;
    if (!socket || !conversationId) return;
    socket.emit("group-call:leave", { conversationId });
    set((state) => ({
      ...IDLE_STATE,
      hasLeftActiveCall: {
        ...state.hasLeftActiveCall,
        [conversationId]: true,
      },
    }));
  },

  rejoinGroupCall(conversationId) {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    const convo = useChatStore
      .getState()
      .conversations.find((c) => c._id === conversationId);
    const groupName = convo?.group?.name || null;
    set({ status: "joining", conversationId, groupName });
    socket.emit("group-call:join", { conversationId });
  },

  checkGroupCallStatus(conversationId) {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.emit("group-call:status", { conversationId });
  },

  // Socket handlers

  handleGroupCallStarted(payload) {
    set({
      status: "outgoing",
      conversationId: payload.conversationId,
      callId: payload.callId,
      callType: payload.callType,
      token: payload.token,
      initiator: payload.initiator,
      groupName: payload.groupName,
      participants: payload.participants,
    });
  },

  handleGroupCallIncoming(payload, isMutedCall: boolean = false) {
    const current = get().status;
    const p2pStatus = useCallStore.getState().status;
    if (current !== "idle" || p2pStatus !== "idle") return;

    if (!isMutedCall) {
      playRingtone();
    }
    set({
      status: "incoming",
      conversationId: payload.conversationId,
      callId: payload.callId,
      callType: payload.callType,
      initiator: payload.initiator,
      groupName: payload.groupName,
      participants: payload.participants,
      isMutedCall,
    });
  },

  handleGroupCallToken(payload) {
    set((state) => {
      const next = { ...state.hasLeftActiveCall };
      delete next[payload.conversationId];
      return {
        status: "active" as const,
        token: payload.token,
        hasLeftActiveCall: next,
      };
    });
  },

  handleGroupCallUserJoined(payload) {
    if (get().conversationId === payload.conversationId) {
      if (get().status === "outgoing") {
        set({ status: "active", participants: payload.participants });
      } else {
        set({ participants: payload.participants });
      }
    }
  },

  handleGroupCallUserDeclined(payload) {
    if (get().conversationId === payload.conversationId) {
      set({ participants: payload.participants });
    }
  },

  handleGroupCallUserLeft(payload) {
    if (get().conversationId === payload.conversationId) {
      set({ participants: payload.participants });
    }
  },

  handleGroupCallAnsweredOnOtherDevice(payload) {
    stopRingtone();

    set((state) => {
      const next = { ...state.hasLeftActiveCall };
      delete next[payload.conversationId];

      if (state.conversationId === payload.conversationId && state.status !== "active") {
        return {
          ...IDLE_STATE,
          hasLeftActiveCall: next,
        };
      }

      return { hasLeftActiveCall: next };
    });
  },

  handleGroupCallDeclinedOnOtherDevice(payload) {
    stopRingtone();

    set((state) => {
      const next = {
        ...state.hasLeftActiveCall,
        [payload.conversationId]: true,
      };

      if (state.conversationId === payload.conversationId && state.status !== "active") {
        return {
          ...IDLE_STATE,
          hasLeftActiveCall: next,
        };
      }

      return { hasLeftActiveCall: next };
    });
  },

  handleGroupCallEnded(payload) {
    stopRingtone();

    set((state) => {
      const next = { ...state.hasLeftActiveCall };
      delete next[payload.conversationId];

      if (
        state.conversationId === payload.conversationId ||
        state.status === "incoming"
      ) {
        return {
          ...IDLE_STATE,
          hasLeftActiveCall: next,
        };
      }
      return { hasLeftActiveCall: next };
    });

    useChatStore.getState().fetchConversations();
  },

  handleGroupCallStatusResponse(payload) {
    if (payload.active) {
      set((state) => ({
        hasLeftActiveCall: {
          ...state.hasLeftActiveCall,
          [payload.conversationId]: true,
        },
      }));
    } else {
      set((state) => {
        const next = { ...state.hasLeftActiveCall };
        delete next[payload.conversationId];
        return { hasLeftActiveCall: next };
      });
    }
  },

  handleGroupCallError(payload) {
    toast.error(`Lỗi cuộc gọi nhóm: ${payload.reason}`);
    const s = get().status;
    if (s === "outgoing" || s === "joining") {
      set({ ...IDLE_STATE });
    }
  },

  reset() {
    stopRingtone();
    set({ ...IDLE_STATE, hasLeftActiveCall: {} });
  },
}));
