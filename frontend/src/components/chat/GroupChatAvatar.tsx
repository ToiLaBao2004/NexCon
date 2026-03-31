import type { Participant } from "@/types/chat"
import UserAvatar from "./UserAvatar";
import { Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupChatAvatarProps {
    participants: Participant[];
    type: "chat" | "sidebar"
}

const GroupChatAvatar = ({ participants, type }: GroupChatAvatarProps) => {
    const validParticipants = participants;
    const avatars = [];
    const limit = Math.min(validParticipants.length, 4);

    for (let i = 0; i < limit; i++) {
        const member = validParticipants[i];
        avatars.push(
            <UserAvatar
                key={i}
                type={type}
                name={member.userId?.displayName ?? ""}
                avatarUrl={member.userId?.avatarUrl ?? undefined}
                className={cn(
                    type === "sidebar" && "!size-8 !text-sm",
                    type === "chat" && "!size-6 !text-xs"
                )}
            />
        );
    }

    return (
        <div className="relative flex -space-x-2 *:data-[slot=avatar]:ring-background *:data-[slot=avatar]:ring-2 shrink-0">
            {avatars}
            {participants.length > limit && (
                <div className={cn(
                    "flex items-center z-10 justify-center rounded-full bg-muted ring-2 ring-background text-muted-foreground",
                    type === "sidebar" ? "size-8" : "size-6"
                )}>
                    <Ellipsis className={type === "sidebar" ? "size-4" : "size-3"} />
                </div>
            )}
        </div>
    )
}

export default GroupChatAvatar