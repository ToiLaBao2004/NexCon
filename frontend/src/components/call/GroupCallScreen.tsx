import { useGroupCallStore } from "@/stores/useGroupCallStore";
import { useAuthStore } from "@/stores/useAuthStore";
import GroupCallRoom from "./GroupCallRoom";
import { PhoneOff, Loader2 } from "lucide-react";

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { label: string; className: string }> = {
    ringing: {
      label: "Đang gọi",
      className: "text-yellow-500 bg-yellow-500/10",
    },
    joined: {
      label: "Đã tham gia",
      className: "text-green-500 bg-green-500/10",
    },
    declined: {
      label: "Từ chối",
      className: "text-red-500 bg-red-500/10",
    },
    left: {
      label: "Đã rời",
      className: "text-muted-foreground bg-muted",
    },
    "no-answer": {
      label: "Không trả lời",
      className: "text-muted-foreground bg-muted",
    },
  };
  const c = config[status] ?? config["no-answer"];
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.className}`}
    >
      {c.label}
    </span>
  );
};

const GroupCallScreen = () => {
  const {
    status,
    conversationId,
    callType,
    token,
    groupName,
    participants,
    leaveGroupCall,
  } = useGroupCallStore();
  const user = useAuthStore((s) => s.user);

  if (!conversationId) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-background flex flex-col">
      {status === "active" && token ? (
        <GroupCallRoom
          roomName={conversationId}
          roomLabel={groupName ?? undefined}
          token={token}
          onLeave={leaveGroupCall}
        />
      ) : (
        /* Outgoing / Joining screen */
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold">{groupName}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {callType === "video" ? "Cuộc gọi video nhóm" : "Cuộc gọi thoại nhóm"}
            </p>
            <p className="text-muted-foreground mt-2">
              {status === "joining" ? "Đang kết nối..." : "Đang gọi..."}
            </p>
            {status === "joining" && (
              <Loader2 className="h-6 w-6 animate-spin mx-auto mt-3 text-primary" />
            )}
          </div>

          {/* Participant status list */}
          {participants.length > 0 && (
            <div className="w-80 max-h-64 overflow-y-auto space-y-2 px-1">
              {participants
                .filter((p) => p.userId !== user?._id)
                .map((p) => (
                  <div
                    key={p.userId}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                      {p.avatarUrl ? (
                        <img
                          src={p.avatarUrl}
                          alt={p.displayName}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        p.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="flex-1 text-sm font-medium truncate">
                      {p.displayName}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
            </div>
          )}

          {/* Cancel button */}
          {status === "outgoing" && (
            <button
              onClick={leaveGroupCall}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              <PhoneOff className="h-5 w-5" />
              Hủy cuộc gọi
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default GroupCallScreen;
