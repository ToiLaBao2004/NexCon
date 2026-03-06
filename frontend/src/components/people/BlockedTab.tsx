import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useFriendStore } from "@/stores/useFriendStore";
import { UserX } from "lucide-react";
import { useState } from "react";
import { ConfirmationModal } from "../shared/ConfirmationModal";

export default function BlockedTab() {
    const { blockedUsers, unblockUser, loading } = useFriendStore();
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [showUnblockConfirm, setShowUnblockConfirm] = useState(false);

    const handleOpenUnblock = (user: any) => {
        setSelectedUser(user);
        setShowUnblockConfirm(true);
    };

    const handleConfirmUnblock = async () => {
        if (!selectedUser) return;
        try {
            await unblockUser(selectedUser._id);
            setShowUnblockConfirm(false);
        } catch (error) {
            console.error("Unblock error:", error);
        } finally {
            setSelectedUser(null);
        }
    };

    return (
        <div className="space-y-4">
            {blockedUsers.length > 0 ? (
                <div className="flex flex-col gap-2">
                    {blockedUsers.map((user) => (
                        <div key={user._id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border/40 hover:border-primary/30 transition-all duration-300">
                            <Avatar className="h-12 w-12 shrink-0">
                                <AvatarImage src={user.avatarUrl} />
                                <AvatarFallback className="text-base font-bold bg-muted text-muted-foreground">
                                    {user.displayName.charAt(0)}
                                </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                    {user.displayName}
                                </p>
                            </div>

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenUnblock(user)}
                                disabled={loading && selectedUser?._id === user._id}
                                className="gap-2 rounded-xl border-primary/20 text-primary hover:bg-primary/10 hover:border-primary/40 transition-all active:scale-95"
                            >
                                <UserX className="h-4 w-4" />
                                Bỏ chặn
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex-1 h-64 flex flex-col items-center justify-center py-10 bg-card/10 rounded-3xl border border-dashed border-border/60">
                    <div className="h-20 w-20 rounded-3xl bg-muted/30 flex items-center justify-center mb-5 ring-8 ring-muted/10">
                        <UserX className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground/80 mb-2">Chưa chặn bất kỳ ai</h3>
                    <p className="text-sm text-muted-foreground/60 text-center max-w-xs px-4">
                        Danh sách những người bạn đã chặn sẽ xuất hiện ở đây.
                    </p>
                </div>
            )}

            <ConfirmationModal
                isOpen={showUnblockConfirm}
                onClose={() => setShowUnblockConfirm(false)}
                onConfirm={handleConfirmUnblock}
                title={`Bỏ chặn ${selectedUser?.displayName}?`}
                description="Họ sẽ có thể gửi tin nhắn cho bạn sau khi được bỏ chặn."
                confirmText="Bỏ chặn"
                variant="default"
                isLoading={loading}
            />
        </div>
    );
}
