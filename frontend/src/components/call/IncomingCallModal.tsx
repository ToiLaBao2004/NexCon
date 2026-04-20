import { LoaderCircle, Phone, PhoneOff, Video } from "lucide-react";
import { useCallStore } from "@/stores/useCallStore";
import UserAvatar from "@/components/chat/UserAvatar";

const IncomingCallModal = () => {
  const { remoteUser, callType, acceptCall, rejectCall, isConnecting } = useCallStore();

  if (!remoteUser) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-80 overflow-hidden">
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
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 group-hover:scale-105 transition-transform">
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
