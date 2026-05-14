import { UserMinus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatActionButton } from "@/components/people/ChatActionButton";
import { UserActionDropdown } from "@/components/shared/UserActionDropdown";
import { cn } from "@/lib/utils";

interface FriendActionButtonsProps {
    userId: string;
    displayName: string;
    onChat: (e: React.MouseEvent) => void;
    onUnfriend: (e: React.MouseEvent) => void;
    isProcessing?: boolean;
    variant?: "icon" | "full";
    className?: string;
}

export const FriendActionButtons = ({
    userId,
    displayName,
    onChat,
    onUnfriend,
    isProcessing = false,
    variant = "icon",
    className,
}: FriendActionButtonsProps) => {

    const UnfriendAction = variant === "full" ? (
        <Button
            onClick={onUnfriend}
            variant="outline"
            disabled={isProcessing}
            className="flex-1 min-w-[120px] gap-2 rounded-xl h-10 font-medium border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/40 transition-all active:scale-95"
        >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
            Hủy kết bạn
        </Button>
    ) : (
        <button
            title="Hủy kết bạn"
            onClick={onUnfriend}
            disabled={isProcessing}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-foreground hover:bg-destructive/10 hover:text-destructive transition-all active:scale-95 disabled:opacity-50"
        >
            {isProcessing ? <Loader2 className="h-5 w-5 animate-spin text-destructive" /> : <UserMinus className="h-5 w-5" strokeWidth={1.65} />}
        </button>
    );

    return (
        <div className={cn(
            "flex items-center gap-1 shrink-0",
            variant === "full" && "w-full gap-3 justify-center flex-wrap sm:flex-nowrap",
            className
        )}>
            <ChatActionButton onClick={onChat} variant={variant} />
            {UnfriendAction}
            <UserActionDropdown
                userId={userId}
                displayName={displayName}
                mode={variant === "full" ? "button" : "dropdown"}
            />
        </div>
    );
};
