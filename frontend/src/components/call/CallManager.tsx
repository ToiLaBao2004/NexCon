import { useState, useEffect } from "react";
import { useCallStore } from "@/stores/useCallStore";
import IncomingCallModal from "./IncomingCallModal";
import OutgoingCallModal from "./OutgoingCallModal";
import CallModal from "./CallModal";
import { useChatStore } from "@/stores/useChatStore";

const CallManager = () => {
  const status = useCallStore((s) => s.status);
  const isMutedCall = useCallStore((s) => s.isMutedCall);
  const isConnecting = useCallStore((s) => s.isConnecting);
  const isRemoteConnecting = useCallStore((s) => s.isRemoteConnecting);
  const remoteUser = useCallStore((s) => s.remoteUser);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const activeConversation = useChatStore((s) =>
    s.conversations.find((c) => c._id === activeConversationId)
  );

  const [isMinimized, setIsMinimized] = useState(false);

  const isEnteringCall =
    (status === "incoming" && isConnecting) ||
    (status === "outgoing" && (isConnecting || isRemoteConnecting));

  useEffect(() => {
    if (status === "idle" || status === "active" || isEnteringCall) setIsMinimized(false);
  }, [status, isEnteringCall]);

  if (status === "active" || isEnteringCall) {
    return (
      <CallModal
        isMinimized={isMinimized}
        onMinimize={() => setIsMinimized(true)}
        onMaximize={() => setIsMinimized(false)}
      />
    );
  }

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
  return null;
};

export default CallManager;
