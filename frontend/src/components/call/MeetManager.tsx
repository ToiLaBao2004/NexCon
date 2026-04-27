import { useState } from "react";
import { useMeetStore } from "@/stores/useMeetStore";
import GroupCallRoom, { type RoomParticipantSummary } from "./GroupCallRoom";
import { useDraggable } from "@/hooks/useDraggable";
import WaitingRoomPanel from "./WaitingRoomPanel";
import { Users } from "lucide-react";

const MeetManager = () => {
  const {
    isInMeeting,
    token,
    roomName,
    roomLabel,
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
          roomLabel={roomLabel || undefined}
          token={token}
          initialVideoEnabled={preferredCameraEnabled}
          initialAudioEnabled={preferredMicEnabled}
          onLeave={leaveMeeting}
          minimized={true}
          onMinimize={() => setMinimized(true)}
          onMaximize={() => setMinimized(false)}
          enablePresenceToasts
          onParticipantsChange={setParticipants}
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
            roomLabel={roomLabel || undefined}
            token={token}
            initialVideoEnabled={preferredCameraEnabled}
            initialAudioEnabled={preferredMicEnabled}
            onLeave={leaveMeeting}
            minimized={false}
            onMinimize={() => setMinimized(true)}
            onMaximize={() => setMinimized(false)}
            enablePresenceToasts
            onParticipantsChange={setParticipants}
          />

          <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
            {isHost && waitingRoom.length > 0 ? (
              <button
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500 px-4 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-emerald-400"
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
    </div>
  );
};

export default MeetManager;
