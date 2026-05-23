import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, MicOff, PhoneOff, Video, VideoOff, Minimize2, Maximize2 } from "lucide-react";
import { useCallStore } from "@/stores/useCallStore";
import { useAuthStore } from "@/stores/useAuthStore";
import UserAvatar from "@/components/chat/UserAvatar";
import { getAvatarSrc } from "@/lib/avatar";
import { cn, formatCallTimer } from "@/lib/utils";
import { useDraggable, type DragHandlers } from "@/hooks/useDraggable";

interface CallModalProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
}

const CallModal = ({ isMinimized, onMinimize, onMaximize }: CallModalProps) => {
  const {
    remoteUser,
    localStream,
    remoteStream,
    status,
    isConnecting,
    isRemoteConnecting,
    isMuted,
    isVideoOff,
    isRemoteVideoOff,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCallStore();
  const authUser = useAuthStore((s) => s.user);
  const { ref: dragRef, style: dragStyle, dragHandlers } = useDraggable({ placement: "top-center" });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const isJoiningCall = status !== "active" || isConnecting || isRemoteConnecting;
  const canUseMediaControls = Boolean(localStream);

  // Attach local stream (re-run when minimize toggles because DOM elements remount)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isMinimized, isVideoOff]);

  // Attach remote stream — luôn dùng <video> (video element chạy audio-only tốt)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, isMinimized, isRemoteVideoOff]);

  // Bắt đầu đếm khi đã nhận media từ peer (coi như cả hai đã vào cuộc gọi).
  useEffect(() => {
    if (remoteStream && !hasStarted) {
      setHasStarted(true);
    }
  }, [remoteStream, hasStarted]);

  // Call duration timer
  useEffect(() => {
    if (!hasStarted) return;

    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [hasStarted]);

  if (!remoteUser) return null;

  // Minimized floating widget
  if (isMinimized) {
    return (
      <DraggableCallWidget
        dragRef={dragRef}
        dragStyle={dragStyle}
        dragHandlers={dragHandlers}
        remoteUser={remoteUser}
        elapsed={elapsed}
        isJoiningCall={isJoiningCall}
        canUseMediaControls={canUseMediaControls}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        toggleMute={toggleMute}
        toggleVideo={toggleVideo}
        endCall={endCall}
        onMaximize={onMaximize}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300 dark:bg-black/80">
      <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card text-card-foreground shadow-2xl flex flex-col transition-all duration-500 w-[854px] h-[480px] max-w-[95vw] max-h-[80vh] dark:border-white/10 dark:bg-zinc-950 dark:text-white">
        {/* Minimize button */}
        <button
          onClick={onMinimize}
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted dark:border-white/10 dark:bg-black/60 dark:text-white dark:hover:bg-black/80"
          title="Thu nhỏ"
        >
          <Minimize2 size={14} />
          Thu nhỏ
        </button>

        <VideoCallLayout
          remoteUser={remoteUser}
          remoteStream={remoteStream}
          localStream={localStream}
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          isJoiningCall={isJoiningCall}
          hasStarted={hasStarted}
          canUseMediaControls={canUseMediaControls}
          isVideoOff={isVideoOff}
          isMuted={isMuted}
          elapsed={elapsed}
          toggleMute={toggleMute}
          toggleVideo={toggleVideo}
          endCall={endCall}
          localUser={authUser ?? undefined}
          isRemoteVideoOff={isRemoteVideoOff}
        />
      </div>
    </div>
  );
};

interface VideoCallLayoutProps {
  remoteUser: any;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  isJoiningCall: boolean;
  hasStarted: boolean;
  canUseMediaControls: boolean;
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
  localStream,
  localVideoRef,
  remoteVideoRef,
  isJoiningCall,
  hasStarted,
  canUseMediaControls,
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
  const showLocalVideo = Boolean(localStream && !isVideoOff);

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/35 dark:bg-zinc-900">
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
            <img
              src={getAvatarSrc(remoteUser.avatarUrl)}
              alt={remoteUser.displayName}
              className="w-16 h-16 rounded-full object-cover shadow-md select-none"
            />
            <p className="text-sm font-medium text-foreground dark:text-zinc-300">{remoteUser.displayName}</p>
            {!remoteStream && (
              <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                {isJoiningCall ? "Đang thiết lập cuộc gọi..." : "Đang kết nối..."}
              </div>
            )}
          </div>
        )}

        {/* Timer */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-md tabular-nums dark:border-white/10 dark:bg-black/40 dark:text-white">
          {hasStarted ? formatCallTimer(elapsed) : (
            <span className="inline-flex items-center gap-1.5">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Đang kết nối
            </span>
          )}
        </div>

        {/* Local PiP */}
        <div className="absolute bottom-6 right-6 h-28 w-40 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl dark:border-white/20 dark:bg-zinc-800">
          {showLocalVideo ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted/60 dark:bg-zinc-800">
              <img
                src={getAvatarSrc(localUser?.avatarUrl)}
                alt={localUser?.displayName || "Avatar"}
                className="w-10 h-10 rounded-full object-cover shadow-md select-none"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 border-t border-border/60 bg-card/95 py-5 backdrop-blur-xl dark:border-white/5 dark:bg-zinc-950/50">
        <ControlButton
          onClick={toggleMute}
          active={isMuted}
          disabled={!canUseMediaControls}
          label={isMuted ? "Bật mic" : "Tắt mic"}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </ControlButton>

        <ControlButton
          onClick={toggleVideo!}
          active={isVideoOff}
          disabled={!canUseMediaControls}
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
          <span className="text-[10px] font-medium text-muted-foreground dark:text-zinc-500">Kết thúc</span>
        </button>
      </div>
    </>
  );
};

function ControlButton({
  onClick,
  active,
  disabled = false,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 group disabled:cursor-not-allowed disabled:opacity-45"
    >
      <div
        className={cn(
          "p-3 rounded-full transition-all duration-200 group-active:scale-90 shadow-sm",
          active
            ? "bg-foreground text-background dark:bg-zinc-100 dark:text-zinc-950"
            : "bg-muted text-foreground hover:bg-muted/80 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
        )}
      >
        {children}
      </div>
      <span className="text-[10px] font-medium text-muted-foreground dark:text-zinc-500">{label}</span>
    </button>
  );
}

// Draggable minimized widget for active call
function DraggableCallWidget({
  dragRef,
  dragStyle,
  dragHandlers,
  remoteUser,
  elapsed,
  isJoiningCall,
  canUseMediaControls,
  isMuted,
  isVideoOff,
  toggleMute,
  toggleVideo,
  endCall,
  onMaximize,
  localVideoRef,
  remoteVideoRef,
}: {
  dragRef: React.RefObject<HTMLDivElement | null>;
  dragStyle: React.CSSProperties;
  dragHandlers: DragHandlers;
  remoteUser: { displayName: string; avatarUrl?: string | null };
  elapsed: number;
  isJoiningCall: boolean;
  canUseMediaControls: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  toggleMute: () => void;
  toggleVideo: () => void;
  endCall: () => void;
  onMaximize: () => void;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  return (
    <div
      ref={dragRef}
      style={dragStyle}
      {...dragHandlers}
      className="z-[100] w-72 rounded-2xl shadow-2xl border border-border bg-card text-card-foreground overflow-hidden cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <UserAvatar
          type="chat"
          name={remoteUser.displayName}
          avatarUrl={remoteUser.avatarUrl ?? undefined}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{remoteUser.displayName}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {isVideoOff ? "Thoại" : "Video"} · {isJoiningCall ? "Đang kết nối" : formatCallTimer(elapsed)}
          </p>
        </div>
        <button
          onClick={onMaximize}
          className="p-1.5 rounded-full hover:bg-muted transition-colors"
          title="Phóng to"
        >
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="flex items-center justify-center gap-4 px-4 pb-3">
        <button
          onClick={toggleMute}
          disabled={!canUseMediaControls}
          className={cn(
            "p-2 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45",
            isMuted ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-100 dark:text-zinc-900" : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          onClick={toggleVideo}
          disabled={!canUseMediaControls}
          className={cn(
            "p-2 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45",
            isVideoOff ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-100 dark:text-zinc-900" : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {isVideoOff ? <VideoOff size={16} /> : <Video size={16} />}
        </button>
        <button
          onClick={endCall}
          className="p-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          <PhoneOff size={16} />
        </button>
      </div>
      {/* Hidden video element to keep streams alive */}
      <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
      <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
    </div>
  );
}

export default CallModal;
