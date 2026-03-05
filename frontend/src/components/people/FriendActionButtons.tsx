import { UserMinus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatActionButton } from "@/components/people/ChatActionButton";
import { cn } from "@/lib/utils";

interface FriendActionButtonsProps {
    onChat: (e: React.MouseEvent) => void;
    onUnfriend: (e: React.MouseEvent) => void;
    isProcessing?: boolean;
    variant?: "icon" | "full";
    className?: string;
}

export const FriendActionButtons = ({
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
            className="flex-1 gap-2 rounded-xl h-10 font-semibold border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/40 transition-all active:scale-95"
        >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
            Hủy kết bạn
        </Button>
    ) : (
        <button
            title="Hủy kết bạn"
            onClick={onUnfriend}
            disabled={isProcessing}
            className="p-2 rounded-xl hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all active:scale-95 disabled:opacity-50"
        >
            {isProcessing ? <Loader2 className="h-5 w-5 animate-spin text-destructive" /> : <UserMinus className="h-5 w-5" />}
        </button>
    );

    return (
        <div className={cn("flex items-center gap-1 shrink-0", variant === "full" && "w-full gap-2", className)}>
            <ChatActionButton onClick={onChat} variant={variant} />
            {UnfriendAction}
        </div>
    );
};
