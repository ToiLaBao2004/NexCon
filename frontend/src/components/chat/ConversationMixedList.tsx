import { useEffect, useState, useMemo, useRef } from "react";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import DirectMessageCard from "./DirectMessageCard";
import GroupChatCard from "./GroupChatCard";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

const ConversationMixedList = () => {
  const { conversations, fetchConversations } = useChatStore();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (conversations.length === 0) {
      fetchConversations();
    }
  }, [conversations.length, fetchConversations]);

  if (!conversations) return null;

  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return conversations;

    return conversations.filter((c) => {
      if (c.type === "group") {
        return (c.group?.name ?? "").toLowerCase().includes(keyword);
      }
      // direct: match nickname or displayName
      const other = c.participants.find(
        (p) => p.userId?._id?.toString() !== user?._id?.toString()
      );
      const name = other?.userId?.nickname?.trim() || other?.userId?.displayName || "";
      return name.toLowerCase().includes(keyword);
    });
  }, [conversations, searchQuery, user?._id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search bar */}
      <div className="shrink-0 px-2 pb-2 bg-card">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm cuộc trò chuyện (Ctrl+K)..."
            className="pl-8 pr-8 h-8 text-[13px] rounded-xl border-border/50 bg-muted/30 focus-visible:ring-1 focus-visible:ring-primary/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 min-h-0 overflow-y-auto beautiful-scrollbar px-2 pb-2 pt-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? (
              <>
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Không tìm thấy kết quả cho <span className="font-medium">"{searchQuery}"</span></p>
              </>
            ) : (
              "Chưa có cuộc trò chuyện nào"
            )}
          </div>
        ) : (
          filtered.map((convo) =>
            convo.type === "group" ? (
              <GroupChatCard convo={convo} key={convo._id} />
            ) : (
              <DirectMessageCard convo={convo} key={convo._id} />
            )
          )
        )}
      </div>
    </div>
  );
};

export default ConversationMixedList;
