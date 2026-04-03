import { create } from "zustand";
import { useSocketStore } from "./useSocketStore";
import type { CallState, CallType, RemoteUser } from "@/types/store";
import { toast } from "sonner";
import { playRingtone, stopRingtone } from "@/utils/sound";
import { Room, RoomEvent, Track } from "livekit-client";

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;

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
  _livekitRoom: null,
  _roomName: null,
  _token: null,
  _callTimeout: null,
  isMuted: false,
  isVideoOff: false,
  isRemoteVideoOff: false,
};

function cleanup(get: () => CallState) {
  const { localStream, _livekitRoom, _callTimeout } = get();
  localStream?.getTracks().forEach((t) => t.stop()); // Stop camera/mic
  if (_livekitRoom) {
    _livekitRoom.disconnect(true);
  }
  if (_callTimeout) clearTimeout(_callTimeout);
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
  set: (partial: Partial<CallState>) => void,
  get: () => CallState,
) {
  const room = new Room();
  const remoteMediaStream = new MediaStream();

  const syncRemoteVideoState = () => {
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
    if (participant.isLocal) return;
    if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;
    remoteMediaStream.addTrack(track.mediaStreamTrack);
    set({ remoteStream: new MediaStream(remoteMediaStream.getTracks()) });
    if (publication.source === Track.Source.Camera) {
      syncRemoteVideoState();
    }
  });

  room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    if (participant.isLocal) return;
    remoteMediaStream.removeTrack(track.mediaStreamTrack);
    set({ remoteStream: new MediaStream(remoteMediaStream.getTracks()) });
    if (publication.source === Track.Source.Camera) {
      syncRemoteVideoState();
    }
  });

  room.on(RoomEvent.TrackMuted, (_publication, participant) => {
    if (!participant.isLocal) {
      syncRemoteVideoState();
    }
  });

  room.on(RoomEvent.TrackUnmuted, (_publication, participant) => {
    if (!participant.isLocal) {
      syncRemoteVideoState();
    }
  });

  room.on(RoomEvent.ParticipantDisconnected, () => {
    syncRemoteVideoState();
  });

  room.on(RoomEvent.Disconnected, () => {
    if (get().status !== "idle") {
      get().handleCallEnded();
      toast.error("Kết nối bị gián đoạn.");
    }
  });

  await room.connect(LIVEKIT_URL, token);
  await room.localParticipant.setMicrophoneEnabled(true);
  await room.localParticipant.setCameraEnabled(callType === "video");

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
    isMuted: false,
    isVideoOff: callType === "voice",
  });
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
          emitCallEvent("call-ended", { toUserId: toUser._id });
          cleanup(get);
          set({ ...IDLE_STATE, isMuted: false, isVideoOff: false });
        }
      }, 30_000);

      set({
        status: "outgoing",
        callType,
        remoteUser: toUser,
        remoteStream: null,
        _callTimeout: timeout,
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
    const { remoteUser } = get();
    if (!remoteUser) return;

    emitCallEvent("call-answer", { toUserId: remoteUser._id });
    stopRingtone();
  },

  // Receiver: B rejects the incoming call
  rejectCall() {
    const { remoteUser } = get();
    if (remoteUser) {
      emitCallEvent("call-rejected", { toUserId: remoteUser._id });
    }
    cleanup(get);
    stopRingtone();
    set({ ...IDLE_STATE, isMuted: false, isVideoOff: false });
  },

  endCall() {
    const { remoteUser } = get();
    if (remoteUser) {
      emitCallEvent("call-ended", { toUserId: remoteUser._id });
    }
    cleanup(get);
    stopRingtone();
    set({ ...IDLE_STATE, isMuted: false, isVideoOff: false });
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

  handleIncomingCall(from: RemoteUser, callType: CallType, roomName: string) {
    if (get().status !== "idle") {
      emitCallEvent("call-rejected", { toUserId: from._id });
      return;
    }
    set({
      status: "incoming",
      callType,
      remoteUser: from,
      _roomName: roomName,
    });
    console.log("[CallStore] handleIncomingCall triggered, starting ringtone");
    void playRingtone();
  },

  async handleCallAnswered({ token, roomName }) {
    const { _callTimeout, callType } = get();
    if (!callType) return;

    if (_callTimeout) {
      clearTimeout(_callTimeout);
      set({ _callTimeout: null });
    }

    try {
      await connectLiveKitRoom(token, roomName, callType, set, get);
    } catch (error) {
      console.error("Join LiveKit as caller failed:", error);
      cleanup(get);
      set({ ...IDLE_STATE, isMuted: false, isVideoOff: false });
      toast.error("Không thể tham gia cuộc gọi.");
    }
  },

  async handleCallAccepted({ token, roomName }) {
    const { callType } = get();
    if (!callType) return;

    try {
      await connectLiveKitRoom(token, roomName, callType, set, get);
    } catch (error) {
      console.error("Join LiveKit as callee failed:", error);
      cleanup(get);
      set({ ...IDLE_STATE, isMuted: false, isVideoOff: false });
      toast.error("Không thể tham gia cuộc gọi.");
    }
  },

  handleCallRejected() {
    cleanup(get);
    stopRingtone();
    set({ ...IDLE_STATE, isMuted: false, isVideoOff: false });
  },

  handleCallEnded() {
    cleanup(get);
    stopRingtone();
    set({ ...IDLE_STATE, isMuted: false, isVideoOff: false });
  },

  handleCallFailed(reason) {
    cleanup(get);
    stopRingtone();
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
    set({ ...IDLE_STATE, isMuted: false, isVideoOff: false });
  },

  async handleIceCandidate(_candidate: RTCIceCandidateInit) {
    // No-op: one-to-one calls now use LiveKit SFU.
  },
}));
