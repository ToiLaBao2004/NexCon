import { useState } from "react";
import { useMeetStore } from "@/stores/useMeetStore";
import GroupCallRoom, { type RoomParticipantSummary } from "./GroupCallRoom";
import { useDraggable } from "@/hooks/useDraggable";
import WaitingRoomPanel from "./WaitingRoomPanel";
import { Users, AlertTriangle } from "lucide-react";
import api from "@/lib/axios";

const MeetManager = () => {
  const {
    isInMeeting,
    token,
    roomName,
    waitingRoom,
    isHost,
    preferredCameraEnabled,
    preferredMicEnabled,
    isMinimized,
    leaveMeeting,
    setMinimized,
  } =
    useMeetStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [participants, setParticipants] = useState<RoomParticipantSummary[]>([]);
  const { ref: dragRef, style: dragStyle, dragHandlers } = useDraggable({ placement: "top-center" });

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<(() => void) | null>(null);

  const handleLeaveIntercept = (disconnect: () => void) => {
    if (isHost) {
      setPendingDisconnect(() => disconnect);
      setShowLeaveModal(true);
    } else {
      disconnect();
    }
  };

  const handleLeaveOnly = () => {
    if (pendingDisconnect) pendingDisconnect();
    setShowLeaveModal(false);
    setPendingDisconnect(null);
  };

  const handleEndForAll = async () => {
    try {
      if (roomName) {
        await api.delete(`/livekit/end/${roomName}`);
      }
    } catch (error) {
      console.error("Failed to end meeting", error);
    } finally {
      if (pendingDisconnect) pendingDisconnect();
      setShowLeaveModal(false);
      setPendingDisconnect(null);
    }
  };

  if (!isInMeeting || !token || !roomName) return null;

  if (isMinimized) {
    return (
      <div
        ref={dragRef}
        style={dragStyle}
        {...dragHandlers}
        className="z-[90] w-80 rounded-2xl shadow-2xl border border-border bg-card flex flex-col overflow-hidden cursor-grab active:cursor-grabbing"
      >
        <GroupCallRoom
          roomName={roomName}
          token={token}
          initialVideoEnabled={preferredCameraEnabled}
          initialAudioEnabled={preferredMicEnabled}
          onLeave={leaveMeeting}
          minimized={true}
          onMinimize={() => setMinimized(true)}
          onMaximize={() => setMinimized(false)}
          enablePresenceToasts
          onParticipantsChange={setParticipants}
          onLeaveIntercept={handleLeaveIntercept}
        />
      </div>
    );
  }

  // Full-screen overlay
  return (
    <div className="fixed top-0 right-0 bottom-0 left-0 md:top-2 md:right-2 md:bottom-2 md:left-[5rem] z-[90] bg-background md:rounded-2xl md:border md:border-border/40 md:shadow-soft overflow-hidden">
      <div className="flex h-full min-w-0">
        <div className="relative flex min-w-0 flex-1">
          <GroupCallRoom
            roomName={roomName}
            token={token}
            initialVideoEnabled={preferredCameraEnabled}
            initialAudioEnabled={preferredMicEnabled}
            onLeave={leaveMeeting}
            minimized={false}
            onMinimize={() => setMinimized(true)}
            onMaximize={() => setMinimized(false)}
            enablePresenceToasts
            onParticipantsChange={setParticipants}
            onLeaveIntercept={handleLeaveIntercept}
          />

          <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
            {isHost && waitingRoom.length > 0 ? (
              <button
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-primary/40 bg-primary px-4 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-primary/90"
              >
                Cho phép {waitingRoom.length} khách vào
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs font-bold text-white">
                  {waitingRoom.length}
                </span>
              </button>
            ) : (
              <button
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 text-sm font-semibold text-foreground shadow-lg transition-colors hover:bg-muted dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <Users size={16} />
                {participants.length}
              </button>
            )}
          </div>
        </div>

        {isSidebarOpen && roomName && (
          <div className="hidden h-full w-[23rem] shrink-0 border-l border-border/60 bg-card/70 p-3 dark:border-border/50 dark:bg-slate-900/70 md:block">
            <WaitingRoomPanel
              roomName={roomName}
              isHost={isHost}
              participants={participants}
              onClose={() => setIsSidebarOpen(false)}
            />
          </div>
        )}

        {isSidebarOpen && roomName && (
          <div className="absolute inset-0 z-30 bg-black/40 p-3 md:hidden">
            <div className="ml-auto h-full w-[min(24rem,100%)]">
              <WaitingRoomPanel
                roomName={roomName}
                isHost={isHost}
                participants={participants}
                onClose={() => setIsSidebarOpen(false)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Leave Meeting Modal for Host */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Rời cuộc họp
              </h3>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={handleEndForAll}
                className="w-full rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                Kết thúc cuộc họp với tất cả
              </button>
              <button
                onClick={handleLeaveOnly}
                className="w-full rounded-xl border border-border bg-background py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Chỉ rời cuộc họp
              </button>
              <button
                onClick={() => {
                  setShowLeaveModal(false);
                  setPendingDisconnect(null);
                }}
                className="w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetManager;
