import { useState, useEffect } from "react";
import { useCallStore } from "@/stores/useCallStore";
import IncomingCallModal from "./IncomingCallModal";
import OutgoingCallModal from "./OutgoingCallModal";
import CallModal from "./CallModal";
import { useChatStore } from "@/stores/useChatStore";

const CallManager = () => {
  const status = useCallStore((s) => s.status);
  const isMutedCall = useCallStore((s) => s.isMutedCall);
  const remoteUser = useCallStore((s) => s.remoteUser);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const activeConversation = useChatStore((s) =>
    s.conversations.find((c) => c._id === activeConversationId)
  );

  const [isMinimized, setIsMinimized] = useState(false);

  // Reset minimize when call ends or becomes active (auto-expand when answered)
  useEffect(() => {
    if (status === "idle" || status === "active") setIsMinimized(false);
  }, [status]);

  if (status === "incoming") {
    if (isMutedCall) {
      const isViewing =
        activeConversation?.type === "direct" &&
        activeConversation.participants.some(
          (p) =>
            (p.userId?._id || p.userId)?.toString() ===
            remoteUser?._id?.toString()
        );
      if (!isViewing && !isMinimized) return null;
    }
    return (
      <IncomingCallModal
        isMinimized={isMinimized}
        onMinimize={() => setIsMinimized(true)}
        onMaximize={() => setIsMinimized(false)}
      />
    );
  }
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
