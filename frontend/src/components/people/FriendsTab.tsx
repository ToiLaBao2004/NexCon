import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserX } from "lucide-react";
import { useState } from "react";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { FriendActionButtons } from "@/components/people/FriendActionButtons";

type Friend = {
    _id: string;
    friendId: string;
    displayName: string;
    avatarUrl?: string;
    nickname?: string;
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

    const handleOpenUnfriendModal = (friend: Friend) => {
        setSelectedFriend(friend);
        setUnfriendModalOpen(true);
    };

    const handleConfirmUnfriend = async () => {
        if (!selectedFriend) return;

        try {
            setProcessingId(selectedFriend.friendId);
            await onUnfriend(selectedFriend.friendId);
            setUnfriendModalOpen(false);
        } catch (error) {
            console.error("Unfriend error:", error);
        } finally {
            setProcessingId(null);
            setSelectedFriend(null);
        }
    };

    return (
        <div className="space-y-3">
            {friends.length > 0 ? (
                <div className="flex flex-col gap-2">
                    {friends.map((friend) => {
                        const isOnline = onlineUsers.includes(friend.friendId);
                        const isProcessing = processingId === friend.friendId;

                        return (
                            <div key={friend._id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border/40 hover:border-primary/30 hover:shadow-md transition-all duration-300 group">
                                <div className="relative">
                                    <Avatar className="h-12 w-12 shrink-0 border-2 border-transparent group-hover:border-primary/20 transition-all">
                                        <AvatarImage src={friend.avatarUrl} />
                                        <AvatarFallback className="text-base font-bold bg-primary/10 text-primary">
                                            {friend.displayName.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className={`absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-muted-foreground/30'}`} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                        {friend.nickname || friend.displayName}
                                    </p>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                                        {isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}
                                    </p>
                                </div>

                                <FriendActionButtons
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
                <div className="flex-1 h-64 flex flex-col items-center justify-center py-10 bg-card/10 rounded-3xl border border-dashed border-border/60">
                    <div className="h-20 w-20 rounded-3xl bg-muted/30 flex items-center justify-center mb-5 ring-8 ring-muted/10">
                        <UserX className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground/80 mb-2">Chưa có bạn bè</h3>
                    <p className="text-sm text-muted-foreground/60 text-center max-w-xs px-4">
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
        </div>
    );
}
