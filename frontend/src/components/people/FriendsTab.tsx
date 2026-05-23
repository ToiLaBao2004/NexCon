import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserX } from "lucide-react";
import { useState } from "react";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { FriendActionButtons } from "@/components/people/FriendActionButtons";
import { UserProfileDialog } from "@/components/shared/UserProfileDialog";
import { useSocketStore } from "@/stores/useSocketStore";
import StatusBadge from "@/components/chat/StatusBadge";
import { getPresenceBadgeStatus, getPresenceForUser, getPresenceText } from "@/utils/userPresence";

type Friend = {
    _id: string;
    friendId: string;
    displayName: string;
    avatarUrl?: string;
    nickname?: string;
    email?: string;
    bio?: string;
    phone?: string;
    [key: string]: any;
};

interface FriendsTabProps {
    friends: Friend[];
    onlineUsers: string[];
    onOpenChat: (friend: Friend) => void;
    onUnfriend: (friendId: string) => Promise<void>;
}

export default function FriendsTab({ friends, onlineUsers, onOpenChat, onUnfriend }: FriendsTabProps) {
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [unfriendModalOpen, setUnfriendModalOpen] = useState(false);
    const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const userPresences = useSocketStore((state) => state.userPresences);

    const handleOpenUnfriendModal = (friend: Friend) => {
        setProcessingId(null);
        setSelectedFriend(friend);
        setUnfriendModalOpen(true);
    };

    const handleOpenProfile = (friend: Friend) => {
        setSelectedFriend(friend);
        setIsProfileOpen(true);
    };

    const handleConfirmUnfriend = async () => {
        if (!selectedFriend) return;

        try {
            setProcessingId(selectedFriend.friendId);
            await onUnfriend(selectedFriend.friendId);
            setUnfriendModalOpen(false);
        } catch (error) {
            console.error("Lỗi khi hủy kết bạn:", error);
        } finally {
            setProcessingId(null);
            setSelectedFriend(null);
        }
    };

    return (
        <div className="space-y-3">
            {friends.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                    {friends.map((friend) => {
                        const presence = getPresenceForUser(friend.friendId, userPresences, friend.presence ?? null, onlineUsers);
                        const badgeStatus = getPresenceBadgeStatus(presence);
                        const presenceText = getPresenceText(presence);
                        const isProcessing = processingId === friend.friendId;

                        return (
                            <div key={friend._id} className="group flex min-h-[84px] items-center gap-4 rounded-xl border border-transparent bg-transparent px-4 py-3.5 transition-colors hover:bg-muted/60">
                                <div className="relative cursor-pointer" onClick={() => handleOpenProfile(friend)}>
                                    <Avatar className="h-14 w-14 shrink-0">
                                        <AvatarImage src={friend.avatarUrl} />
                                        <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                                            {friend.displayName.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    {badgeStatus && <StatusBadge status={badgeStatus} />}
                                </div>

                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenProfile(friend)}>
                                    <p className="truncate text-base font-semibold text-foreground">
                                        {friend.nickname || friend.displayName}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">{presenceText}</p>
                                </div>

                                <FriendActionButtons
                                    userId={friend.friendId}
                                    displayName={friend.nickname || friend.displayName}
                                    onChat={() => onOpenChat(friend)}
                                    onUnfriend={() => handleOpenUnfriendModal(friend)}
                                    isProcessing={isProcessing}
                                    variant="icon"
                                    className="opacity-100 transition-opacity"
                                />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex h-64 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/40 bg-muted/20 p-8 text-center text-muted-foreground">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                        <UserX className="h-8 w-8 text-muted-foreground opacity-50" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold text-foreground">Chưa có bạn bè</h3>
                    <p className="max-w-xs text-sm">
                        Tìm kiếm và gửi lời mời kết bạn để cùng nhau trò chuyện và chia sẻ khoảnh khắc.
                    </p>
                </div>
            )}

            <ConfirmationModal
                isOpen={unfriendModalOpen}
                onClose={() => setUnfriendModalOpen(false)}
                onConfirm={handleConfirmUnfriend}
                title="Hủy kết bạn?"
                description={`Bạn có chắc chắn muốn hủy kết bạn với ${selectedFriend?.displayName}?`}
                confirmText="Hủy kết bạn"
                variant="destructive"
                isLoading={!!processingId}
            />

            <UserProfileDialog
                open={isProfileOpen}
                onOpenChange={setIsProfileOpen}
                user={selectedFriend ? {
                    _id: selectedFriend.friendId,
                    displayName: selectedFriend.displayName,
                    email: selectedFriend.email || "",
                    avatarUrl: selectedFriend.avatarUrl,
                    bio: selectedFriend.bio,
                    phone: selectedFriend.phone,
                } : null}
                onOpenChat={(friend) => {
                    setIsProfileOpen(false);
                    onOpenChat(friend);
                }}
            />
        </div>
    );
}
