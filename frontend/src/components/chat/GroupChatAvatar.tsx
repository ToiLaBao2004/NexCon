import type { Participant } from "@/types/chat"
import UserAvatar from "./UserAvatar";
import { cn } from "@/lib/utils";

interface GroupChatAvatarProps {
    participants: Participant[];
    type: "chat" | "sidebar"
}

const GroupChatAvatar = ({ participants, type }: GroupChatAvatarProps) => {
    const validParticipants = participants;
    const count = validParticipants.length;
    const limit = Math.min(count, 4);

    // Determine sizes and positions based on how many to show
    let positions: string[] = [];
    let childSizeClass = "";

    const isSidebar = type === "sidebar";

    if (limit === 1) {
        positions = ["top-0 left-0 w-full h-full"];
        childSizeClass = isSidebar ? "!size-12 !text-base" : "!size-8 !text-sm";
    } else if (limit === 2) {
        positions = [
            "top-0 right-0 z-0",
            "bottom-0 left-0 z-10"
        ];
        childSizeClass = isSidebar ? "!size-[32px] !text-sm" : "!size-[22px] !text-[10px]";
    } else if (limit === 3) {
        positions = [
            "top-0 left-1/2 -translate-x-1/2 z-10",
            "bottom-0 left-0 z-20",
            "bottom-0 right-0 z-0",
        ];
        childSizeClass = isSidebar ? "!size-[28px] !text-xs" : "!size-[18px] !text-[9px]";
    } else {
        // limit >= 4
        positions = [
            "top-0 left-0 z-10",
            "top-0 right-0 z-0",
            "bottom-0 left-0 z-20",
            "bottom-0 right-0 z-30"
        ];
        childSizeClass = isSidebar ? "!size-[26px] !text-xs" : "!size-[17px] !text-[8px]";
    }

    const avatars = [];
    for (let i = 0; i < limit; i++) {
        const member = validParticipants[i];

        avatars.push(
            <div key={i} className={cn("absolute rounded-full", positions[i])}>
                <UserAvatar
                    type={type}
                    name={member.userId?.displayName ?? ""}
                    avatarUrl={member.userId?.avatarUrl ?? undefined}
                    className={cn(
                        childSizeClass,
                        "border border-background",
                        isSidebar ? "border-2" : "border-[1.5px]"
                    )}
                />
            </div>
        );
    }

    return (
        <div className={cn(
            "relative shrink-0",
            isSidebar ? "w-12 h-12" : "w-8 h-8"
        )}>
            {avatars}
        </div>
    );
}

export default GroupChatAvatar;