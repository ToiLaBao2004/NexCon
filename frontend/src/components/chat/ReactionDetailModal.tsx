import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useChatStore } from "@/stores/useChatStore";
import UserAvatar from "./UserAvatar";
import { cn } from "@/lib/utils";

interface ReactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  reactions: { userId: string; emoji: string }[];
}

export default function ReactionDetailModal({
  isOpen,
  onClose,
  reactions,
}: ReactionDetailModalProps) {
  const { conversations, activeConversationId } = useChatStore();
  const [activeTab, setActiveTab] = useState<string>("all");

  const conversation = conversations.find((c) => c._id === activeConversationId);
  const participants = conversation?.participants ?? [];

  const emojiSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    reactions.forEach((r) => {
      summary[r.emoji] = (summary[r.emoji] || 0) + 1;
    });
    return Object.entries(summary).sort((a, b) => b[1] - a[1]);
  }, [reactions]);

  const userReactions = useMemo(() => {
    const grouped: Record<string, { userId: string; displayName: string; avatarUrl?: string; emojis: string[] }> = {};
    
    reactions.forEach((r) => {
      if (!grouped[r.userId]) {
        const p = participants.find((part) => part.userId._id === r.userId);
        grouped[r.userId] = {
          userId: r.userId,
          displayName: p?.userId.nickname?.trim() || p?.userId.displayName || "Người dùng",
          avatarUrl: p?.userId.avatarUrl || undefined,
          emojis: [],
        };
      }
      grouped[r.userId].emojis.push(r.emoji);
    });

    return Object.values(grouped);
  }, [reactions, participants]);

  const filteredUsers = useMemo(() => {
    if (activeTab === "all") return userReactions;
    return userReactions.filter((u) => u.emojis.includes(activeTab));
  }, [userReactions, activeTab]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[450px] p-0 overflow-hidden sm:rounded-xl" showCloseButton={false}>
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0 text-left sm:text-left">
          <DialogTitle className="text-base font-semibold">Biểu cảm</DialogTitle>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </DialogHeader>

        <div className="flex h-[400px]">
          {/* Left Tab Sidebar */}
          <div className="w-[140px] border-r bg-muted/20 overflow-y-auto beautiful-scrollbar">
            <button
              onClick={() => setActiveTab("all")}
              className={cn(
                "w-full px-4 py-3 flex items-center justify-between text-sm transition-colors hover:bg-muted/40",
                activeTab === "all" && "bg-background font-medium text-primary shadow-sm"
              )}
            >
              <span>Tất cả</span>
              <span className="text-xs opacity-60">{reactions.length}</span>
            </button>
            {emojiSummary.map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => setActiveTab(emoji)}
                className={cn(
                  "w-full px-4 py-3 flex items-center justify-between text-sm transition-colors hover:bg-muted/40",
                  activeTab === emoji && "bg-background font-medium text-primary shadow-sm"
                )}
              >
                <span className="text-lg leading-none">{emoji}</span>
                <span className="text-xs opacity-60">{count}</span>
              </button>
            ))}
          </div>

          {/* Right Content */}
          <div className="flex-1 overflow-y-auto beautiful-scrollbar p-1">
            {filteredUsers.map((u) => (
              <div key={u.userId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                <UserAvatar type="profile" name={u.displayName} avatarUrl={u.avatarUrl} className="!h-10 !w-10 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.displayName}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 bg-muted/40 px-2 py-0.5 rounded-full">
                  {u.emojis.map((e, i) => (
                    <span key={i} className="text-lg leading-none">{e}</span>
                  ))}
                  {u.emojis.length > 1 && (
                    <span className="text-[11px] font-medium opacity-60">{u.emojis.length}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
