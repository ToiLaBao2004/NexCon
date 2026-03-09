import { create } from "zustand";
import { useSocketStore } from "./useSocketStore";
import type { CallState, CallType, RemoteUser } from "@/types/store";
import { toast } from "sonner";
import { playRingtone, stopRingtone } from "@/utils/sound";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
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
  _peerConnection: null,
  _pendingOffer: null,
  _iceCandidateQueue: [],
  _callTimeout: null,
  isMuted: false,
  isVideoOff: false,
};

function cleanup(get: () => CallState) {
  const { localStream, _peerConnection, _callTimeout } = get();
  localStream?.getTracks().forEach((t) => t.stop()); // Stop camera/mic
  _peerConnection?.close(); // Close WebRTC connection
  if (_callTimeout) clearTimeout(_callTimeout);
}

async function flushIceCandidateQueue(
  pc: RTCPeerConnection,
  get: () => CallState,
) {
  const { _iceCandidateQueue } = get();
  for (const candidate of _iceCandidateQueue) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => { });
  }
  return [];
}

export const useCallStore = create<CallState>((set, get) => ({
  ...IDLE_STATE,
  isMuted: false,
  isVideoOff: false,

  // Initiator: A starts a call
  async startCall(toUser: RemoteUser, callType: CallType) {
    if (get().status !== "idle") return;

    let stream: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });

      pc = new RTCPeerConnection(ICE_SERVERS);
      pc.onconnectionstatechange = () => {
        if (!pc) return;

        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          get().endCall();
          toast.error('Kết nối bị gián đoạn.');
        }
      };

      stream.getTracks().forEach((track) => pc!.addTrack(track, stream!));

      pc.ontrack = (e) => {
        const [remoteStream] = e.streams;
        set({ remoteStream });
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          emitCallEvent("ice-candidate", {
            toUserId: toUser._id,
            candidate: e.candidate,
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      timeout = setTimeout(() => {
        if (get().status === "outgoing") {
          emitCallEvent("call-ended", { toUserId: toUser._id });
          get().endCall();
        }
      }, 30_000);

      set({
        status: "outgoing",
        callType,
        remoteUser: toUser,
        localStream: stream,
        remoteStream: null,
        _peerConnection: pc,
        _callTimeout: timeout,
        isMuted: false,
        isVideoOff: false,
      });

      emitCallEvent("call-offer", { toUserId: toUser._id, offer, callType });
      // Refresh sidebar
      const { useChatStore } = await import("./useChatStore");
      useChatStore.getState().fetchConversations();
    } catch (error) {
      console.error("Start call failed:", error);
      stream?.getTracks().forEach((t) => t.stop());
      pc?.close();
      if (timeout) clearTimeout(timeout);
      toast.error(
        "Không thể thiết lập cuộc gọi. Hãy kiểm tra thiết bị của bạn.",
      );
    }
  },

  // Receiver: B accepts the incoming call
  async acceptCall() {
    const { remoteUser, _pendingOffer, callType } = get();
    if (!remoteUser || !_pendingOffer) return;

    let stream: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });

      pc = new RTCPeerConnection(ICE_SERVERS);
      pc.onconnectionstatechange = () => {
        if (!pc) return;

        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          get().endCall();
          toast.error('Kết nối bị gián đoạn.');
        }
      };

      stream.getTracks().forEach((track) => pc!.addTrack(track, stream!));

      pc.ontrack = (e) => {
        const [remoteStream] = e.streams;
        set({ remoteStream });
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          emitCallEvent("ice-candidate", {
            toUserId: remoteUser._id,
            candidate: e.candidate,
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(_pendingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const remaining = await flushIceCandidateQueue(pc, get);

      set({
        status: "active",
        localStream: stream,
        _peerConnection: pc,
        _pendingOffer: null,
        _iceCandidateQueue: remaining,
        isMuted: false,
        isVideoOff: false,
      });

      emitCallEvent("call-answer", { toUserId: remoteUser._id, answer });
      stopRingtone();
    } catch (error) {
      console.error("Accept call failed:", error);
      stream?.getTracks().forEach((t) => t.stop());
      pc?.close();
      get().endCall();
      toast.error("Không thể tham gia cuộc gọi.");
    }
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
    const { localStream, isMuted } = get();
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = isMuted;
    });
    set({ isMuted: !isMuted });
  },

  toggleVideo() {
    const { localStream, isVideoOff } = get();
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = isVideoOff;
    });
    set({ isVideoOff: !isVideoOff });
  },

  // Socket event handlers (called from useSocketStore)

  handleIncomingCall(
    from: RemoteUser,
    offer: RTCSessionDescriptionInit,
    callType: CallType,
  ) {
    if (get().status !== "idle") {
      emitCallEvent("call-rejected", { toUserId: from._id });
      return;
    }
    set({
      status: "incoming",
      callType,
      remoteUser: from,
      _pendingOffer: offer,
    });
    console.log("[CallStore] handleIncomingCall triggered, starting ringtone");
    void playRingtone();
  },

  async handleCallAnswered(answer: RTCSessionDescriptionInit) {
    const { _peerConnection, _callTimeout } = get();
    if (!_peerConnection) return;

    if (_callTimeout) {
      clearTimeout(_callTimeout);
      set({ _callTimeout: null });
    }

    await _peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer),
    );

    const remaining = await flushIceCandidateQueue(_peerConnection, get);
    set({ status: "active", _iceCandidateQueue: remaining });
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

  handleCallFailed(reason: "offline" | "busy") {
    cleanup(get);
    stopRingtone();
    const msg =
      reason === "offline"
        ? "Người dùng đang offline."
        : "Người dùng đang bận.";
    toast.error(`Cuộc gọi thất bại: ${msg}`);
    set({ ...IDLE_STATE, isMuted: false, isVideoOff: false });
  },

  async handleIceCandidate(candidate: RTCIceCandidateInit) {
    const { _peerConnection } = get();
    if (!_peerConnection) return;

    if (!_peerConnection.remoteDescription) {
      set((state) => ({
        _iceCandidateQueue: [...state._iceCandidateQueue, candidate],
      }));
      return;
    }

    await _peerConnection
      .addIceCandidate(new RTCIceCandidate(candidate))
      .catch(() => { });
  },
}));
