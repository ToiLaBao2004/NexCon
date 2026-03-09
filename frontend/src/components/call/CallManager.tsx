import { useCallStore } from "@/stores/useCallStore";
import IncomingCallModal from "./IncomingCallModal";
import OutgoingCallModal from "./OutgoingCallModal";
import CallModal from "./CallModal";

const CallManager = () => {
  const status = useCallStore((s) => s.status);

  if (status === "incoming") return <IncomingCallModal />;
  if (status === "outgoing") return <OutgoingCallModal />;
  if (status === "active") return <CallModal />;

  return null;
};

export default CallManager;
