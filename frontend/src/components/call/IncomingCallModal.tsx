import { LoaderCircle, Maximize2, Minimize2, Phone, PhoneOff, Video } from "lucide-react";
import { useCallStore } from "@/stores/useCallStore";
import UserAvatar from "@/components/chat/UserAvatar";
import { useDraggable } from "@/hooks/useDraggable";

interface IncomingCallModalProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
}

const IncomingCallModal = ({ isMinimized, onMinimize, onMaximize }: IncomingCallModalProps) => {
  const { remoteUser, callType, acceptCall, rejectCall, isConnecting } = useCallStore();
  const { ref: dragRef, style: dragStyle, dragHandlers } = useDraggable({ placement: "top-center" });
  const callTypeLabel = callType === "video" ? "Video" : "Thoại";

  if (!remoteUser) return null;

  if (isMinimized) {
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
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {callTypeLabel} · Cuộc gọi đến
              {isConnecting && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
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
            onClick={rejectCall}
            className="p-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            title={isConnecting ? "Hủy" : "Từ chối"}
          >
            <PhoneOff size={16} />
          </button>
          <button
            onClick={acceptCall}
            disabled={isConnecting}
            className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title={isConnecting ? "Đang vào phòng" : "Chấp nhận"}
          >
            {isConnecting ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : callType === "video" ? (
              <Video size={16} />
            ) : (
              <Phone size={16} />
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-80 overflow-hidden relative">
        <button
          onClick={onMinimize}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-foreground transition-colors"
          title="Thu nhỏ"
        >
          <Minimize2 size={16} />
        </button>

        {/* Header gradient */}
        <div className="bg-gradient-to-b from-primary/20 to-background px-6 pt-8 pb-4 flex flex-col items-center gap-3">
          {/* Pulsing avatar ring */}
          <div className="relative">
            <span className="absolute inset-0 rounded-full animate-ping bg-primary/30" />
            <span className="absolute inset-[-6px] rounded-full animate-pulse bg-primary/15" />
            <UserAvatar
              type="sidebar"
              name={remoteUser.displayName}
              avatarUrl={remoteUser.avatarUrl ?? undefined}
            />
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {callType === "video"
                ? "Cuộc gọi video đến"
                : "Cuộc gọi thoại đến"}
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {remoteUser.displayName}
            </h2>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-around px-6 py-5">
          {/* Reject */}
          <button
            onClick={rejectCall}
            className="flex flex-col items-center gap-1.5 group"
          >
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 group-hover:scale-105 transition-transform">
              <PhoneOff className="h-6 w-6" />
            </span>
            <span className="text-xs text-muted-foreground">
              {isConnecting ? "Hủy" : "Từ chối"}
            </span>
          </button>

          {/* Accept */}
          <button
            onClick={acceptCall}
            disabled={isConnecting}
            className="flex flex-col items-center gap-1.5 group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform">
              {isConnecting ? (
                <LoaderCircle className="h-6 w-6 animate-spin" />
              ) : callType === "video" ? (
                <Video className="h-6 w-6" />
              ) : (
                <Phone className="h-6 w-6" />
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {isConnecting ? "Đang vào phòng..." : "Chấp nhận"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
