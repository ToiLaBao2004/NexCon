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
    const formatTime = (dateStr: string | null | undefined) => {
      if (!dateStr) return "";
      if (dateStr === "9999-12-31T23:59:59.999Z") return "khi bạn bật lại";
      return new Date(dateStr).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      });
    };

    const mUntil = muteData?.messages;
    const mtUntil = muteData?.meetings;

    if (isMsgMuted && isMeetMuted) {
      if (mUntil === mtUntil) {
        return `Đã tắt thông báo tin nhắn và cuộc gọi đến ${formatTime(mUntil)}`;
      }
      return `Đã tắt thông báo tin nhắn đến (${formatTime(mUntil)}) và cuộc gọi đến (${formatTime(mtUntil)})`;
    }

    if (isMsgMuted) {
      return `Đã tắt thông báo tin nhắn đến ${formatTime(mUntil)}`;
    }

    if (isMeetMuted) {
      return `Đã tắt thông báo cuộc gọi đến ${formatTime(mtUntil)}`;
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
        className="text-[13px] font-medium text-primary hover:underline transition-all"
      >
        Bật lại
      </button>
    </div>
  );
}
