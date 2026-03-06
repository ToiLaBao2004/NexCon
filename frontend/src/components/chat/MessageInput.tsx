import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import React, { useState } from "react";
import { Button } from "../ui/button";
import { ImagePlus, Send } from "lucide-react";
import { Input } from "../ui/input";
import EmojiPicker from "./EmojiPicker";

import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { toast } from "sonner";

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
    const { user } = useAuthStore();
    const { sendDirectMessage, sendGroupMessage } = useChatStore();
    const { friends } = useFriendStore();
    const [value, setValue] = useState("");

    if (!user) return null;

    const participants = selectedConvo.participants;
    const otherUser = participants.find((p) => p.userId?._id?.toString() !== user._id.toString());
    const isFriend = selectedConvo.type === "group" ||
        friends.some((f: any) => f.friendId === otherUser?.userId?._id);

    const sendMessage = async () => {
        if (!value.trim()) return;
        const currValue = value;
        setValue("");

        try {
            if (selectedConvo.type === "direct") {
                await sendDirectMessage(otherUser?.userId?._id as string, currValue);
            } else {
                await sendGroupMessage(selectedConvo._id, currValue);
            }
        } catch (error: any) {
            console.error(error);
            if (error.response?.status === 403) {
                toast.error("Không thể nhắn tin khi chưa là bạn bè");
            } else {
                toast.error("An error occurred while sending the message. Please try again!");
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

    if (!isFriend) {
        return (
            <div className="flex items-center justify-center p-4 bg-muted/30 border-t border-border/50">
                <p className="text-sm text-muted-foreground italic">
                    Kết bạn để có thể gửi tin nhắn cho nhau.
                </p>
            </div>
        );
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
                    onChange={(e) => setValue(e.target.value)}
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