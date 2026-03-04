import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatActionButtonProps {
    onClick: (e: React.MouseEvent) => void;
    variant?: "icon" | "full";
    title?: string;
    className?: string;
    text?: string;
}

export const ChatActionButton = ({
    onClick,
    variant = "icon",
    title = "Nhắn tin",
    className,
    text = "Nhắn tin"
}: ChatActionButtonProps) => {
    if (variant === "full") {
        return (
            <Button
                onClick={onClick}
                className={cn(
                    "flex-1 gap-2 rounded-xl h-10 font-semibold shadow-soft hover:bg-primary/90 transition-all active:scale-95",
                    className
                )}
            >
                <MessageSquare className="h-4 w-4 text-white" />
                {text}
            </Button>
        );
    }

    return (
        <button
            title={title}
            onClick={onClick}
            className={cn(
                "p-2 rounded-xl hover:bg-primary/10 hover:text-primary text-muted-foreground transition-all active:scale-95",
                className
            )}
        >
            <MessageSquare className="h-5 w-5" />
        </button>
    );
};
