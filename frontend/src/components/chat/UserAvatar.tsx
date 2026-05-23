import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import StatusBadge from "./StatusBadge";
import type { UserPresenceStatus } from "@/types/user";

interface IUserAvatarProps {
    type: "sidebar" | "chat" | "profile" | "seen" | "card";
    name: string;
    avatarUrl?: string;
    className?: string;
    status?: UserPresenceStatus;
}

const UserAvatar = ({ type, name, avatarUrl, className, status }: IUserAvatarProps) => {
    const bgColor = !avatarUrl ? "bg-blue-500" : "";

    if (!name) {
        name = "NexCon";
    }

    return (
        <span className="relative inline-flex">
            <Avatar
                className={cn(
                    (type === "sidebar" || type === "card") && "size-12 text-base",
                    type === "chat" && "size-8 text-sm",
                    type === "profile" && "size-24 text-3xl shadow-md",
                    type === "seen" && "size-4 text-[8px]",
                    className ?? ""
                )}
            >
                <AvatarImage src={avatarUrl} alt={name} />
                <AvatarFallback className={`${bgColor} text-white font-semibold`}>
                    {name.charAt(0)}
                </AvatarFallback>

            </Avatar>
            {status && type !== "seen" && status !== "offline" && <StatusBadge status={status} />}
        </span>
    );
};

export default UserAvatar;
