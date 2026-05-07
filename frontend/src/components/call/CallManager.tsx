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
  const pendingIncomingCall = useCallStore((s) => s.pendingIncomingCall);
  const pendingIncomingQueue = useCallStore((s) => s.pendingIncomingQueue);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const activeConversation = useChatStore((s) =>
    s.conversations.find((c) => c._id === activeConversationId)
  );

  const [isMinimized, setIsMinimized] = useState(false);
  const [isIncomingMinimized, setIsIncomingMinimized] = useState(false);

  const isEnteringCall =
    (status === "incoming" && isConnecting) ||
    (status === "outgoing" && (isConnecting || isRemoteConnecting));
  const queuedIncomingCalls = [
    ...(pendingIncomingCall ? [pendingIncomingCall] : []),
    ...pendingIncomingQueue,
  ];

  useEffect(() => {
    if (status === "idle" || status === "active" || isEnteringCall) setIsMinimized(false);
  }, [status, isEnteringCall]);

  useEffect(() => {
    if (!pendingIncomingCall) setIsIncomingMinimized(false);
  }, [pendingIncomingCall]);

  const isViewingDirectConversation = (remoteUserId?: string) =>
    activeConversation?.type === "direct" &&
    activeConversation.participants.some(
      (p) =>
        (p.userId?._id || p.userId)?.toString() === remoteUserId?.toString()
    );
  const hasVisibleQueuedIncoming = pendingIncomingQueue.some(
    (call) => !call.isMutedCall || isViewingDirectConversation(call.from._id),
  );

  const pendingIncomingModal = pendingIncomingCall &&
    (!pendingIncomingCall.isMutedCall ||
      isViewingDirectConversation(pendingIncomingCall.from._id) ||
      hasVisibleQueuedIncoming ||
      isIncomingMinimized) ? (
    <IncomingCallModal
      pendingCall={pendingIncomingCall}
      queuedCalls={pendingIncomingQueue}
      isMinimized={isIncomingMinimized}
      onMinimize={() => setIsIncomingMinimized(true)}
      onMaximize={() => setIsIncomingMinimized(false)}
    />
  ) : null;

  if (status === "active" || isEnteringCall) {
    return (
      <>
        <CallModal
          isMinimized={isMinimized}
          onMinimize={() => setIsMinimized(true)}
          onMaximize={() => setIsMinimized(false)}
        />
        {pendingIncomingModal}
      </>
    );
  }

  if (status === "incoming") {
    if (isMutedCall) {
      const isViewing = isViewingDirectConversation(remoteUser?._id);
      if (!isViewing && !isMinimized && queuedIncomingCalls.length === 0) return null;
    }
    return (
      <IncomingCallModal
        queuedCalls={queuedIncomingCalls}
        isMinimized={isMinimized}
        onMinimize={() => setIsMinimized(true)}
        onMaximize={() => setIsMinimized(false)}
      />
    );
  }
  if (status === "outgoing")
    return (
      <>
        <OutgoingCallModal
          isMinimized={isMinimized}
          onMinimize={() => setIsMinimized(true)}
          onMaximize={() => setIsMinimized(false)}
        />
        {pendingIncomingModal}
      </>
    );
  return null;
};

export default CallManager;
