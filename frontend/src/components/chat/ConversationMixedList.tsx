import { useEffect, useState, useMemo, useRef, type UIEvent } from "react";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import DirectMessageCard from "./DirectMessageCard";
import GroupChatCard from "./GroupChatCard";
import { Input } from "@/components/ui/input";
import { Search, X, Loader2 } from "lucide-react";

const ConversationMixedList = () => {
  const {
    conversations,
    fetchConversations,
    fetchMoreConversations,
    conversationsHasMore,
    convoLoading,
    setFocusedConversation,
  } = useChatStore();
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

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    if (searchQuery.trim() || convoLoading || !conversationsHasMore) return;
    const t = e.currentTarget;
    if (t.scrollTop + t.clientHeight >= t.scrollHeight * 0.7) {
      void fetchMoreConversations();
    }
  };

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
      <div className="shrink-0 bg-card pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground pointer-events-none" strokeWidth={1.65} />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm cuộc trò chuyện (Ctrl+K)..."
            className="h-11 rounded-xl border-border/60 bg-muted/30 pl-10 pr-9 text-[15px] shadow-sm focus-visible:ring-1 focus-visible:ring-primary/40"
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
      <div
        className="flex-1 min-h-0 overflow-y-auto beautiful-scrollbar pb-5 pt-2 space-y-2.5"
        onScroll={handleScroll}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            setFocusedConversation(null);
          }
        }}
      >
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
              <GroupChatCard convo={convo} key={convo._id} density="people" />
            ) : (
              <DirectMessageCard convo={convo} key={convo._id} density="people" />
            )
          )
        )}
        {convoLoading && conversations.length > 0 && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationMixedList;
