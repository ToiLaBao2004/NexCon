import {cn} from "@/lib/utils";
import type { UserPresenceStatus } from "@/types/user";

const statusClasses: Record<UserPresenceStatus, string> = {
  online: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]",
  away: "bg-amber-400",
  busy: "bg-red-500",
  do_not_disturb: "bg-red-600",
  invisible: "bg-zinc-400",
  offline: "status-offline",
};

const StatusBadge = ({status} : {status: UserPresenceStatus}) => {
  return (
    <div className={cn(
        "absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-2 border-card",
        statusClasses[status] || statusClasses.offline
    )}>
      {status === "do_not_disturb" && (
        <span className="absolute left-1/2 top-1/2 h-0.5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      )}
    </div>
  );
};

export default StatusBadge;
