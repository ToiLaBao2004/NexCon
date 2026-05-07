import { create } from "zustand";
import { useSocketStore } from "./useSocketStore";
import { useChatStore } from "./useChatStore";
import { playRingtone, stopRingtone } from "@/utils/sound";
import { toast } from "sonner";
import type { GroupCallState, PendingIncomingGroupCall } from "@/types/store";

const IDLE_STATE = {
  status: "idle" as const,
  conversationId: null,
  callId: null,
  callType: null,
  token: null,
  initiator: null,
  groupName: null,
  participants: [],
  pendingIncomingCall: null,
};

function toPendingIncomingGroupCall(
  payload: Omit<PendingIncomingGroupCall, "isMutedCall">,
  isMutedCall: boolean,
): PendingIncomingGroupCall {
  return { ...payload, isMutedCall };
}

async function leaveDirectCallForSwitch() {
  const { useCallStore } = await import("./useCallStore");
  const callState = useCallStore.getState();
  if (callState.status === "idle") return;

  if (callState.status === "incoming") {
    callState.rejectCall();
  } else {
    callState.handleCancelCall();
  }
}

export const useGroupCallStore = create<GroupCallState>((set, get) => ({
  ...IDLE_STATE,
  hasLeftActiveCall: {},

  async startGroupCall(conversationId, callType) {
    const socket = useSocketStore.getState().socket;
    if (!socket || get().status !== "idle") return;
    const { useCallStore } = await import("./useCallStore");
    if (useCallStore.getState().status !== "idle") {
      toast.error("Bạn đang trong một cuộc gọi khác.");
      return;
    }
    set({ status: "outgoing", conversationId, callType });
    socket.emit("group-call:start", { conversationId, callType });
  },

  async joinGroupCall(conversationId) {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    await leaveDirectCallForSwitch();
    stopRingtone();
    set({ status: "joining", conversationId });
    socket.emit("group-call:join", { conversationId });
  },

  async joinPendingGroupCall() {
    const socket = useSocketStore.getState().socket;
    const pending = get().pendingIncomingCall;
    if (!socket || !pending) return;

    const current = get();
    if (current.conversationId && current.conversationId !== pending.conversationId) {
      socket.emit(
        current.status === "incoming" ? "group-call:decline" : "group-call:leave",
        { conversationId: current.conversationId },
      );
    }

    await leaveDirectCallForSwitch();
    stopRingtone();
    set({
      ...IDLE_STATE,
      status: "joining",
      conversationId: pending.conversationId,
      callId: pending.callId,
      callType: pending.callType,
      initiator: pending.initiator,
      groupName: pending.groupName,
      participants: pending.participants,
      pendingIncomingCall: null,
      hasLeftActiveCall: current.hasLeftActiveCall,
    });
    socket.emit("group-call:join", { conversationId: pending.conversationId });
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
    if (current !== "idle") {
      if (get().conversationId !== payload.conversationId) {
        set({
          pendingIncomingCall: toPendingIncomingGroupCall(payload, isMutedCall),
        });
        if (!isMutedCall) {
          playRingtone();
        }
      }
      return;
    }

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

  declinePendingGroupCall() {
    const socket = useSocketStore.getState().socket;
    const pending = get().pendingIncomingCall;
    if (!socket || !pending) return;

    stopRingtone();
    socket.emit("group-call:decline", { conversationId: pending.conversationId });
    set({ pendingIncomingCall: null });
  },

  handleGroupCallAnsweredOnOtherDevice(payload) {
    stopRingtone();

    set((state) => {
      const next = { ...state.hasLeftActiveCall };
      delete next[payload.conversationId];

      if (state.pendingIncomingCall?.conversationId === payload.conversationId) {
        return {
          pendingIncomingCall: null,
          hasLeftActiveCall: next,
        };
      }

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

      if (state.pendingIncomingCall?.conversationId === payload.conversationId) {
        return {
          pendingIncomingCall: null,
          hasLeftActiveCall: next,
        };
      }

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

      if (state.pendingIncomingCall?.conversationId === payload.conversationId) {
        return {
          pendingIncomingCall: null,
          hasLeftActiveCall: next,
        };
      }

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
    if (payload.active && payload.joinedByCurrentUser) {
      set((state) => {
        const next = { ...state.hasLeftActiveCall };
        delete next[payload.conversationId];
        return { hasLeftActiveCall: next };
      });
    } else if (payload.active) {
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
    const reasonMap: Record<string, string> = {
      "already-active": "Nhóm này đang có cuộc gọi.",
      "already-in-call": "Bạn đang trong một cuộc gọi khác.",
      "rate-limited": "Bạn thao tác quá nhanh, vui lòng thử lại sau.",
      "not-a-group": "Không tìm thấy nhóm.",
      "not-a-member": "Bạn không còn là thành viên nhóm.",
      "group-disbanded": "Nhóm đã bị giải tán.",
      "server-error": "Lỗi hệ thống. Vui lòng thử lại.",
    };
    toast.error(`Lỗi cuộc gọi nhóm: ${reasonMap[payload.reason] ?? payload.reason}`);
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
