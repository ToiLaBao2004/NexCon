import { useChatStore } from "@/stores/useChatStore";
import { Plus, Users, Search, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback, type UIEvent } from "react";
import NewGroupModal from "@/components/chat/NewGroupModal";
import GroupChatCard from "@/components/chat/GroupChatCard";
import type { Conversation } from "@/types/chat";

export default function GroupsTab() {
    const { groupConversations, groupsFetched, groupsLoading, groupsHasMore, fetchGroups, fetchMoreGroups, searchGroups } = useChatStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Conversation[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!groupsFetched) fetchGroups();
    }, [groupsFetched, fetchGroups]);

    // Debounced server-side search
    const doSearch = useCallback((query: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = query.trim();
        if (!trimmed) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        debounceRef.current = setTimeout(async () => {
            const results = await searchGroups(trimmed);
            setSearchResults(results as Conversation[]);
            setIsSearching(false);
        }, 350);
    }, [searchGroups]);

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        doSearch(value);
    };

    const handleScroll = (e: UIEvent<HTMLDivElement>) => {
        if (searchQuery.trim() || groupsLoading || !groupsHasMore) return;
        const t = e.currentTarget;
        if (t.scrollTop + t.clientHeight >= t.scrollHeight * 0.7) {
            void fetchMoreGroups();
        }
    };

    const displayGroups = searchQuery.trim() ? searchResults : groupConversations;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="sticky top-0 z-40 space-y-4 border-b border-border/40 bg-card/95 px-4 pb-4 pt-4 backdrop-blur-md">
            <div className="relative p-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                    <Search className="h-4 w-4 text-muted-foreground" />
                </span>
                <input
                    placeholder="Tìm kiếm nhóm..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pl-10 pr-10"
                />
                {searchQuery && (
                    <button
                        onClick={() => handleSearchChange("")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="flex items-center justify-between px-1">
                <div />
                <Button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all active:scale-95 gap-2"
                >
                    <Plus className="h-4 w-4" />
                    Tạo nhóm mới
                </Button>
            </div>

            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden beautiful-scrollbar px-4 pb-4 pt-4 space-y-2" onScroll={handleScroll}>
                {isSearching ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : displayGroups.length > 0 ? (
                    displayGroups.map((group) => (
                        <div key={group._id} className="w-full">
                            <GroupChatCard convo={group as any} hideStatusIcon={true} />
                        </div>
                    ))
                ) : (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 border-2 border-dashed border-border/40 rounded-3xl p-8 text-center">
                        <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                            <Users className="h-8 w-8 text-muted-foreground opacity-50" />
                        </div>
                        <h4 className="text-lg font-semibold text-foreground mb-1">
                            {searchQuery.trim() ? "Không tìm thấy nhóm" : "Chưa có nhóm nào"}
                        </h4>
                        <p className="text-sm max-w-xs">
                            {searchQuery.trim()
                                ? `Không có nhóm nào khớp với "${searchQuery}"`
                                : "Bạn chưa tham gia nhóm nào. Hãy tạo nhóm mới để bắt đầu trò chuyện cùng bạn bè nhé!"}
                        </p>
                        {!searchQuery.trim() && (
                            <Button
                                variant="outline"
                                onClick={() => setIsModalOpen(true)}
                                className="mt-6 border-primary/20 hover:bg-primary/10 hover:text-primary"
                            >
                                Tạo nhóm ngay
                            </Button>
                        )}
                    </div>
                )}
                {groupsLoading && groupConversations.length > 0 && !searchQuery.trim() && (
                    <div className="flex justify-center py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                )}
            </div>

            <NewGroupModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </div>
    );
}
