import type { Participant } from "@/types/chat"
import UserAvatar from "./UserAvatar";
import { cn } from "@/lib/utils";

interface GroupChatAvatarProps {
    participants: Participant[];
    type: "chat" | "sidebar" | "card" | "people" | "profile";
    groupAvatarUrl?: string | null;
}

const GroupChatAvatar = ({ participants, type, groupAvatarUrl }: GroupChatAvatarProps) => {
    const validParticipants = participants;
    const count = validParticipants.length;
    const limit = Math.min(count, 4);

    // Determine sizes and positions based on how many to show
    let positions: string[] = [];
    let childSizeClass = "";

    const isSidebar = type === "sidebar";
    const isProfile = type === "profile";
    const isCard = type === "card";
    const isPeople = type === "people";
    const isLarge = isSidebar;
    const isMedium = isCard;

    if (groupAvatarUrl) {
        return (
            <div
                className={cn(
                    "relative shrink-0",
                    isProfile ? "w-20 h-20" : isLarge ? "w-16 h-16" : isPeople ? "w-14 h-14" : isMedium ? "w-12 h-12" : "w-8 h-8"
                )}
            >
                <UserAvatar
                    type={type === "people" ? "card" : type}
                    name="Nhóm"
                    avatarUrl={groupAvatarUrl}
                    className={cn(
                        "border border-background",
                        isProfile
                            ? "!size-20 !text-2xl border-2"
                            : isLarge
                            ? "!size-16 !text-base border-2"
                            : isPeople
                                ? "!size-14 !text-lg border-2"
                                : isMedium
                                ? "!size-12 !text-base border-2"
                                : "!size-8 !text-sm border-[1.5px]"
                    )}
                />
            </div>
        );
    }

    if (limit === 1) {
        positions = ["top-0 left-0 w-full h-full"];
        childSizeClass = isProfile ? "!size-20 !text-2xl" : isLarge ? "!size-16 !text-base" : isPeople ? "!size-14 !text-lg" : isMedium ? "!size-12 !text-base" : "!size-8 !text-sm";
    } else if (limit === 2) {
        positions = [
            "top-0 right-0 z-0",
            "bottom-0 left-0 z-10"
        ];
        childSizeClass = isProfile ? "!size-[52px] !text-base" : isLarge ? "!size-[42px] !text-sm" : isPeople ? "!size-[36px] !text-sm" : isMedium ? "!size-[32px] !text-sm" : "!size-[22px] !text-[10px]";
    } else if (limit === 3) {
        positions = [
            "top-0 left-1/2 -translate-x-1/2 z-10",
            "bottom-0 left-0 z-20",
            "bottom-0 right-0 z-0",
        ];
        childSizeClass = isProfile ? "!size-[48px] !text-sm" : isLarge ? "!size-[38px] !text-xs" : isPeople ? "!size-[32px] !text-xs" : isMedium ? "!size-[28px] !text-xs" : "!size-[18px] !text-[9px]";
    } else {
        // limit >= 4
        positions = [
            "top-0 left-0 z-10",
            "top-0 right-0 z-0",
            "bottom-0 left-0 z-20",
            "bottom-0 right-0 z-30"
        ];
        childSizeClass = isProfile ? "!size-[42px] !text-sm" : isLarge ? "!size-[34px] !text-xs" : isPeople ? "!size-[30px] !text-xs" : isMedium ? "!size-[26px] !text-xs" : "!size-[17px] !text-[8px]";
    }

    const avatars = [];
    for (let i = 0; i < limit; i++) {
        const member = validParticipants[i];

        avatars.push(
            <div key={i} className={cn("absolute rounded-full", positions[i])}>
                <UserAvatar
                    type={type === "people" ? "card" : type}
                    name={member.userId?.displayName ?? ""}
                    avatarUrl={member.userId?.avatarUrl ?? undefined}
                    className={cn(
                        childSizeClass,
                        "border border-background",
                        (isLarge || isProfile) ? "border-2" : "border-[1.5px]"
                    )}
                />
            </div>
        );
    }

    return (
        <div className={cn(
            "relative shrink-0",
            isProfile ? "w-20 h-20" : isLarge ? "w-16 h-16" : isPeople ? "w-14 h-14" : isMedium ? "w-12 h-12" : "w-8 h-8"
        )}>
            {avatars}
        </div>
    );
}

export default GroupChatAvatar;
