import { useGroupCallStore } from "@/stores/useGroupCallStore";
import IncomingGroupCallModal from "./IncomingGroupCallModal";
import GroupCallScreen from "./GroupCallScreen";

const GroupCallManager = () => {
  const status = useGroupCallStore((s) => s.status);

  if (status === "incoming") return <IncomingGroupCallModal />;
  if (status === "outgoing" || status === "joining" || status === "active")
    return <GroupCallScreen />;

  return null;
};

export default GroupCallManager;
