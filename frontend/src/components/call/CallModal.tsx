import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useCallStore } from "@/stores/useCallStore";
import { useAuthStore } from "@/stores/useAuthStore";
import UserAvatar from "@/components/chat/UserAvatar";
import { cn } from "@/lib/utils";

const AVATAR_PALETTE = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669',
  '#d97706', '#dc2626', '#be185d', '#0284c7',
];
const nameToColor = (name: string) => {
  let h = 0;
  for (const c of name) h = Math.imul(31, h) + c.charCodeAt(0);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
};

const CallModal = () => {
  const {
    remoteUser,
    callType,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isRemoteVideoOff,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCallStore();
  const authUser = useAuthStore((s) => s.user);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream
  useEffect(() => {
    if (callType === 'video' && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    } else if (callType === 'voice' && remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callType]);

  // Call duration timer
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!remoteUser) return null;

  const isVideo = callType === "video";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl shadow-2xl bg-zinc-950 text-white flex flex-col transition-all duration-500",
          isVideo
            ? "w-[854px] h-[480px] max-w-[95vw] max-h-[80vh]"
            : "w-80 py-8 px-6",
        )}
      >
        {isVideo ? (
          <VideoCallLayout
            remoteUser={remoteUser}
            remoteStream={remoteStream}
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
            isVideoOff={isVideoOff}
            isMuted={isMuted}
            elapsed={elapsed}
            toggleMute={toggleMute}
            toggleVideo={toggleVideo}
            endCall={endCall}
            localUser={authUser ?? undefined}
            isRemoteVideoOff={isRemoteVideoOff}
          />
        ) : (
          <VoiceCallLayout
            remoteUser={remoteUser}
            localVideoRef={localVideoRef}
            remoteAudioRef={remoteAudioRef}
            isMuted={isMuted}
            elapsed={elapsed}
            toggleMute={toggleMute}
            endCall={endCall}
          />
        )}
      </div>
    </div>
  );
};

interface VideoCallLayoutProps {
  remoteUser: any;
  remoteStream: MediaStream | null;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  isVideoOff: boolean;
  isMuted: boolean;
  elapsed: number;
  toggleMute: () => void;
  toggleVideo?: () => void;
  endCall: () => void;
  localUser?: { displayName: string; avatarUrl?: string | null };
  isRemoteVideoOff: boolean;
}

const VideoCallLayout = ({
  remoteUser,
  remoteStream,
  localVideoRef,
  remoteVideoRef,
  isVideoOff,
  isMuted,
  elapsed,
  toggleMute,
  toggleVideo,
  endCall,
  localUser,
  isRemoteVideoOff,
}: VideoCallLayoutProps) => {
  const showRemoteAvatar = !remoteStream || isRemoteVideoOff;

  return (
    <>
      <div className="flex-1 min-h-0 bg-zinc-900 relative overflow-hidden">
        {/* Remote video */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn("w-full h-full object-cover", showRemoteAvatar && "hidden")}
        />

        {/* Remote avatar (connecting / cam off) */}
        {showRemoteAvatar && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            {remoteUser.avatarUrl ? (
              <img
                src={remoteUser.avatarUrl}
                alt={remoteUser.displayName}
                className="w-16 h-16 rounded-full object-cover shadow-md select-none"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md select-none"
                style={{ background: nameToColor(remoteUser.displayName) }}
              >
                {remoteUser.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="text-sm font-medium text-zinc-300">{remoteUser.displayName}</p>
            {!remoteStream && (
              <p className="text-xs text-zinc-500 animate-pulse">Đang kết nối...</p>
            )}
          </div>
        )}

        {/* Timer */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full font-medium tabular-nums border border-white/10">
          {formatTime(elapsed)}
        </div>

        {/* Local PiP */}
        <div className="absolute bottom-6 right-6 w-40 h-28 rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-zinc-800">
          {!isVideoOff ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-zinc-800">
              {localUser?.avatarUrl ? (
                <img
                  src={localUser.avatarUrl}
                  alt={localUser.displayName}
                  className="w-10 h-10 rounded-full object-cover shadow-md select-none"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md select-none"
                  style={{ background: nameToColor(localUser?.displayName ?? '') }}
                >
                  {localUser?.displayName?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 py-5 bg-zinc-950/50 backdrop-blur-xl border-t border-white/5">
        <ControlButton
          onClick={toggleMute}
          active={isMuted}
          label={isMuted ? "Bật mic" : "Tắt mic"}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </ControlButton>

        <ControlButton
          onClick={toggleVideo!}
          active={isVideoOff}
          label={isVideoOff ? "Bật cam" : "Tắt cam"}
        >
          {isVideoOff ? (
            <VideoOff className="h-5 w-5" />
          ) : (
            <Video className="h-5 w-5" />
          )}
        </ControlButton>

        <button
          onClick={endCall}
          className="group flex flex-col items-center gap-1.5"
        >
          <div className="p-3.5 rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 group-hover:bg-destructive/90 group-active:scale-95 transition-all">
            <PhoneOff className="h-6 w-6" />
          </div>
          <span className="text-[10px] text-zinc-500 font-medium">Kết thúc</span>
        </button>
      </div>
    </>
  );
};

interface VoiceCallLayoutProps {
  remoteUser: any;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
  isMuted: boolean;
  elapsed: number;
  toggleMute: () => void;
  endCall: () => void;
}

const VoiceCallLayout = ({
  remoteUser,
  localVideoRef,
  remoteAudioRef,
  isMuted,
  elapsed,
  toggleMute,
  endCall,
}: VoiceCallLayoutProps) => {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <div className="absolute inset-0 rounded-full animate-ping bg-green-500/20" />
        <div className="absolute inset-[-8px] rounded-full animate-pulse bg-green-500/10" />
        <UserAvatar
          type="sidebar"
          name={remoteUser.displayName}
          avatarUrl={remoteUser.avatarUrl ?? undefined}
        />
      </div>

      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          {remoteUser.displayName}
        </h2>
        <p className="text-sm text-green-500 font-medium tabular-nums">
          {formatTime(elapsed)}
        </p>
      </div>

      <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
      <audio ref={remoteAudioRef} autoPlay />

      <div className="flex items-center gap-8 pt-4">
        <ControlButton
          onClick={toggleMute}
          active={isMuted}
          label={isMuted ? "Bật mic" : "Tắt mic"}
        >
          {isMuted ? (
            <MicOff className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </ControlButton>

        <button
          onClick={endCall}
          className="group flex flex-col items-center gap-1.5"
        >
          <div className="p-4 rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 group-hover:bg-destructive/90 group-active:scale-95 transition-all">
            <PhoneOff className="h-7 w-7" />
          </div>
          <span className="text-xs text-zinc-500 font-medium">Kết thúc</span>
        </button>
      </div>
    </div>
  );
};

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

function ControlButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 group"
    >
      <div
        className={cn(
          "p-3 rounded-full transition-all duration-200 group-active:scale-90 shadow-sm",
          active
            ? "bg-zinc-100 text-zinc-950"
            : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700",
        )}
      >
        {children}
      </div>
      <span className="text-[10px] text-zinc-500 font-medium">{label}</span>
    </button>
  );
}

export default CallModal;
