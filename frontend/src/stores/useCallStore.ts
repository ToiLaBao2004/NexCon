import { create } from "zustand";
import { useSocketStore } from "./useSocketStore";
import type { CallState, CallType, DirectCallEventPayload, PendingIncomingCall, RemoteUser } from "@/types/store";
import { toast } from "sonner";
import {
  playCallerRingingRingtone,
  playCallerWaitingRingtone,
  playRingtone,
  stopRingtone,
} from "@/utils/sound";
import { Room, RoomEvent, Track } from "livekit-client";

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
const CALL_NO_ANSWER_FALLBACK_MS = 35_000;
const LIVEKIT_CONNECT_OPTIONS = {
  autoSubscribe: true,
  maxRetries: 5,
  websocketTimeout: 20_000,
  peerConnectionTimeout: 20_000,
};

function emitCallEvent(event: string, payload?: object) {
  useSocketStore.getState().socket?.emit(event, payload);
}

function buildDirectCallPayload(toUserId: string, roomName?: string | null) {
  return roomName ? { toUserId, roomName } : { toUserId };
}
// Trạng thái rảnh. Dùng để reset store về ban đầu sau khi kết thúc cuộc gọi.
const IDLE_STATE = {
  status: "idle" as const,
  callType: null,
  remoteUser: null,
  localStream: null,
  remoteStream: null,
  isConnecting: false,
  isRemoteConnecting: false,
  _livekitRoom: null,
  _roomName: null,
  _token: null,
  _joinAttemptId: 0,
  _callTimeout: null,
  isMuted: false,
  isVideoOff: false,
  isRemoteVideoOff: false,
  isMutedCall: false,
  pendingIncomingCall: null,
  pendingIncomingQueue: [],
};

function cleanup(get: () => CallState) {
  const { localStream, _livekitRoom, _callTimeout } = get();
  localStream?.getTracks().forEach((t) => t.stop()); // Stop camera/mic
  if (_livekitRoom) {
    _livekitRoom.removeAllListeners();
    _livekitRoom.disconnect(true);
  }
  if (_callTimeout) clearTimeout(_callTimeout);
}

function teardownRoom(room: Room) {
  room.removeAllListeners();
  room.disconnect(true);
}

function getPendingIncomingCalls(state: CallState) {
  return [
    ...(state.pendingIncomingCall ? [state.pendingIncomingCall] : []),
    ...state.pendingIncomingQueue,
  ];
}

function resetToIdle(
  set: (partial: Partial<CallState>) => void,
  get: () => CallState,
) {
  const state = get();
  const nextJoinAttemptId = state._joinAttemptId + 1;
  const [nextIncomingCall, ...remainingIncomingCalls] = getPendingIncomingCalls(state);
  cleanup(get);
  stopRingtone();

  if (nextIncomingCall) {
    const [pendingIncomingCall, ...pendingIncomingQueue] = remainingIncomingCalls;
    set({
      ...IDLE_STATE,
      status: "incoming",
      callType: nextIncomingCall.callType,
      remoteUser: nextIncomingCall.from,
      _roomName: nextIncomingCall.roomName,
      _joinAttemptId: nextJoinAttemptId,
      isMutedCall: nextIncomingCall.isMutedCall,
      isVideoOff: nextIncomingCall.callType === "voice",
      pendingIncomingCall: pendingIncomingCall ?? null,
      pendingIncomingQueue,
    });

    if (!nextIncomingCall.isMutedCall) {
      void playRingtone();
    }
    return;
  }

  set({ ...IDLE_STATE, _joinAttemptId: nextJoinAttemptId });
}

function isJoinAttemptCancelled(get: () => CallState, attemptId: number) {
  const state = get();
  return state._joinAttemptId !== attemptId || state.status === "idle";
}

function samePendingIncomingCall(
  pending: PendingIncomingCall | null,
  from: RemoteUser,
  roomName: string,
) {
  return Boolean(
    pending &&
    pending.roomName === roomName &&
    pending.from._id?.toString() === from._id?.toString(),
  );
}

function samePendingCall(a: PendingIncomingCall, b: PendingIncomingCall) {
  return a.roomName === b.roomName && a.from._id?.toString() === b.from._id?.toString();
}

