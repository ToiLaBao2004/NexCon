import { useGroupCallStore } from "@/stores/useGroupCallStore";
import { PhoneIncoming } from "lucide-react";
import { useCallStore } from "@/stores/useCallStore";

interface OngoingCallBannerProps {
  conversationId: string;
}

const OngoingCallBanner = ({ conversationId }: OngoingCallBannerProps) => {
  const hasLeft = useGroupCallStore((s) => s.hasLeftActiveCall[conversationId]);
  const groupCallStatus = useGroupCallStore((s) => s.status);
  const callStatus = useCallStore((s) => s.status);
  const rejoinGroupCall = useGroupCallStore((s) => s.rejoinGroupCall);

  if (!hasLeft || groupCallStatus !== "idle" || callStatus !== "idle")
    return null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-green-500/10 border-b border-green-500/20">
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <span className="text-sm font-medium">Cuộc gọi nhóm đang diễn ra</span>
      </div>
      <button
        onClick={() => rejoinGroupCall(conversationId)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors"
      >
        <PhoneIncoming className="h-4 w-4" />
        Tham gia
      </button>
    </div>
  );
};

export default OngoingCallBanner;

