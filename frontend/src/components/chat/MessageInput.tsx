import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import React, { useState, useRef } from "react";
import { Button } from "../ui/button";
import { ImagePlus, Send } from "lucide-react";
import { Input } from "../ui/input";
import EmojiPicker from "./EmojiPicker";

import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { toast } from "sonner";

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
    const { user } = useAuthStore();
    const { emitTyping, emitStopTyping } = useSocketStore();
    const { sendDirectMessage, sendGroupMessage } = useChatStore();
    const { blockedUsers, blockedBy } = useFriendStore();
    const [value, setValue] = useState("");
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    if (!user) return null;

    const participants = selectedConvo.participants;
    const otherUser = participants.find((p) => p.userId?._id?.toString() !== user._id.toString());
    const otherUserId = otherUser?.userId?._id;

    // Check if I blocked them or they blocked me
    const isBlockedByMe = blockedUsers.some(u => u._id === otherUserId);
    const isBlockedByOther = otherUserId && blockedBy.includes(otherUserId);

    const sendMessage = async () => {
        if (!value.trim()) return;
        const currValue = value;
        setValue("");

        emitStopTyping(selectedConvo._id);
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        try {
            if (selectedConvo.type === "direct") {
                await sendDirectMessage(otherUserId as string, currValue);
            } else {
                await sendGroupMessage(selectedConvo._id, currValue);
            }
        } catch (error: any) {
            console.error("Lỗi gửi tin nhắn:", error);
            if (error.response?.status === 403) {
                toast.error("Không thể nhắn tin cho người này");
            } else {
                toast.error("Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại!");
            }
            setValue(currValue);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendMessage();
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setValue(e.target.value);

        if (e.target.value.trim()) {
            emitTyping(selectedConvo._id);

            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }

            typingTimeoutRef.current = setTimeout(() => {
                emitStopTyping(selectedConvo._id);
            }, 2000);
        } else {
            emitStopTyping(selectedConvo._id);
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        }
    };

    if (selectedConvo.type === "direct") {
        if (isBlockedByMe) {
            return (
                <div className="flex items-center justify-center p-4 bg-muted/30 border-t border-border/50">
                    <p className="text-sm text-muted-foreground italic">
                        Bạn đã chặn người dùng này.
                    </p>
                </div>
            );
        }

        if (isBlockedByOther) {
            return (
                <div className="flex items-center justify-center p-4 bg-muted/30 border-t border-border/50">
                    <p className="text-sm text-muted-foreground italic">
                        Bạn không thể gửi tin nhắn cho người này.
                    </p>
                </div>
            );
        }
    }

    return (
        <div className="flex items-center gap-2 p-3 min-h-[56px] bg-background">
            <Button variant="ghost" size="icon" className="hover:bg-primary/10 transition-smooth">
                <ImagePlus className="size-4" />
            </Button>

            <div className="flex-1 relative">
                <Input
                    onKeyDown={handleKeyPress}
                    value={value}
                    onChange={handleInputChange}
                    placeholder="Soạn tin nhắn"
                    className="pr-20 h-9 bg-white border-border/50 focus:border-primary/50 transition-smooth resize-none"
                ></Input>
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-9 hover:bg-primary/10 transition-smooth"
                    >
                        <div>
                            <EmojiPicker onChange={(emoji: string) => setValue(`${value}${emoji}`)} />
                        </div>
                    </Button>
                </div>
            </div>
            <Button
                onClick={sendMessage}
                className="bg-gradient-chat hover:shadow-glow transition-smooth hover:scale-105"
                disabled={!value.trim()}>
                <Send className="size-4 text-white" />
            </Button>
        </div>
    );
};

export default MessageInput;