function enqueuePendingIncomingCall(
  set: (partial: Partial<CallState>) => void,
  get: () => CallState,
  incoming: PendingIncomingCall,
) {
  const state = get();
  if (!state.pendingIncomingCall) {
    set({ pendingIncomingCall: incoming });
    return;
  }

  if (samePendingCall(state.pendingIncomingCall, incoming)) {
    set({ pendingIncomingCall: incoming });
    return;
  }

  const pendingIncomingQueue = [...state.pendingIncomingQueue];
  const existingIndex = pendingIncomingQueue.findIndex((item) => samePendingCall(item, incoming));
  if (existingIndex >= 0) {
    pendingIncomingQueue[existingIndex] = incoming;
  } else {
    pendingIncomingQueue.push(incoming);
  }
  set({ pendingIncomingQueue });
}

function setPendingIncomingCalls(
  set: (partial: Partial<CallState>) => void,
  pendingCalls: PendingIncomingCall[],
) {
  const [pendingIncomingCall, ...pendingIncomingQueue] = pendingCalls;
  set({
    pendingIncomingCall: pendingIncomingCall ?? null,
    pendingIncomingQueue,
  });
}

function findPendingIncomingCall(state: CallState, roomName: string) {
  return getPendingIncomingCalls(state).find((pending) => pending.roomName === roomName) ?? null;
}

function rejectPendingIncomingCalls(pendingCalls: PendingIncomingCall[]) {
  pendingCalls.forEach((pending) => {
    if (pending.from._id) {
      emitCallEvent("call-rejected", buildDirectCallPayload(pending.from._id, pending.roomName));
    }
  });
}

function shouldKeepRingtoneAfterPendingChange(state: CallState) {
  if (state.status === "incoming" && !state.isMutedCall) return true;
  return getPendingIncomingCalls(state).some((pending) => !pending.isMutedCall);
}

function maybeStopRingtoneAfterPendingChange(get: () => CallState) {
  if (!shouldKeepRingtoneAfterPendingChange(get())) {
    stopRingtone();
  }
}

function clearPendingIncomingCallByPayload(
  set: (partial: Partial<CallState>) => void,
  get: () => CallState,
  payload?: DirectCallEventPayload,
) {
  const state = get();
  const matchesPayload = (pending: PendingIncomingCall) => payloadMatchesPendingCall(pending, payload);
  const pendingIncomingQueue = state.pendingIncomingQueue.filter((pending) => !matchesPayload(pending));

  if (state.pendingIncomingCall && matchesPayload(state.pendingIncomingCall)) {
    const [nextPending, ...remainingQueue] = pendingIncomingQueue;
    set({
      pendingIncomingCall: nextPending ?? null,
      pendingIncomingQueue: remainingQueue,
    });
    return;
  }

  set({ pendingIncomingQueue });
}

function payloadMatchesCurrentCall(state: CallState, payload?: DirectCallEventPayload) {
  if (!payload) return true;
  if (payload.roomName && state._roomName) {
    return String(payload.roomName) === String(state._roomName);
  }

  const remoteId = state.remoteUser?._id?.toString();
  if (!remoteId) return true;

  const participantIds = [payload.callerId, payload.receiverId]
    .filter(Boolean)
    .map((id) => String(id));
  if (participantIds.length > 0) {
    return participantIds.includes(remoteId);
  }

  const byId = payload.by?._id?.toString();
  return !byId || byId === remoteId;
}

function payloadMatchesPendingCall(pending: PendingIncomingCall | null, payload?: DirectCallEventPayload) {
  if (!pending || !payload) return false;
  if (payload.roomName) {
    return String(payload.roomName) === String(pending.roomName);
  }

  const fromId = pending.from._id?.toString();
  return [payload.callerId, payload.receiverId, payload.by?._id]
    .filter(Boolean)
    .map((id) => String(id))
    .includes(fromId);
}

function clearCurrentCallBeforeAcceptingPending(
  get: () => CallState,
) {
  const state = get();

  if (state.remoteUser?._id && state.status !== "idle") {
    const eventName =
      state.status === "active"
        ? "leave-call"
        : state.status === "incoming"
          ? "call-rejected"
          : "call-cancelled";
    emitCallEvent(eventName, buildDirectCallPayload(state.remoteUser._id, state._roomName));
  }

  cleanup(get);
}

async function ensureMediaPermission(callType: CallType) {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast.error("Trình duyệt không hỗ trợ truy cập micro/camera.");
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === "video",
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.error("Media permission failed:", error);
    toast.error("Vui lòng cấp quyền micro/camera cho trình duyệt rồi thử lại.");
    return false;
  }
}

