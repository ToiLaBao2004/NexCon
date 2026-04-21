import { useMeetStore } from "@/stores/useMeetStore";
import GroupCallRoom from "./GroupCallRoom";
import { useDraggable } from "@/hooks/useDraggable";

const MeetManager = () => {
  const { isInMeeting, token, roomName, roomLabel, isMinimized, leaveMeeting, setMinimized } =
    useMeetStore();
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
          onLeave={leaveMeeting}
          minimized={true}
          onMinimize={() => setMinimized(true)}
          onMaximize={() => setMinimized(false)}
          enablePresenceToasts
        />
      </div>
    );
  }

  // Full-screen overlay
  return (
    <div className="fixed top-0 right-0 bottom-0 left-0 md:top-2 md:right-2 md:bottom-2 md:left-[5rem] z-[90] bg-background md:rounded-2xl md:border md:border-border/40 md:shadow-soft flex flex-col overflow-hidden">
      <GroupCallRoom
        roomName={roomName}
        roomLabel={roomLabel || undefined}
        token={token}
        onLeave={leaveMeeting}
        minimized={false}
        onMinimize={() => setMinimized(true)}
        onMaximize={() => setMinimized(false)}
        enablePresenceToasts
      />
    </div>
  );
};

export default MeetManager;
