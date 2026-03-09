import type { CallRecord } from "@/types/call";
import { cn } from "@/lib/utils";
import { Phone, Video, Ban, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCallStore } from "@/stores/useCallStore";

interface CallMessageBubbleProps {
  call: CallRecord;
  currentUserId: string;
  isOwn: boolean;
}

const CallMessageBubble = ({ call, currentUserId, isOwn }: CallMessageBubbleProps) => {
  const { startCall, status: callStatus } = useCallStore();

  const isInitiator = call.initiatorUser._id === currentUserId;

  const myParticipant = call.participants.find(
    (p) => p.userId._id === currentUserId
  );

  const otherParticipant = call.participants.find(
    (p) => p.userId._id !== currentUserId
  );

  const getCallInfo = (): {
    label: string;
    color: string;
    statusType: "rejected" | "missed" | "canceled" | "incoming" | "ended" | "active";
  } => {
    const { overallStatus } = call;
    const myStatus = myParticipant?.status;

    if (overallStatus === "missed") {
      return {
        label: isInitiator ? "Không trả lời" : "Cuộc gọi nhỡ",
        color: "text-[#c21807]",
        statusType: "missed",
      };
    }

    if (overallStatus === "canceled") {
      if (myStatus === "declined") {
        return {
          label: "Bạn đã từ chối",
          color: "text-[#c21807]",
          statusType: "rejected",
        };
      }
      if (isInitiator) {
        const otherDeclined = call.participants.some(
          (p) => p.userId._id !== currentUserId && p.status === "declined"
        );
        if (otherDeclined) {
          return {
            label: "Đã bị từ chối",
            color: "text-[#c21807]",
            statusType: "rejected",
          };
        }
        return {
          label: "Đã hủy",
          color: "text-slate-500",
          statusType: "canceled",
        };
      }
      return {
        label: "Cuộc gọi đến",
        color: "text-slate-500",
        statusType: "incoming",
      };
    }

    if (overallStatus === "ended") {
      return {
        label: isInitiator ? "Cuộc gọi đi" : "Cuộc gọi đến",
        color: "text-slate-900 dark:text-zinc-100",
        statusType: "ended",
      };
    }

    return {
      label: "Đang diễn ra",
      color: "text-green-600",
      statusType: "active",
    };
  };

  const { label, color, statusType } = getCallInfo();

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const durationText = formatDuration(call.duration);
  const isVoice = call.type === "voice";
  const callTypeLabel = isVoice ? "Cuộc gọi thoại" : "Cuộc gọi video";
  const CallTypeIcon = isVoice ? Phone : Video;

  const canCallBack = otherParticipant && callStatus === "idle";
  const handleCallBack = () => {
    if (!canCallBack || !otherParticipant) return;
    startCall(
      {
        _id: otherParticipant.userId._id,
        displayName: otherParticipant.userId.displayName,
        avatarUrl: otherParticipant.userId.avatarUrl ?? null,
      },
      call.type
    );
  };

  return (
    <Card
      className={cn(
        "px-4 py-3 text-sm shadow-sm border border-slate-200/80 rounded-[0.75rem] w-[220px]",
        "bg-white dark:bg-zinc-900 shadow-slate-100/50 dark:shadow-none",
        isOwn ? "rounded-br-none" : "rounded-bl-none"
      )}
    >
      {/* Tiêu đề trạng thái */}
      <div className={cn("text-[14px] font-bold mb-2 tracking-tight leading-tight", color)}>
        {label}
      </div>

      {/* Thông tin loại cuộc gọi + Icon */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-shrink-0">
          <CallTypeIcon className="h-5 w-5 text-slate-500/70" strokeWidth={1.5} />
          {(statusType === "rejected" || statusType === "missed") && (
            <div className="absolute -top-1 -right-1 bg-white dark:bg-zinc-900 rounded-full">
              <Ban className="h-2.5 w-2.5 text-[#c21807]" strokeWidth={4} />
            </div>
          )}
          {statusType === "canceled" && (
            <div className="absolute -top-1 -right-1 bg-white dark:bg-zinc-900 rounded-full">
              <AlertCircle className="h-2.5 w-2.5 text-slate-400" strokeWidth={4} />
            </div>
          )}
        </div>
        <div className="flex flex-col justify-center overflow-hidden">
          <span className="text-[14px] font-medium text-slate-500 dark:text-zinc-400 whitespace-nowrap leading-normal">
            {callTypeLabel}
          </span>
          {durationText && (
            <span className="text-[11px] tabular-nums text-slate-400 font-medium tracking-tight mt-0.5 leading-normal">
              {durationText}
            </span>
          )}
        </div>
      </div>

      {/* Separator */}
      <div className="h-[1px] bg-slate-100 dark:bg-zinc-800 -mx-4" />

      {/* Nút Gọi lại */}
      <button
        onClick={handleCallBack}
        disabled={!canCallBack}
        className={cn(
          "w-full text-center text-[14px] font-bold pt-2 pb-0.5 leading-none transition-all duration-200",
          canCallBack
            ? "text-[#0052cc] hover:text-[#0747a6] cursor-pointer"
            : "text-slate-300 dark:text-zinc-700 cursor-not-allowed"
        )}
      >
        Gọi lại
      </button>
    </Card>
  );
};

export default CallMessageBubble;