async function leaveGroupCallForSwitch() {
  const { useGroupCallStore } = await import("./useGroupCallStore");
  const groupCallState = useGroupCallStore.getState();
  if (groupCallState.status === "idle" || !groupCallState.conversationId) return;

  if (groupCallState.status === "incoming") {
    groupCallState.declineGroupCall(groupCallState.conversationId);
  } else {
    groupCallState.leaveGroupCall();
  }
}

function buildLocalMediaStream(room: Room) {
  const stream = new MediaStream();
  room.localParticipant.trackPublications.forEach((pub) => {
    if (!pub.track) return;
    if (
      pub.track.source === Track.Source.Microphone ||
      pub.track.source === Track.Source.Camera
    ) {
      stream.addTrack(pub.track.mediaStreamTrack);
    }
  });
  return stream;
}

async function connectLiveKitRoom(
  token: string,
  roomName: string,
  callType: CallType,
  attemptId: number,
  set: (partial: Partial<CallState>) => void,
  get: () => CallState,
) {
  const room = new Room();
  const remoteMediaStream = new MediaStream();
  let hasSignaledConnected = false;

  const isCancelled = () => isJoinAttemptCancelled(get, attemptId);
  const signalLiveKitConnected = () => {
    if (hasSignaledConnected || isCancelled()) return;

    const remoteUserId = get().remoteUser?._id;
    if (!remoteUserId) return;

    emitCallEvent("call-connected", buildDirectCallPayload(remoteUserId, roomName));
    hasSignaledConnected = true;
  };

  const syncRemoteVideoState = () => {
    if (isCancelled()) return;

    const firstRemote = Array.from(room.remoteParticipants.values())[0];
    if (!firstRemote) {
      set({ remoteStream: null, isRemoteVideoOff: false });
      return;
    }
    const cameraPub = firstRemote.getTrackPublication(Track.Source.Camera);
    set({
      isRemoteVideoOff: !cameraPub || cameraPub.isMuted,
    });
  };

  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (isCancelled()) return;
    if (participant.isLocal) return;

    signalLiveKitConnected();
    if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;
    remoteMediaStream.addTrack(track.mediaStreamTrack);
    set({ remoteStream: new MediaStream(remoteMediaStream.getTracks()) });
    if (publication.source === Track.Source.Camera) {
      syncRemoteVideoState();
    }
  });

  room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    if (isCancelled()) return;
    if (participant.isLocal) return;
    remoteMediaStream.removeTrack(track.mediaStreamTrack);
    set({ remoteStream: new MediaStream(remoteMediaStream.getTracks()) });
    if (publication.source === Track.Source.Camera) {
      syncRemoteVideoState();
    }
  });

  room.on(RoomEvent.TrackMuted, (_publication, participant) => {
    if (isCancelled()) return;
    if (!participant.isLocal) {
      syncRemoteVideoState();
    }
  });

  room.on(RoomEvent.TrackUnmuted, (_publication, participant) => {
    if (isCancelled()) return;
    if (!participant.isLocal) {
      syncRemoteVideoState();
    }
  });

  room.on(RoomEvent.ParticipantDisconnected, () => {
    if (isCancelled()) return;
    syncRemoteVideoState();
  });

  room.on(RoomEvent.ParticipantConnected, () => {
    if (isCancelled()) return;
    signalLiveKitConnected();
    syncRemoteVideoState();
  });

  room.on(RoomEvent.Disconnected, () => {
    const state = get();
    if (state.status !== "idle" && !state.isConnecting && !isCancelled()) {
      state.handleCancelCall();
      toast.error("Kết nối bị gián đoạn.");
    }
  });

  await room.connect(LIVEKIT_URL, token, LIVEKIT_CONNECT_OPTIONS);
  if (isCancelled()) {
    teardownRoom(room);
    return false;
  }

  await room.localParticipant.setMicrophoneEnabled(true);
  if (isCancelled()) {
    teardownRoom(room);
    return false;
  }

  await room.localParticipant.setCameraEnabled(callType === "video");
  if (isCancelled()) {
    teardownRoom(room);
    return false;
  }

  if (room.remoteParticipants.size > 0) {
    signalLiveKitConnected();
  }

  const localStream = buildLocalMediaStream(room);
  syncRemoteVideoState();

  set({
    status: "active",
    _livekitRoom: room,
    _roomName: roomName,
    _token: token,
    localStream,
    remoteStream: remoteMediaStream.getTracks().length
      ? new MediaStream(remoteMediaStream.getTracks())
      : null,
    isConnecting: false,
    isRemoteConnecting: false,
    isMuted: false,
    isVideoOff: callType === "voice",
  });
  stopRingtone();

  return true;
}

