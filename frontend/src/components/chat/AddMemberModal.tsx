import React, { useState, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useFriendStore } from '@/stores/useFriendStore';
import { chatService } from '@/services/chatService';
import { toast } from 'sonner';
import { Loader2, Search, UserPlus, Check } from 'lucide-react';
import type { Conversation } from '@/types/chat';
import { cn } from '@/lib/utils';

interface AddMemberModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversation: Conversation;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
    open,
    onOpenChange,
    conversation,
}) => {
    const { friends } = useFriendStore();
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const MAX_MEMBERS = 100;
    const isFull = (conversation.participants?.length || 0) >= MAX_MEMBERS;

    const addableFriends = useMemo(() => {
        return friends.filter((friend) => {
            // Bỏ qua nếu đã là thành viên
            const isMember = conversation.participants?.some(
                (p) => p.userId?._id === friend.friendId
            );
            if (isMember) return false;

            // Lọc theo tên tìm kiếm
            const searchRaw = search.toLowerCase();
            return (
                friend.displayName.toLowerCase().includes(searchRaw) ||
                friend.nickname?.toLowerCase().includes(searchRaw)
            );
        });
    }, [friends, conversation.participants, search]);

    const handleToggle = (userId: string) => {
        setSelectedIds((prev) =>
            prev.includes(userId)
                ? prev.filter((id) => id !== userId)
                : [...prev, userId]
        );
    };

    const handleAdd = async () => {
        if (selectedIds.length === 0) return;

        setLoading(true);
        try {
            const res = await chatService.addMembers(conversation._id, selectedIds);
            
            if (res.approvalRequired) {
                toast.success(res.message || 'Đã gửi yêu cầu phê duyệt thành viên tới trưởng nhóm');
            } else {
                toast.success(`Đã thêm ${selectedIds.length} thành viên vào nhóm`);
            }
            
            onOpenChange(false);
            setSelectedIds([]);
            setSearch('');
        } catch (error: any) {
            toast.error(error.message || 'Không thể thêm thành viên');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden bg-card border-border/40">
                <DialogHeader className="p-4 border-b border-border/40 bg-card">
                    <DialogTitle className="flex items-center gap-2 text-foreground">
                        <UserPlus className="h-5 w-5 text-primary" />
                        Thêm thành viên
                    </DialogTitle>
                </DialogHeader>

                <div className="p-4 bg-muted/20">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Tìm kiếm bạn bè..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-background border-border/60 focus:ring-primary/40 h-10"
                        />
                    </div>
                </div>

                <ScrollArea className="h-[350px] bg-card">
                    <div className="p-2">
                        {isFull ? (
                            <div className="p-8 text-center text-muted-foreground">
                                <p className="text-sm font-medium text-orange-500">
                                    Nhóm đã đạt giới hạn tối đa ({MAX_MEMBERS} thành viên)
                                </p>
                            </div>
                        ) : addableFriends.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                                <p className="text-sm">{search ? 'Không tìm thấy kết quả' : 'Không có bạn bè nào để thêm'}</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {addableFriends.map((friend) => {
                                    const isSelected = selectedIds.includes(friend.friendId);
                                    return (
                                        <div
                                            key={friend.friendId}
                                            onClick={() => handleToggle(friend.friendId)}
                                            className={cn(
                                                "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all",
                                                isSelected
                                                    ? "bg-primary/10 border border-primary/20"
                                                    : "hover:bg-muted/50 border border-transparent"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                                                    <AvatarImage src={friend.avatarUrl} alt={friend.displayName} />
                                                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                                        {friend.displayName.slice(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="text-sm font-semibold text-foreground">
                                                        {friend.nickname || friend.displayName}
                                                    </p>
                                                    {friend.nickname && (
                                                        <p className="text-xs text-muted-foreground">{friend.displayName}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className={cn(
                                                "size-5 rounded-full border flex items-center justify-center transition-all",
                                                isSelected
                                                    ? "bg-primary border-primary"
                                                    : "border-muted-foreground/30"
                                            )}>
                                                {isSelected && <Check className="h-3 w-3 text-white" />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="p-4 border-t border-border/40 bg-muted/5 flex sm:justify-between items-center">
                    <div className="text-sm text-muted-foreground font-medium">
                        Đã chọn: <span className="text-primary">{selectedIds.length}</span>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                            className="h-9 px-4 text-muted-foreground hover:text-foreground"
                        >
                            Hủy
                        </Button>
                        <Button
                            onClick={handleAdd}
                            disabled={loading || selectedIds.length === 0 || isFull}
                            className="h-9 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm transition-all active:scale-95"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Đang thêm...
                                </>
                            ) : (
                                'Thêm vào nhóm'
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
