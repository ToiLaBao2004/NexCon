import { LoaderCircle, PhoneOff, Minimize2, Maximize2 } from "lucide-react";
import { useCallStore } from "@/stores/useCallStore";
import UserAvatar from "@/components/chat/UserAvatar";
import { useDraggable } from "@/hooks/useDraggable";

interface OutgoingCallModalProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
}

const OutgoingCallModal = ({ isMinimized, onMinimize, onMaximize }: OutgoingCallModalProps) => {
  const { remoteUser, callType, endCall, isRemoteConnecting } = useCallStore();
  const { ref: dragRef, style: dragStyle, dragHandlers } = useDraggable({ placement: "top-center" });
  const statusText = isRemoteConnecting ? "Đang kết nối..." : "Đang gọi";

  if (!remoteUser) return null;

  // Minimized floating widget
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
              {callType === "video" ? "Video" : "Thoại"} · {statusText}
              {isRemoteConnecting ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RingingDots />
              )}
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
            onClick={endCall}
            className="p-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            <PhoneOff size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-80 overflow-hidden relative">
        {/* Minimize button */}
        <button
          onClick={onMinimize}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-foreground transition-colors"
          title="Thu nhỏ"
        >
          <Minimize2 size={16} />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-b from-primary/20 to-background px-6 pt-8 pb-4 flex flex-col items-center gap-3">
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
            <h2 className="text-lg font-semibold text-foreground">
              {remoteUser.displayName}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {callType === "video" ? "Cuộc gọi video" : "Cuộc gọi thoại"}
              {" · "}
              {statusText}
              {" "}
              {isRemoteConnecting ? (
                <LoaderCircle className="inline-block h-4 w-4 animate-spin" />
              ) : (
                <RingingDots />
              )}
            </p>
          </div>
        </div>

        {/* Hang up */}
        <div className="flex items-center justify-center px-6 py-5">
          <button
            onClick={endCall}
            className="flex flex-col items-center gap-1.5 group"
          >
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 group-hover:scale-105 transition-transform">
              <PhoneOff className="h-6 w-6" />
            </span>
            <span className="text-xs text-muted-foreground">Huỷ</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Animated "đang đổ chuông..."
function RingingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

export default OutgoingCallModal;
