import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import StatusBadge from "./StatusBadge";

interface IUserAvatarProps {
    type: "sidebar" | "chat" | "profile" | "seen";
    name: string;
    avatarUrl?: string;
    className?: string;
    status?: "online" | "offline";
}

const UserAvatar = ({ type, name, avatarUrl, className, status }: IUserAvatarProps) => {
    const bgColor = !avatarUrl ? "bg-blue-500" : "";

    if (!name) {
        name = "NexCon";
    }

    return (
        <span className="relative inline-flex">
            <Avatar
                className={cn(className ?? "",
                    type === "sidebar" && "size-12 text-base",
                    type === "chat" && "size-8 text-sm",
                    type === "profile" && "size-24 text-3xl shadow-md",
                    type === "seen" && "size-4 text-[8px]"
                )}
            >
                <AvatarImage src={avatarUrl} alt={name} />
                <AvatarFallback className={`${bgColor} text-white font-semibold`}>
                    {name.charAt(0)}
                </AvatarFallback>

            </Avatar>
            {status && type !== "seen" && <StatusBadge status={status} />}
        </span>
    );
};

export default UserAvatar;