export const useCallStore = create<CallState>((set, get) => ({
  ...IDLE_STATE,
  isMuted: false,
  isVideoOff: false,

  // Initiator: A starts a call
  async startCall(toUser: RemoteUser, callType: CallType) {
    if (get().status !== "idle") return;
    const { useGroupCallStore } = await import("./useGroupCallStore");
    if (useGroupCallStore.getState().status !== "idle") {
      toast.error("Bạn đang trong một cuộc gọi khác.");
      return;
    }

    const hasPermission = await ensureMediaPermission(callType);
    if (!hasPermission || get().status !== "idle") return;

    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      timeout = setTimeout(() => {
        if (get().status === "outgoing") {
          const { remoteUser: currentRemoteUser, _roomName } = get();
          const remoteUserId = currentRemoteUser?._id;
          if (remoteUserId) {
            emitCallEvent("call-cancelled", buildDirectCallPayload(remoteUserId, _roomName));
          }
          get().handleCallFailed("no-answer");
        }
      }, CALL_NO_ANSWER_FALLBACK_MS);

      set({
        status: "outgoing",
        callType,
        remoteUser: toUser,
        remoteStream: null,
        _callTimeout: timeout,
        isConnecting: false,
        isRemoteConnecting: false,
        isMuted: false,
        isVideoOff: callType === "voice",
      });

      void playCallerWaitingRingtone();
      emitCallEvent("call-offer", { toUserId: toUser._id, callType });
      // Refresh sidebar
      const { useChatStore } = await import("./useChatStore");
      useChatStore.getState().fetchConversations();
    } catch (error) {
      console.error("Start call failed:", error);
      if (timeout) clearTimeout(timeout);
      toast.error(
        "Không thể thiết lập cuộc gọi. Hãy kiểm tra thiết bị của bạn.",
      );
    }
  },

  // Receiver: B accepts the incoming call
  async acceptCall() {
    const { remoteUser, isConnecting, callType, _roomName } = get();
    if (!remoteUser || isConnecting || !callType) return;

    set({ isConnecting: true });
    const hasPermission = await ensureMediaPermission(callType);
    const latest = get();
    if (!hasPermission) {
      if (latest.status === "incoming" && latest._roomName === _roomName) {
        set({ isConnecting: false });
      }
      return;
    }

    if (
      latest.status !== "incoming" ||
      latest.remoteUser?._id !== remoteUser._id ||
      latest._roomName !== _roomName
    ) {
      return;
    }

    rejectPendingIncomingCalls(getPendingIncomingCalls(latest));
    await leaveGroupCallForSwitch();
    set({ pendingIncomingCall: null, pendingIncomingQueue: [], isConnecting: true });
    emitCallEvent("accept-call", buildDirectCallPayload(remoteUser._id, _roomName));
    emitCallEvent("call-answer", buildDirectCallPayload(remoteUser._id, _roomName));
    stopRingtone();
  },

  async acceptPendingIncomingCall() {
    const pending = get().pendingIncomingCall;
    if (!pending) return;

    await get().acceptQueuedIncomingCall(pending.roomName);
  },

  async acceptQueuedIncomingCall(roomName: string) {
    const current = get();
    const pending = findPendingIncomingCall(current, roomName);
    if (!pending || get().isConnecting) return;

    const hasPermission = await ensureMediaPermission(pending.callType);
    if (!hasPermission) return;

    const latest = get();
    const latestPending = findPendingIncomingCall(latest, roomName);
    if (!latestPending || !samePendingCall(latestPending, pending) || latest.isConnecting) return;

    const pendingCallsToReject = getPendingIncomingCalls(latest).filter(
      (item) => !samePendingCall(item, pending),
    );

    if (latest.status !== "idle") {
      clearCurrentCallBeforeAcceptingPending(get);
    }
    await leaveGroupCallForSwitch();

    set({
      status: "incoming",
      callType: pending.callType,
      remoteUser: pending.from,
      localStream: null,
      remoteStream: null,
      _livekitRoom: null,
      _roomName: pending.roomName,
      _token: null,
      _callTimeout: null,
      _joinAttemptId: latest._joinAttemptId + 1,
      pendingIncomingCall: null,
      pendingIncomingQueue: [],
      isConnecting: true,
      isRemoteConnecting: false,
      isMutedCall: pending.isMutedCall,
      isMuted: false,
      isVideoOff: pending.callType === "voice",
      isRemoteVideoOff: false,
    });

    rejectPendingIncomingCalls(pendingCallsToReject);
    emitCallEvent("accept-call", buildDirectCallPayload(pending.from._id, pending.roomName));
    emitCallEvent("call-answer", buildDirectCallPayload(pending.from._id, pending.roomName));
    stopRingtone();
  },

  handleCancelCall() {
    const { remoteUser, status, _roomName } = get();
    if (status === "idle") return;

    if (remoteUser?._id) {
      const eventName = status === "active" ? "leave-call" : "call-cancelled";
      emitCallEvent(eventName, buildDirectCallPayload(remoteUser._id, _roomName));
    }

    resetToIdle(set, get);
  },

  // Receiver: B rejects the incoming call
  rejectCall() {
    const { remoteUser, status, _roomName } = get();
    if (status === "incoming" && remoteUser?._id) {
      emitCallEvent("call-rejected", buildDirectCallPayload(remoteUser._id, _roomName));
      resetToIdle(set, get);
      return;
    }

    get().handleCancelCall();
  },

  rejectPendingIncomingCall() {
    const pending = get().pendingIncomingCall;
    if (!pending) return;

    get().rejectQueuedIncomingCall(pending.roomName);
  },

  rejectQueuedIncomingCall(roomName: string) {
    const current = get();
    const pending = findPendingIncomingCall(current, roomName);
    if (!pending) return;

    emitCallEvent("call-rejected", buildDirectCallPayload(pending.from._id, pending.roomName));
    setPendingIncomingCalls(
      set,
      getPendingIncomingCalls(current).filter((item) => !samePendingCall(item, pending)),
    );
    maybeStopRingtoneAfterPendingChange(get);
  },

  endCall() {
    get().handleCancelCall();
  },

  // Media controls
  toggleMute() {
    const { _livekitRoom, isMuted } = get();
    if (!_livekitRoom) return;

    const nextMuted = !isMuted;
    void _livekitRoom.localParticipant
      .setMicrophoneEnabled(!nextMuted)
      .catch(() => toast.error("Không thể cập nhật trạng thái microphone."));

    set({ isMuted: nextMuted });
  },

  toggleVideo() {
    const { _livekitRoom, isVideoOff } = get();
    if (!_livekitRoom) return;

    const nextVideoOff = !isVideoOff;
    void _livekitRoom.localParticipant
      .setCameraEnabled(!nextVideoOff)
      .then(() => {
        const localStream = buildLocalMediaStream(_livekitRoom);
        set({ localStream });
      })
      .catch(() => toast.error("Không thể cập nhật trạng thái camera."));

    set({ isVideoOff: nextVideoOff });
  },

  handleVideoToggle(isVideoOff: boolean) {
    set({ isRemoteVideoOff: isVideoOff });
  },

  // Socket event handlers (called from useSocketStore)

  handleIncomingCall(from: RemoteUser, callType: CallType, roomName: string, isMutedCall: boolean = false) {
    const currentState = get();
    if (currentState.status === "incoming" && currentState._roomName === roomName) {
      set({ isMutedCall });
      return;
    }

    if (samePendingIncomingCall(currentState.pendingIncomingCall, from, roomName)) {
      enqueuePendingIncomingCall(set, get, { from, callType, roomName, isMutedCall });
      return;
    }

    if (currentState.status !== "idle") {
      enqueuePendingIncomingCall(set, get, { from, callType, roomName, isMutedCall });
      if (!isMutedCall) {
        void playRingtone();
      }
      return;
    }
    set({
      status: "incoming",
      callType,
      remoteUser: from,
      _roomName: roomName,
      isConnecting: false,
      isRemoteConnecting: false,
      isMutedCall,
    });
    
    if (!isMutedCall) {
      console.log("[CallStore] handleIncomingCall triggered, starting ringtone");
      void playRingtone();
    }
  },

  handleRemoteAccepted(payload) {
    const state = get();
    if (state.status === "outgoing" && payloadMatchesCurrentCall(state, payload)) {
      if (state._callTimeout) clearTimeout(state._callTimeout);
      set({
        isRemoteConnecting: true,
        _roomName: payload?.roomName ?? state._roomName,
        _callTimeout: null,
      });
      void playCallerRingingRingtone();
    }
  },

  handleCallRinging(payload) {
    const state = get();
    if (state.status === "outgoing" && payloadMatchesCurrentCall(state, payload)) {
      set({ _roomName: payload?.roomName ?? state._roomName });
      void playCallerRingingRingtone();
    }
  },

  async handleCallAnswered({ token, roomName }) {
    const state = get();
    const { _callTimeout, callType } = state;
    if (state.status !== "outgoing") return;
    if (state._roomName && state._roomName !== roomName) return;
    if (!callType) return;

    if (_callTimeout) {
      clearTimeout(_callTimeout);
      set({ _callTimeout: null });
    }

    const attemptId = get()._joinAttemptId + 1;
    set({ _joinAttemptId: attemptId, _roomName: roomName, isConnecting: true, isRemoteConnecting: true });

    try {
      const connected = await connectLiveKitRoom(
        token,
        roomName,
        callType,
        attemptId,
        set,
        get,
      );
      if (!connected) return;
    } catch (error) {
      if (isJoinAttemptCancelled(get, attemptId)) return;
      console.error("Join LiveKit as caller failed:", error);
      get().handleCancelCall();
      toast.error("Không thể tham gia cuộc gọi.");
    }
  },

  async handleCallAccepted({ token, roomName }) {
    const state = get();
    const { callType } = state;
    if (state.status !== "incoming") return;
    if (state._roomName && state._roomName !== roomName) return;
    if (!callType) return;

    const attemptId = get()._joinAttemptId + 1;
    set({ _joinAttemptId: attemptId, _roomName: roomName, isConnecting: true });

    try {
      const connected = await connectLiveKitRoom(
        token,
        roomName,
        callType,
        attemptId,
        set,
        get,
      );
      if (!connected) return;
    } catch (error) {
      if (isJoinAttemptCancelled(get, attemptId)) return;
      console.error("Join LiveKit as callee failed:", error);
      get().handleCancelCall();
      toast.error("Không thể tham gia cuộc gọi.");
    }
  },

  handleCallRejected(payload) {
    if (
      payloadMatchesPendingCall(get().pendingIncomingCall, payload) ||
      get().pendingIncomingQueue.some((pending) => payloadMatchesPendingCall(pending, payload))
    ) {
      clearPendingIncomingCallByPayload(set, get, payload);
      maybeStopRingtoneAfterPendingChange(get);
      return;
    }

    if (!payloadMatchesCurrentCall(get(), payload)) return;
    resetToIdle(set, get);
  },

  handleCallEnded(payload) {
    if (
      payloadMatchesPendingCall(get().pendingIncomingCall, payload) ||
      get().pendingIncomingQueue.some((pending) => payloadMatchesPendingCall(pending, payload))
    ) {
      clearPendingIncomingCallByPayload(set, get, payload);
      maybeStopRingtoneAfterPendingChange(get);
      return;
    }

    if (!payloadMatchesCurrentCall(get(), payload)) return;
    resetToIdle(set, get);
  },

  handleCallFailed(reason) {
    const reasonMap: Record<string, string> = {
      offline: "Người dùng đang offline.",
      "no-answer": "Người nhận không phản hồi.",
      busy: "Người dùng đang bận.",
      "self-call": "Bạn không thể tự gọi chính mình.",
      blocked: "Không thể gọi do trạng thái chặn.",
      "not-friends": "Hai bạn chưa là bạn bè.",
      "already-in-call": "Bạn đang ở trong một cuộc gọi khác.",
      "already-active": "Cuộc gọi giữa hai bạn đang diễn ra.",
      "rate-limited": "Bạn thao tác quá nhanh, vui lòng thử lại sau.",
      "server-error": "Lỗi hệ thống. Vui lòng thử lại.",
    };
    const msg = reasonMap[reason] ?? "Không thể thực hiện cuộc gọi.";
    toast.error(`Cuộc gọi thất bại: ${msg}`);
    resetToIdle(set, get);
  },

  async handleIceCandidate(_candidate: RTCIceCandidateInit) {
    // No-op: one-to-one calls now use LiveKit SFU.
  },
}));
