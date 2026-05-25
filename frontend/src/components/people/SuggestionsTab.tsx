import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserProfileDialog } from "@/components/shared/UserProfileDialog";
import type { FriendSuggestion } from "@/types/user";
import { Clock3, Loader2, Mail, MessageSquare, RefreshCcw, Sparkles, UserPlus, Users } from "lucide-react";

interface SuggestionsTabProps {
    suggestions: FriendSuggestion[];
    loading: boolean;
    onRefresh: () => Promise<void>;
    onSendRequest: (suggestion: FriendSuggestion) => Promise<void>;
}

const getInitial = (name?: string) => name?.trim()?.charAt(0)?.toUpperCase() || "?";

const SuggestionSkeleton = () => (
    <div className="flex min-h-[108px] items-center gap-4 rounded-xl border border-border/40 bg-muted/10 px-4 py-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
            <div className="flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
            </div>
        </div>
        <Skeleton className="h-9 w-10 rounded-xl sm:w-28" />
    </div>
);

export default function SuggestionsTab({
    suggestions,
    loading,
    onRefresh,
    onSendRequest,
}: SuggestionsTabProps) {
    const [selectedUser, setSelectedUser] = useState<FriendSuggestion | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const handleOpenProfile = (suggestion: FriendSuggestion) => {
        setSelectedUser(suggestion);
        setIsProfileOpen(true);
    };

    const handleSendRequest = async (suggestion: FriendSuggestion) => {
        try {
            setProcessingId(suggestion._id);
            await onSendRequest(suggestion);
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex justify-end px-1">
                <Button
                    type="button"
                    size="sm"
                    onClick={onRefresh}
                    disabled={loading}
                    className="h-9 shrink-0 gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    Làm mới
                </Button>
            </div>

            {loading && suggestions.length === 0 ? (
                <div className="flex flex-col gap-2.5">
                    <SuggestionSkeleton />
                    <SuggestionSkeleton />
                    <SuggestionSkeleton />
                </div>
            ) : suggestions.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                    {suggestions.map((suggestion) => {
                        const reasons = suggestion.reasons;
                        const mutualNames = reasons.mutualFriends.map((friend) => friend.displayName).join(", ");
                        const groupNames = reasons.commonGroups.map((group) => group.name).join(", ");
                        const isProcessing = processingId === suggestion._id;

                        return (
                            <div
                                key={suggestion._id}
                                className="group flex min-h-[108px] items-center gap-4 rounded-xl border border-transparent bg-transparent px-4 py-3.5 transition-colors hover:bg-muted/60"
                            >
                                <Avatar
                                    className="h-14 w-14 shrink-0 cursor-pointer"
                                    onClick={() => handleOpenProfile(suggestion)}
                                >
                                    <AvatarImage src={suggestion.avatarUrl} />
                                    <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                                        {getInitial(suggestion.displayName)}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleOpenProfile(suggestion)}>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-base font-semibold text-foreground">
                                            {suggestion.displayName}
                                        </p>
                                        {suggestion.score > 0 && (
                                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                                                <Sparkles className="h-3 w-3" />
                                                Phù hợp
                                            </Badge>
                                        )}
                                    </div>

                                    <p className="mt-1 truncate text-sm text-muted-foreground">
                                        {mutualNames
                                            ? `Bạn chung: ${mutualNames}`
                                            : groupNames
                                                ? `Nhóm chung: ${groupNames}`
                                                : suggestion.email || "Thông tin liên hệ đã ẩn"}
                                    </p>

                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {reasons.mutualFriendsCount > 0 && (
                                            <Badge variant="outline" className="gap-1 border-primary/20 text-primary">
                                                <Users className="h-3 w-3" />
                                                {reasons.mutualFriendsCount} bạn chung
                                            </Badge>
                                        )}
                                        {reasons.commonGroupsCount > 0 && (
                                            <Badge variant="outline" className="gap-1">
                                                <MessageSquare className="h-3 w-3" />
                                                {reasons.commonGroupsCount} nhóm chung
                                            </Badge>
                                        )}
                                        {reasons.activeInCommonGroups && (
                                            <Badge variant="outline" className="gap-1">
                                                <Clock3 className="h-3 w-3" />
                                                Nhóm đang hoạt động
                                            </Badge>
                                        )}
                                        {reasons.sameEmailDomain && (
                                            <Badge variant="outline" className="gap-1">
                                                <Mail className="h-3 w-3" />
                                                Cùng miền email
                                            </Badge>
                                        )}
                                        {reasons.recentlyJoined && (
                                            <Badge variant="outline" className="gap-1">
                                                <Sparkles className="h-3 w-3" />
                                                Thành viên mới
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={isProcessing}
                                    onClick={() => handleSendRequest(suggestion)}
                                    className="h-9 w-10 shrink-0 gap-2 rounded-xl px-0 font-semibold shadow-sm transition-all active:scale-95 sm:w-auto sm:px-4"
                                >
                                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                                    <span className="hidden sm:inline">Kết bạn</span>
                                </Button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex h-64 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/40 bg-muted/20 p-8 text-center text-muted-foreground">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                        <Sparkles className="h-8 w-8 text-muted-foreground opacity-50" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold text-foreground">Chưa có gợi ý phù hợp</h3>
                    <p className="max-w-xs text-sm">
                        Khi bạn có thêm bạn bè hoặc tham gia nhóm, NexCon sẽ tìm thêm những kết nối gần với bạn.
                    </p>
                </div>
            )}

            <UserProfileDialog
                open={isProfileOpen}
                onOpenChange={setIsProfileOpen}
                user={
                    selectedUser
                        ? {
                            _id: selectedUser._id,
                            displayName: selectedUser.displayName,
                            email: selectedUser.email,
                            avatarUrl: selectedUser.avatarUrl,
                            bio: selectedUser.bio,
                            phone: selectedUser.phone,
                        }
                        : null
                }
            />
        </div>
    );
}
