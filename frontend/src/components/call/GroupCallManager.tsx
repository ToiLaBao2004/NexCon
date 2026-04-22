import { useGroupCallStore } from "@/stores/useGroupCallStore";
import IncomingGroupCallModal from "./IncomingGroupCallModal";
import GroupCallScreen from "./GroupCallScreen";
import { useChatStore } from "@/stores/useChatStore";

const GroupCallManager = () => {
  const status = useGroupCallStore((s) => s.status);
  const isMutedCall = useGroupCallStore((s) => s.isMutedCall);
  const conversationId = useGroupCallStore((s) => s.conversationId);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  if (status === "incoming") {
    if (isMutedCall && activeConversationId !== conversationId) {
      return null;
    }
    return <IncomingGroupCallModal />;
  }
  if (status === "outgoing" || status === "joining" || status === "active")
    return <GroupCallScreen />;

  return null;
};

export default GroupCallManager;
