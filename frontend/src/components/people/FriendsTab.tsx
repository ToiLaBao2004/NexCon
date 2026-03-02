import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, UserX } from "lucide-react";

type Friend = any;

export default function FriendsTab({ friends, onlineUsers, onOpenChat }: { friends: Friend[]; onlineUsers: string[]; onOpenChat: (friend: Friend) => void; }) {
    return (
        <div>
            {friends.length > 0 ? (
                <div className="space-y-2">
                    {friends.map((friend) => {
                        const isOnline = onlineUsers.includes(friend.friendId);
                        return (
                            <div key={friend._id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border border-border/40 hover:border-primary/20 hover:shadow-soft transition-all duration-200">
                                <div className="relative">
                                    <Avatar className="h-10 w-10 shrink-0">
                                        <AvatarImage src={friend.avatarUrl} />
                                        <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">{friend.displayName.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">{friend.nickname || friend.displayName}</p>
                                    <p className="text-xs text-muted-foreground">{isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button title="Chat" onClick={() => onOpenChat(friend)} className="p-2 rounded-md hover:bg-muted/30 transition-colors"><MessageSquare className="h-4 w-4 text-muted-foreground" /></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex-1 h-60 flex flex-col items-center justify-center py-6">
                    <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4"><UserX className="h-10 w-10 text-muted-foreground/40" /></div>
                    <h3 className="text-base font-semibold text-muted-foreground/70 mb-1">Chưa có bạn bè</h3>
                    <p className="text-sm text-muted-foreground/50 text-center max-w-xs">Tìm kiếm và gửi lời mời kết bạn để bắt đầu kết nối.</p>
                </div>
            )}
        </div>
    );
}
