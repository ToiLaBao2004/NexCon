import { useState, useEffect } from "react";
import { useCallStore } from "@/stores/useCallStore";
import IncomingCallModal from "./IncomingCallModal";
import OutgoingCallModal from "./OutgoingCallModal";
import CallModal from "./CallModal";

const CallManager = () => {
  const status = useCallStore((s) => s.status);
  const [isMinimized, setIsMinimized] = useState(false);

  // Reset minimize when call ends or becomes active (auto-expand when answered)
  useEffect(() => {
    if (status === "idle" || status === "active") setIsMinimized(false);
  }, [status]);

  if (status === "incoming") return <IncomingCallModal />;
  if (status === "outgoing")
    return (
      <OutgoingCallModal
        isMinimized={isMinimized}
        onMinimize={() => setIsMinimized(true)}
        onMaximize={() => setIsMinimized(false)}
      />
    );
  if (status === "active")
    return (
      <CallModal
        isMinimized={isMinimized}
        onMinimize={() => setIsMinimized(true)}
        onMaximize={() => setIsMinimized(false)}
      />
    );

  return null;
};

export default CallManager;
