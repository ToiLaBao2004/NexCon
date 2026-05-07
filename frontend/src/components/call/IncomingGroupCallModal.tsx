import { Phone, PhoneOff, Video, Users } from "lucide-react";
import { useState } from "react";
import { useGroupCallStore } from "@/stores/useGroupCallStore";
import { useCallStore } from "@/stores/useCallStore";
import type { PendingIncomingGroupCall } from "@/types/store";

interface IncomingGroupCallModalProps {
  pendingCall?: PendingIncomingGroupCall | null;
}

const IncomingGroupCallModal = ({ pendingCall }: IncomingGroupCallModalProps) => {
  const {
    conversationId,
    callType,
    initiator,
    groupName,
    joinGroupCall,
    declineGroupCall,
    joinPendingGroupCall,
    declinePendingGroupCall,
  } = useGroupCallStore();
  const targetConversationId = pendingCall?.conversationId ?? conversationId;
  const targetCallType = pendingCall?.callType ?? callType;
  const targetInitiator = pendingCall?.initiator ?? initiator;
  const targetGroupName = pendingCall?.groupName ?? groupName;
  const onJoin = pendingCall ? joinPendingGroupCall : () => targetConversationId && joinGroupCall(targetConversationId);
  const onDecline = pendingCall ? declinePendingGroupCall : () => targetConversationId && declineGroupCall(targetConversationId);
  const currentDirectStatus = useCallStore((s) => s.status);
  const currentGroupStatus = useGroupCallStore((s) => s.status);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const shouldConfirmSwitch =
    currentDirectStatus !== "idle" || Boolean(pendingCall && currentGroupStatus !== "idle");
  const handleJoinClick = () => {
    if (shouldConfirmSwitch && !showSwitchConfirm) {
      setShowSwitchConfirm(true);
      return;
    }
    void onJoin();
  };

  if (!targetConversationId || !targetInitiator) return null;

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
              {targetCallType === "video"
                ? "Cuộc gọi video nhóm"
                : "Cuộc gọi thoại nhóm"}
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {targetGroupName}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {targetInitiator.displayName} đang gọi...
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-around px-6 py-5">
          {/* Từ chối */}
          <button
            onClick={onDecline}
            className="flex flex-col items-center gap-1.5 group"
          >
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 group-hover:scale-105 transition-transform">
              <PhoneOff className="h-6 w-6" />
            </span>
            <span className="text-xs text-muted-foreground">Từ chối</span>
          </button>

          {/* Tham gia */}
          <button
            onClick={handleJoinClick}
            className="flex flex-col items-center gap-1.5 group"
          >
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform">
              {targetCallType === "video" ? (
                <Video className="h-6 w-6" />
              ) : (
                <Phone className="h-6 w-6" />
              )}
            </span>
            <span className="text-xs text-muted-foreground">Tham gia</span>
          </button>
        </div>
        {showSwitchConfirm && (
          <div className="border-t border-border bg-muted/40 px-5 py-4 text-center">
            <p className="text-sm text-foreground">
              Bạn đang trong cuộc gọi. Kết thúc cuộc gọi hiện tại để chuyển qua cuộc gọi mới?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void onJoin()}
                className="h-9 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
              >
                Kết thúc và chuyển
              </button>
              <button
                onClick={() => setShowSwitchConfirm(false)}
                className="h-9 flex-1 rounded-lg border border-border bg-background text-sm font-semibold text-foreground"
              >
                Hủy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IncomingGroupCallModal;
