import type { Conversation, Message } from "@/types/chat";
import { cn, formatDuration } from "@/lib/utils";
import { Phone, Video, Ban, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCallStore } from "@/stores/useCallStore";
import { useGroupCallStore } from "@/stores/useGroupCallStore";
import { parseCallSnapshot } from "@/utils/callMessageUtils";

interface CallMessageBubbleProps {
  message: Message;
  currentUserId: string;
  isOwn: boolean;
  selectedConvo?: Conversation;
}

const CallMessageBubble = ({ message, currentUserId, isOwn, selectedConvo }: CallMessageBubbleProps) => {
  const { startCall, status: callStatus } = useCallStore();
  const { startGroupCall, status: groupCallStatus } = useGroupCallStore();
  const snapshot = parseCallSnapshot(message);

  if (!snapshot) return null;

  const isInitiator = snapshot.initiatorUser._id === currentUserId;

  const myParticipant = snapshot.participants.find(
    (p) => p.userId._id === currentUserId
  );

  const otherParticipant = snapshot.participants.find(
    (p) => p.userId._id !== currentUserId
  );

  const getCallInfo = (): {
    label: string;
    color: string;
    statusType: "rejected" | "missed" | "canceled" | "incoming" | "ended" | "active";
  } => {
    const { overallStatus } = snapshot;
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
          label: "Đã từ chối",
          color: "text-[#c21807]",
          statusType: "rejected",
        };
      }
      if (isInitiator) {
        const otherDeclined = snapshot.participants.some(
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

  const durationText = formatDuration(snapshot.duration);
  const isVoice = snapshot.callType === "voice";
  const callTypeLabel = isVoice ? "Cuộc gọi thoại" : "Cuộc gọi video";
  const CallTypeIcon = isVoice ? Phone : Video;

  const isCallIdle = callStatus === "idle" && groupCallStatus === "idle";
  const canCallBack = snapshot.mode === "group"
    ? Boolean(message.conversationId) && isCallIdle
    : Boolean(otherParticipant) && isCallIdle;

  const handleCallBack = () => {
    if (!canCallBack) return;

    if (snapshot.mode === "group") {
      if (!message.conversationId) return;
      startGroupCall(message.conversationId, snapshot.callType);
      return;
    }

    if (!otherParticipant) return;
    const otherConversationParticipant = selectedConvo?.participants.find(
      (participant) => participant.userId?._id?.toString?.() === otherParticipant.userId._id
    )?.userId;
    startCall(
      {
        _id: otherParticipant.userId._id,
        displayName: otherConversationParticipant?.nickname?.trim() || otherParticipant.userId.displayName,
        avatarUrl: otherParticipant.userId.avatarUrl ?? null,
      },
      snapshot.callType
    );
  };

  return (
    <Card
      className={cn(
        "px-3 py-2 text-sm shadow-sm border border-slate-200/80 rounded-[0.6rem] w-[185px] h-[117px] flex flex-col justify-between",
        "bg-white dark:bg-zinc-900 shadow-slate-100/50 dark:shadow-none",
        isOwn ? "rounded-br-none" : "rounded-bl-none"
      )}
    >
      {/* Top: label + icon row */}
      <div className="flex flex-col gap-2">
        {/* Tiêu đề trạng thái */}
        <div className={cn("text-[15px] font-bold leading-none", color)}>
          {label}
        </div>

        {/* Thông tin loại cuộc gọi + Icon */}
        <div className="flex items-center gap-1.5">
          <div className="relative shrink-0">
            <CallTypeIcon className="h-[15px] w-[15px] text-slate-500/70" strokeWidth={1.5} />
            {(statusType === "rejected" || statusType === "missed") && (
              <div className="absolute -top-0.5 -right-0.5 bg-white dark:bg-zinc-900 rounded-full">
                <Ban className="h-[7px] w-[7px] text-[#c21807]" strokeWidth={3.5} />
              </div>
            )}
            {statusType === "canceled" && (
              <div className="absolute -top-0.5 -right-0.5 bg-white dark:bg-zinc-900 rounded-full">
                <AlertCircle className="h-[7px] w-[7px] text-slate-400" strokeWidth={3.5} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-hidden">
            <span
              className="text-[15px] font-medium text-slate-500 dark:text-zinc-400 whitespace-nowrap"
              style={{ lineHeight: "1.3" }}
            >
              {callTypeLabel}
            </span>
            {durationText && (
              <span className="text-[11px] tabular-nums text-slate-400 font-medium tracking-tight leading-none">
                {durationText}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: separator + button */}
      <div>
        <div className="h-px bg-slate-100 dark:bg-zinc-800 -mx-3" />
        <button
          onClick={handleCallBack}
          disabled={!canCallBack}
          className={cn(
            "w-full text-center text-[15px] font-bold pt-1.5 pb-0 leading-none transition-all duration-200",
            canCallBack
              ? "text-[#0052cc] hover:text-[#0747a6] cursor-pointer"
              : "text-slate-300 dark:text-zinc-700 cursor-not-allowed"
          )}
        >
          Gọi lại
        </button>
      </div>
    </Card>
  );
};

export default CallMessageBubble;
