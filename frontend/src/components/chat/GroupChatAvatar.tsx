import type { Participant } from "@/types/chat"
import UserAvatar from "./UserAvatar";
import { Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupChatAvatarProps {
    participants: Participant[];
    type: "chat" | "sidebar"
}

const GroupChatAvatar = ({ participants, type }: GroupChatAvatarProps) => {
    const avatars = [];
    const limit = Math.min(participants.length, 4);

    for (let i = 0; i < limit; i++) {
        const member = participants[i];
        avatars.push(
            <UserAvatar
                key={i}
                type={type}
                name={member.userId?.displayName ?? ""}
                avatarUrl={member.userId?.avatarUrl ?? undefined}
            />
        );
    }

    return (
        <div className="relative flex -space-x-2 *:data-[slot=avatar]:ring-background
    *:data-[slot=avatar]:ring-2">
            {avatars}
            {participants.length > limit && (
                <div className={cn(
                    "flex items-center z-10 justify-center rounded-full bg-muted ring-2 ring-background text-muted-foreground",
                    type === "sidebar" ? "size-12" : "size-8"
                )}>
                    <Ellipsis className={type === "sidebar" ? "size-6" : "size-4"} />
                </div>
            )}
        </div>
    )
}

export default GroupChatAvatar