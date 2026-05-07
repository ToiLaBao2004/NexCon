import { useGroupCallStore } from "@/stores/useGroupCallStore";
import IncomingGroupCallModal from "./IncomingGroupCallModal";
import GroupCallScreen from "./GroupCallScreen";
import { useChatStore } from "@/stores/useChatStore";

const GroupCallManager = () => {
  const status = useGroupCallStore((s) => s.status);
  const isMutedCall = useGroupCallStore((s) => s.isMutedCall);
  const conversationId = useGroupCallStore((s) => s.conversationId);
  const pendingIncomingCall = useGroupCallStore((s) => s.pendingIncomingCall);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const pendingIncomingModal = pendingIncomingCall &&
    (!pendingIncomingCall.isMutedCall || activeConversationId === pendingIncomingCall.conversationId) ? (
    <IncomingGroupCallModal pendingCall={pendingIncomingCall} />
  ) : null;

  if (status === "incoming") {
    if (isMutedCall && activeConversationId !== conversationId) {
      return pendingIncomingModal;
    }
    return (
      <>
        <IncomingGroupCallModal />
        {pendingIncomingModal}
      </>
    );
  }
  if (status === "outgoing" || status === "joining" || status === "active")
    return (
      <>
        <GroupCallScreen />
        {pendingIncomingModal}
      </>
    );

  return pendingIncomingModal;
};

export default GroupCallManager;
