import { create } from "zustand";
import { useSocketStore } from "./useSocketStore";
import type { CallState, CallType, RemoteUser } from "@/types/store";
import { toast } from "sonner";
import { playRingtone, stopRingtone } from "@/utils/sound";
import { Room, RoomEvent, Track } from "livekit-client";

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
const LIVEKIT_CONNECT_OPTIONS = {
  autoSubscribe: true,
  maxRetries: 5,
  websocketTimeout: 20_000,
  peerConnectionTimeout: 20_000,
};

function emitCallEvent(event: string, payload?: object) {
  useSocketStore.getState().socket?.emit(event, payload);
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

function resetToIdle(
  set: (partial: Partial<CallState>) => void,
  get: () => CallState,
) {
  const nextJoinAttemptId = get()._joinAttemptId + 1;
  cleanup(get);
  stopRingtone();
  set({ ...IDLE_STATE, _joinAttemptId: nextJoinAttemptId });
}

function isJoinAttemptCancelled(get: () => CallState, attemptId: number) {
  const state = get();
  return state._joinAttemptId !== attemptId || state.status === "idle";
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

    emitCallEvent("call-connected", { toUserId: remoteUserId });
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
    if (state.status !== "idle" && !isCancelled()) {
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

  return true;
}

export const useCallStore = create<CallState>((set, get) => ({
  ...IDLE_STATE,
  isMuted: false,
  isVideoOff: false,

  // Initiator: A starts a call
  async startCall(toUser: RemoteUser, callType: CallType) {
    if (get().status !== "idle") return;

    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      timeout = setTimeout(() => {
        if (get().status === "outgoing") {
          get().handleCancelCall();
        }
      }, 30_000);

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
    const { remoteUser, isConnecting } = get();
    if (!remoteUser || isConnecting) return;

    set({ isConnecting: true });
    emitCallEvent("accept-call", { toUserId: remoteUser._id });
    emitCallEvent("call-answer", { toUserId: remoteUser._id });
    stopRingtone();
  },

  handleCancelCall() {
    const { remoteUser, status } = get();
    if (status === "idle") return;

    if (remoteUser?._id) {
      const eventName = status === "active" ? "leave-call" : "call-cancelled";
      emitCallEvent(eventName, { toUserId: remoteUser._id });
    }

    resetToIdle(set, get);
  },

  // Receiver: B rejects the incoming call
  rejectCall() {
    const { remoteUser, status } = get();
    if (status === "incoming" && remoteUser?._id) {
      emitCallEvent("call-rejected", { toUserId: remoteUser._id });
      resetToIdle(set, get);
      return;
    }

    get().handleCancelCall();
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
    if (get().status !== "idle") {
      emitCallEvent("call-cancelled", { toUserId: from._id });
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

  handleRemoteAccepted() {
    if (get().status === "outgoing") {
      set({ isRemoteConnecting: true });
    }
  },

  async handleCallAnswered({ token, roomName }) {
    const { _callTimeout, callType } = get();
    if (!callType) return;

    if (_callTimeout) {
      clearTimeout(_callTimeout);
      set({ _callTimeout: null });
    }

    const attemptId = get()._joinAttemptId + 1;
    set({ _joinAttemptId: attemptId, isConnecting: true, isRemoteConnecting: true });

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
    const { callType } = get();
    if (!callType) return;

    const attemptId = get()._joinAttemptId + 1;
    set({ _joinAttemptId: attemptId, isConnecting: true });

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

  handleCallRejected() {
    resetToIdle(set, get);
  },

  handleCallEnded() {
    resetToIdle(set, get);
  },

  handleCallFailed(reason) {
    const reasonMap: Record<string, string> = {
      offline: "Người dùng đang offline.",
      busy: "Người dùng đang bận.",
      "self-call": "Bạn không thể tự gọi chính mình.",
      blocked: "Không thể gọi do trạng thái chặn.",
      "not-friends": "Hai bạn chưa là bạn bè.",
      "already-in-call": "Bạn đang ở trong một cuộc gọi khác.",
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
