import { useState } from "react";
import { useGroupCallStore } from "@/stores/useGroupCallStore";
import GroupCallRoom from "./GroupCallRoom";
import UserAvatar from "@/components/chat/UserAvatar";
import { PhoneOff, Minimize2, Maximize2, Loader2 } from "lucide-react";
import { useDraggable } from "@/hooks/useDraggable";

const GroupCallScreen = () => {
  const {
    status,
    conversationId,
    callType,
    token,
    groupName,
    leaveGroupCall,
  } = useGroupCallStore();
  const [isMinimized, setIsMinimized] = useState(false);
  const { ref: dragRef, style: dragStyle, dragHandlers } = useDraggable({ placement: "top-center" });

  if (!conversationId) return null;

  const isActive = status === "active" && token;
  const displayName = groupName ?? "Nhóm";
  const callLabel = callType === "video" ? "Cuộc gọi video nhóm" : "Cuộc gọi thoại nhóm";

  // ── Active call: full-screen or minimized GroupCallRoom ──
  if (isActive && isMinimized) {
    return (
      <div
        ref={dragRef}
        style={dragStyle}
        {...dragHandlers}
        className="z-[90] w-80 rounded-2xl shadow-2xl border border-border bg-card flex flex-col overflow-hidden cursor-grab active:cursor-grabbing"
      >
        <GroupCallRoom
          roomName={conversationId}
          roomLabel={groupName ?? undefined}
          token={token}
          onLeave={leaveGroupCall}
          minimized={true}
          onMinimize={() => setIsMinimized(true)}
          onMaximize={() => setIsMinimized(false)}
        />
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="fixed top-0 right-0 bottom-0 left-0 md:top-2 md:right-2 md:bottom-2 md:left-[5rem] z-[90] bg-background md:rounded-2xl md:border md:border-border/40 md:shadow-soft flex flex-col overflow-hidden">
        <GroupCallRoom
          roomName={conversationId}
          roomLabel={groupName ?? undefined}
          token={token}
          onLeave={leaveGroupCall}
          minimized={false}
          onMinimize={() => setIsMinimized(true)}
          onMaximize={() => setIsMinimized(false)}
        />
      </div>
    );
  }

  // ── Outgoing / Joining: small modal (like OutgoingCallModal) ──

  if (isMinimized) {
    return (
      <div
        ref={dragRef}
        style={dragStyle}
        {...dragHandlers}
        className="z-[100] w-72 rounded-2xl shadow-2xl border border-border bg-card text-card-foreground overflow-hidden cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <UserAvatar type="chat" name={displayName} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {callType === "video" ? "Video" : "Thoại"} · {status === "joining" ? "Đang kết nối" : "Đang gọi"}
              <RingingDots />
            </p>
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
            title="Phóng to"
          >
            <Maximize2 size={16} />
          </button>
        </div>
        <div className="flex items-center justify-center gap-4 px-4 pb-3">
          <button
            onClick={leaveGroupCall}
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
          onClick={() => setIsMinimized(true)}
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
            <UserAvatar type="sidebar" name={displayName} />
          </div>

          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground">{displayName}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {callLabel} {" · "}
              {status === "joining" ? (
                <span className="inline-flex items-center gap-1">
                  Đang kết nối <Loader2 className="inline h-3 w-3 animate-spin" />
                </span>
              ) : (
                <RingingDots />
              )}
            </p>
          </div>
        </div>

        {/* Cancel button */}
        <div className="flex items-center justify-center px-6 py-5">
          <button
            onClick={leaveGroupCall}
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

function RingingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

export default GroupCallScreen;
