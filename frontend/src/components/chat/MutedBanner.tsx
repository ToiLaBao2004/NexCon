import { BellOff } from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { isMuted } from "@/utils/isMuted";
import { useMemo } from "react";

export function MutedBanner() {
  const { activeConversationId, conversations, muteConversation } = useChatStore();
  const currentUserId = useAuthStore((s) => s.user?._id);

  const selectedConvo = useMemo(() =>
    conversations.find((c) => c._id === activeConversationId),
    [conversations, activeConversationId]
  );

  const myParticipant = useMemo(() =>
    selectedConvo?.participants?.find(
      (p) => (p.userId?._id || p.userId)?.toString() === currentUserId?.toString()
    ),
    [selectedConvo, currentUserId]
  );

  const muteData = myParticipant?.mute;
  const isMsgMuted = isMuted(muteData, "messages");
  const isMeetMuted = isMuted(muteData, "meetings");

  if (!isMsgMuted && !isMeetMuted) return null;

  const getMuteText = () => {
    const mUntil = muteData?.messages;
    const mtUntil = muteData?.meetings;

    const formatPart = (until: string | null | undefined) => {
      if (!until) return "";
      const date = new Date(until);
      if (date.getFullYear() >= 9999) return "cho đến khi bạn bật lại";
      return `đến ${date.toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      })}`;
    };

    if (isMsgMuted && isMeetMuted) {
      if (mUntil === mtUntil) {
        return `Đã tắt thông báo tin nhắn và cuộc gọi ${formatPart(mUntil)}`;
      }
      return `Đã tắt thông báo tin nhắn (${formatPart(mUntil)}) và cuộc gọi (${formatPart(mtUntil)})`;
    }

    if (isMsgMuted) {
      return `Đã tắt thông báo tin nhắn ${formatPart(mUntil)}`;
    }

    if (isMeetMuted) {
      return `Đã tắt thông báo cuộc gọi ${formatPart(mtUntil)}`;
    }

    return "";
  };

  const handleUnmute = () => {
    if (!activeConversationId) return;
    muteConversation(activeConversationId, "both", "off");
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border/60 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
        <BellOff className="h-3.5 w-3.5" />
        <span>{getMuteText()}</span>
      </div>
      <button
        onClick={handleUnmute}
        className="text-[13px] font-medium text-primary hover:underline transition-all cursor-pointer"
      >
        Bật lại
      </button>
    </div>
  );
}
