import { useChatStore } from "@/stores/useChatStore";
import { Plus, Users, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import NewGroupModal from "@/components/chat/NewGroupModal";
import GroupChatCard from "@/components/chat/GroupChatCard";
import { removeAccents } from "@/lib/utils";

export default function GroupsTab() {
    const { conversations } = useChatStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const groups = useMemo(() => {
        const allGroups = conversations.filter(c => c.type === 'group');
        if (!searchQuery.trim()) return allGroups;

        const normalizedQuery = removeAccents(searchQuery.toLowerCase());

        return allGroups.filter(group => {
            const groupName = (group.group?.name || "Nhóm không tên").toLowerCase();
            const normalizedName = removeAccents(groupName);

            return groupName.includes(searchQuery.toLowerCase()) ||
                normalizedName.includes(normalizedQuery);
        });
    }, [conversations, searchQuery]);

    return (
        <div className="space-y-4">
            <div className="sticky top-0 z-20 -mx-4 -mt-4 space-y-4 border-b border-border/40 bg-card/95 px-4 pb-4 pt-4 backdrop-blur-md">
            <div className="relative p-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                    <Search className="h-4 w-4 text-muted-foreground" />
                </span>
                <input
                    placeholder="Tìm kiếm nhóm..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pl-10 pr-10"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery("")}
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

            <div className="flex flex-col gap-2">
                {groups.length > 0 ? (
                    groups.map((group) => (
                        <div key={group._id} className="w-full">
                            <GroupChatCard convo={group as any} hideStatusIcon={true} />
                        </div>
                    ))
                ) : (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 border-2 border-dashed border-border/40 rounded-3xl p-8 text-center">
                        <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                            <Users className="h-8 w-8 text-muted-foreground opacity-50" />
                        </div>
                        <h4 className="text-lg font-semibold text-foreground mb-1">Chưa có nhóm nào</h4>
                        <p className="text-sm max-w-xs">Bạn chưa tham gia nhóm nào. Hãy tạo nhóm mới để bắt đầu trò chuyện cùng bạn bè nhé!</p>
                        <Button
                            variant="outline"
                            onClick={() => setIsModalOpen(true)}
                            className="mt-6 border-primary/20 hover:bg-primary/10 hover:text-primary"
                        >
                            Tạo nhóm ngay
                        </Button>
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
