import { LoaderCircle, Maximize2, Minimize2, Phone, PhoneOff, Video } from "lucide-react";
import { useState } from "react";
import { useCallStore } from "@/stores/useCallStore";
import { useGroupCallStore } from "@/stores/useGroupCallStore";
import UserAvatar from "@/components/chat/UserAvatar";
import { useDraggable } from "@/hooks/useDraggable";
import type { PendingIncomingCall } from "@/types/store";

interface IncomingCallModalProps {
  isMinimized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  pendingCall?: PendingIncomingCall | null;
  queuedCalls?: PendingIncomingCall[];
}

const IncomingCallModal = ({
  isMinimized,
  onMinimize,
  onMaximize,
  pendingCall,
  queuedCalls = [],
}: IncomingCallModalProps) => {
  const {
    remoteUser,
    callType,
    acceptCall,
    acceptPendingIncomingCall,
    acceptQueuedIncomingCall,
    rejectCall,
    rejectPendingIncomingCall,
    rejectQueuedIncomingCall,
    isConnecting,
  } = useCallStore();
  const currentDirectStatus = useCallStore((s) => s.status);
  const currentGroupStatus = useGroupCallStore((s) => s.status);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [queuedConfirmRoom, setQueuedConfirmRoom] = useState<string | null>(null);
  const { ref: dragRef, style: dragStyle, dragHandlers } = useDraggable({ placement: "top-center" });
  const targetUser = pendingCall?.from ?? remoteUser;
  const targetCallType = pendingCall?.callType ?? callType;
  const isPendingCall = Boolean(pendingCall);
  const onAccept = isPendingCall ? acceptPendingIncomingCall : acceptCall;
  const onReject = isPendingCall ? rejectPendingIncomingCall : rejectCall;
  const showConnecting = !isPendingCall && isConnecting;
  const callTypeLabel = targetCallType === "video" ? "Video" : "Thoại";
  const hasCurrentDirectCall =
    currentDirectStatus === "active" || currentDirectStatus === "outgoing";
  const shouldConfirmSwitch =
    (isPendingCall && hasCurrentDirectCall) ||
    currentGroupStatus !== "idle";
  const visibleQueuedCalls = queuedCalls.filter(
    (call) => call.roomName !== pendingCall?.roomName,
  );
  const shouldConfirmQueuedSwitch = hasCurrentDirectCall || currentGroupStatus !== "idle";
  const handleAcceptClick = () => {
    if (shouldConfirmSwitch && !showSwitchConfirm) {
      setShowSwitchConfirm(true);
      return;
    }
    void onAccept();
  };
  const handleAcceptQueuedClick = (roomName: string) => {
    if (shouldConfirmQueuedSwitch && queuedConfirmRoom !== roomName) {
      setQueuedConfirmRoom(roomName);
      return;
    }
    void acceptQueuedIncomingCall(roomName);
  };

  if (!targetUser) return null;

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
            name={targetUser.displayName}
            avatarUrl={targetUser.avatarUrl ?? undefined}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{targetUser.displayName}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {callTypeLabel} · Cuộc gọi đến
              {showConnecting && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
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
            onClick={onReject}
            className="p-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            title={showConnecting ? "Hủy" : "Từ chối"}
          >
            <PhoneOff size={16} />
          </button>
          <button
            onClick={handleAcceptClick}
            disabled={showConnecting}
            className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title={showConnecting ? "Đang kết nối" : "Chấp nhận"}
          >
            {showConnecting ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : targetCallType === "video" ? (
              <Video size={16} />
            ) : (
              <Phone size={16} />
            )}
          </button>
        </div>

        {visibleQueuedCalls.length > 0 && (
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            +{visibleQueuedCalls.length} cuộc gọi khác đang chờ
          </div>
        )}

        {showSwitchConfirm && (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <p>Bạn đang trong cuộc gọi. Kết thúc cuộc gọi hiện tại để chuyển qua cuộc gọi mới?</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void onAccept()}
                className="flex-1 rounded-lg bg-primary px-2 py-1.5 font-medium text-primary-foreground"
              >
                Kết thúc và chuyển
              </button>
              <button
                onClick={() => setShowSwitchConfirm(false)}
                className="flex-1 rounded-lg border border-border px-2 py-1.5 font-medium text-foreground"
              >
                Hủy
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden relative">
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
              name={targetUser.displayName}
              avatarUrl={targetUser.avatarUrl ?? undefined}
            />
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {targetCallType === "video"
                ? "Cuộc gọi video đến"
                : "Cuộc gọi thoại đến"}
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {targetUser.displayName}
            </h2>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-around px-6 py-5">
          {/* Reject */}
          <button
            onClick={onReject}
            className="flex flex-col items-center gap-1.5 group"
          >
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 group-hover:scale-105 transition-transform">
              <PhoneOff className="h-6 w-6" />
            </span>
            <span className="text-xs text-muted-foreground">
              {showConnecting ? "Hủy" : "Từ chối"}
            </span>
          </button>

          {/* Accept */}
          <button
            onClick={handleAcceptClick}
            disabled={showConnecting}
            className="flex flex-col items-center gap-1.5 group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform">
              {showConnecting ? (
                <LoaderCircle className="h-6 w-6 animate-spin" />
              ) : targetCallType === "video" ? (
                <Video className="h-6 w-6" />
              ) : (
                <Phone className="h-6 w-6" />
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {showConnecting ? "Đang kết nối..." : "Chấp nhận"}
            </span>
          </button>
        </div>

        {visibleQueuedCalls.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {visibleQueuedCalls.length} cuộc gọi khác đang chờ
            </p>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
              {visibleQueuedCalls.map((call) => (
                <div
                  key={call.roomName}
                  className="rounded-xl border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      type="chat"
                      name={call.from.displayName}
                      avatarUrl={call.from.avatarUrl ?? undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {call.from.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {call.callType === "video" ? "Cuộc gọi video" : "Cuộc gọi thoại"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => rejectQueuedIncomingCall(call.roomName)}
                      className="grid h-8 w-8 place-items-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
                      title="Từ chối"
                    >
                      <PhoneOff size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAcceptQueuedClick(call.roomName)}
                      className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
                      title="Chấp nhận"
                    >
                      {call.callType === "video" ? <Video size={15} /> : <Phone size={15} />}
                    </button>
                  </div>

                  {queuedConfirmRoom === call.roomName && (
                    <div className="mt-2 rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                      <p>Bạn đang trong cuộc gọi. Kết thúc cuộc gọi hiện tại để chuyển qua cuộc gọi mới?</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void acceptQueuedIncomingCall(call.roomName)}
                          className="h-8 flex-1 rounded-lg bg-primary font-medium text-primary-foreground"
                        >
                          Kết thúc và chuyển
                        </button>
                        <button
                          type="button"
                          onClick={() => setQueuedConfirmRoom(null)}
                          className="h-8 flex-1 rounded-lg border border-border font-medium text-foreground"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {showSwitchConfirm && (
          <div className="border-t border-border bg-muted/40 px-5 py-4 text-center">
            <p className="text-sm text-foreground">
              Bạn đang trong cuộc gọi. Kết thúc cuộc gọi hiện tại để chuyển qua cuộc gọi mới?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void onAccept()}
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

export default IncomingCallModal;
