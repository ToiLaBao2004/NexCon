import { useEffect, useState } from "react";
import { Loader2, RefreshCcw, Sparkles, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import UserSearch from "../shared/UserSearch";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import type { FriendSuggestion } from "@/types/user";

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getInitial = (name?: string) => name?.trim()?.charAt(0)?.toUpperCase() || "?";

const getSuggestionHint = (suggestion: FriendSuggestion) => {
  const mutualNames = suggestion.reasons.mutualFriends.map((friend) => friend.displayName).filter(Boolean);
  const groupNames = suggestion.reasons.commonGroups.map((group) => group.name).filter(Boolean);

  if (mutualNames.length > 0) {
    return `Bạn chung: ${mutualNames.slice(0, 2).join(", ")}${mutualNames.length > 2 ? ` +${mutualNames.length - 2}` : ""}`;
  }

  if (groupNames.length > 0) {
    return `Nhóm chung: ${groupNames.slice(0, 2).join(", ")}${groupNames.length > 2 ? ` +${groupNames.length - 2}` : ""}`;
  }

  if (suggestion.reasons.sameEmailDomain) {
    return "Cùng miền email";
  }

  if (suggestion.reasons.recentlyJoined) {
    return "Thành viên mới";
  }

  return suggestion.email || "Từ gợi ý kết bạn";
};

const SuggestionSkeleton = () => (
  <div className="flex items-center gap-3 px-1 py-2.5">
    <div className="h-11 w-11 shrink-0 rounded-full bg-muted" />
    <div className="min-w-0 flex-1 space-y-2">
      <div className="h-4 w-36 rounded bg-muted" />
      <div className="h-3 w-48 rounded bg-muted" />
    </div>
    <div className="h-8 w-20 rounded-md bg-muted" />
  </div>
);

const AddFriendModal = ({ isOpen, onClose }: AddFriendModalProps) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const openChat = useChatStore((s) => s.openChat);
  const {
    friendSuggestions,
    fetchingFriendSuggestions,
    fetchFriendSuggestions,
    fetchSentRequests,
    sendFriendRequest,
  } = useFriendStore();

  useEffect(() => {
    if (!isOpen) return;

    void fetchFriendSuggestions();
    void fetchSentRequests();
  }, [fetchFriendSuggestions, fetchSentRequests, isOpen]);

  const handleOpenChat = async (friend: any) => {
    const friendId = friend.friendId || friend._id;
    await openChat({ userId: friendId });
    onClose();
  };

  const handleSendRequest = async (suggestion: FriendSuggestion) => {
    try {
      setProcessingId(suggestion._id);
      await sendFriendRequest({ userId: suggestion._id, email: suggestion.email });
      await fetchSentRequests(true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRefreshSuggestions = () => {
    void fetchFriendSuggestions(true);
  };

  const visibleSuggestions = friendSuggestions.slice(0, 8);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[500px]">
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="text-lg font-semibold">Thêm bạn</DialogTitle>
          <DialogDescription className="sr-only">
            Tìm kiếm người dùng và gửi lời mời kết bạn.
          </DialogDescription>
        </DialogHeader>

        <div className="beautiful-scrollbar max-h-[70vh] overflow-y-auto px-5 py-4">
          <UserSearch className="border-b border-border/50 pb-4" onOpenChat={handleOpenChat} />

          <section className="pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-normal text-slate-950 dark:text-foreground">Có thể bạn quen</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRefreshSuggestions}
                disabled={fetchingFriendSuggestions}
                className="h-8 shrink-0 gap-1.5 px-2 text-xs"
              >
                {fetchingFriendSuggestions ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
                Làm mới
              </Button>
            </div>

            {fetchingFriendSuggestions && visibleSuggestions.length === 0 ? (
              <div className="space-y-1">
                <SuggestionSkeleton />
                <SuggestionSkeleton />
                <SuggestionSkeleton />
              </div>
            ) : visibleSuggestions.length > 0 ? (
              <div className="space-y-1">
                {visibleSuggestions.map((suggestion) => {
                  const isProcessing = processingId === suggestion._id;

                  return (
                    <div
                      key={suggestion._id}
                      className="flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarImage src={suggestion.avatarUrl} />
                        <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                          {getInitial(suggestion.displayName)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {suggestion.displayName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {getSuggestionHint(suggestion)}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isProcessing}
                        onClick={() => void handleSendRequest(suggestion)}
                        className="h-8 shrink-0 gap-1.5 rounded-md border-primary bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      >
                        {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                        Kết bạn
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center text-muted-foreground">
                <Sparkles className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm font-medium text-foreground">Chưa có gợi ý phù hợp</p>
                <p className="mt-1 text-xs">Bạn có thể tìm người dùng bằng ô tìm kiếm phía trên.</p>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Hủy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddFriendModal;
