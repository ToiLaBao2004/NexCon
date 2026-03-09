import { PhoneOff } from "lucide-react";
import { useCallStore } from "@/stores/useCallStore";
import UserAvatar from "@/components/chat/UserAvatar";

const OutgoingCallModal = () => {
  const { remoteUser, callType, endCall } = useCallStore();

  if (!remoteUser) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-80 overflow-hidden">
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
              <RingingDots />
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
