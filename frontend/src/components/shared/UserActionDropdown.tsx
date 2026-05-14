import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useFriendStore } from "@/stores/useFriendStore";
import { ConfirmationModal } from "./ConfirmationModal";

interface UserActionDropdownProps {
    userId: string;
    displayName: string;
    trigger?: React.ReactNode | ((isBlocked: boolean) => React.ReactNode);
    align?: "start" | "center" | "end";
    mode?: "dropdown" | "button";
    variant?: "default" | "outline" | "ghost";
}

export const UserActionDropdown = ({
    userId,
    displayName,
    trigger,
    mode = "dropdown",
}: UserActionDropdownProps) => {
    const { blockedUsers, blockUser, unblockUser, loading, fetchBlockedList } = useFriendStore();
    const [showBlockConfirm, setShowBlockConfirm] = useState(false);
    const [showUnblockConfirm, setShowUnblockConfirm] = useState(false);

    const isBlockedByMe = blockedUsers.some((u) => u._id === userId);

    useEffect(() => {
        void fetchBlockedList();
    }, [fetchBlockedList]);

    const handleBlock = async () => {
        try {
            await blockUser(userId);
            setShowBlockConfirm(false);
        } catch (error) {
            console.error("Chặn thất bại:", error);
        }
    };

    const handleUnblock = async () => {
        try {
            await unblockUser(userId);
            setShowUnblockConfirm(false);
        } catch (error) {
            console.error("Bỏ chặn thất bại:", error);
        }
    };

    const toggleModal = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isBlockedByMe) setShowUnblockConfirm(true);
        else setShowBlockConfirm(true);
    };

    return (
        <>
            {mode === "dropdown" ? (
                trigger ? (
                    <div onClick={toggleModal}>
                        {typeof trigger === "function" ? trigger(isBlockedByMe) : trigger}
                    </div>
                ) : (
                    <button
                        title={isBlockedByMe ? "Bỏ chặn" : "Chặn"}
                        onClick={toggleModal}
                        className={cn(
                            "h-9 w-9 flex items-center justify-center rounded-xl transition-all active:scale-95 disabled:opacity-50",
                            isBlockedByMe
                                ? "hover:bg-primary/10 text-primary"
                                : "hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        )}
                    >
                        <UserX className="h-5 w-5" />
                    </button>
                )
            ) : (
                <Button
                    variant="outline"
                    onClick={toggleModal}
                    disabled={loading}
                    className={cn(
                        "flex-1 min-w-[120px] gap-2 rounded-xl h-10 font-medium transition-all active:scale-95",
                        isBlockedByMe
                            ? "border-primary/20 text-primary hover:bg-primary/10"
                            : "border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/40"
                    )}
                >
                    <UserX className="h-4 w-4" />
                    {isBlockedByMe ? "Bỏ chặn" : "Chặn"}
                </Button>
            )}

            <ConfirmationModal
                isOpen={showBlockConfirm}
                onClose={() => setShowBlockConfirm(false)}
                onConfirm={handleBlock}
                title={`Chặn ${displayName}?`}
                description="Truy cập danh sách chặn để bỏ chặn"
                confirmText="Chặn"
                variant="destructive"
                isLoading={loading}
            />

            <ConfirmationModal
                isOpen={showUnblockConfirm}
                onClose={() => setShowUnblockConfirm(false)}
                onConfirm={handleUnblock}
                title={`Bỏ chặn ${displayName}?`}
                description="Họ sẽ có thể gửi tin nhắn cho bạn sau khi được bỏ chặn."
                confirmText="Bỏ chặn"
                variant="default"
                isLoading={loading}
            />
        </>
    );
};
