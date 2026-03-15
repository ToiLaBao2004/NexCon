import { Phone, PhoneOff, Video, Users } from "lucide-react";
import { useGroupCallStore } from "@/stores/useGroupCallStore";

const IncomingGroupCallModal = () => {
  const { conversationId, callType, initiator, groupName, joinGroupCall, declineGroupCall } =
    useGroupCallStore();

  if (!conversationId || !initiator) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-80 overflow-hidden">
        {/* Header gradient */}
        <div className="bg-gradient-to-b from-primary/20 to-background px-6 pt-8 pb-4 flex flex-col items-center gap-3">
          {/* Pulsing icon */}
          <div className="relative">
            <span className="absolute inset-0 rounded-full animate-ping bg-primary/30" />
            <span className="absolute inset-[-6px] rounded-full animate-pulse bg-primary/15" />
            <div className="relative w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {callType === "video"
                ? "Cuộc gọi video nhóm"
                : "Cuộc gọi thoại nhóm"}
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {groupName}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {initiator.displayName} đang gọi...
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-around px-6 py-5">
          {/* Từ chối */}
          <button
            onClick={() => declineGroupCall(conversationId)}
            className="flex flex-col items-center gap-1.5 group"
          >
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 group-hover:scale-105 transition-transform">
              <PhoneOff className="h-6 w-6" />
            </span>
            <span className="text-xs text-muted-foreground">Từ chối</span>
          </button>

          {/* Tham gia */}
          <button
            onClick={() => joinGroupCall(conversationId)}
            className="flex flex-col items-center gap-1.5 group"
          >
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 group-hover:scale-105 transition-transform">
              {callType === "video" ? (
                <Video className="h-6 w-6" />
              ) : (
                <Phone className="h-6 w-6" />
              )}
            </span>
            <span className="text-xs text-muted-foreground">Tham gia</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingGroupCallModal;
