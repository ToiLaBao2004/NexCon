import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import { Separator } from "@radix-ui/react-separator";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
	const { conversations, activeConversationId } = useChatStore();
	const { user } = useAuthStore();
	const { onlineUsers } = useSocketStore();
	let otherUser;

	chat = chat ?? conversations.find((c) => c._id === activeConversationId);

	if (!chat) {
		return (
			<header className="md:hidden sticky top-0 z-10 flex items-center gap-2 px-4 py-2
            w-full ">
				<SidebarTrigger className="-ml-1 text-foreground" />
			</header>
		)
	}

	if (chat?.type === "direct") {
		const otherUsers = chat.participants.filter((p) => p.userId?._id?.toString() !== user?._id.toString());
		otherUser = otherUsers.length > 0 ? otherUsers[0] : null;

		if (!user || !otherUser) return;
	}

	const displayName =
		chat.type === "direct"
			? (otherUser?.userId?.nickname?.trim()
				? otherUser.userId.nickname
				: otherUser?.userId?.displayName) || "Moji"
			: chat.group?.name;

	return (
		<header className="sticky top-0 z-10 px-4 py-2 flex items-center bg-background">
			<div className="flex items-center gap-2 w-full">
				<SidebarTrigger className="-ml-1 text-foreground" />
				<Separator
					orientation="vertical"
					className="mr-2 data-[orientation=vertical]:h-4"
				/>
				<div className="p-2 w-full flex items-center gap-3">
					{/* avatar */}
					<div className="relative">
						{
							chat.type === "direct" ? (
								<>
									<UserAvatar
										type={"sidebar"}
										name={displayName}
										avatarUrl={otherUser?.userId?.avatarUrl || undefined}
									/>
									{/* todo: socket io */}
									{onlineUsers.includes(otherUser?.userId?._id ?? "") && (
										<StatusBadge status="online" />)}
								</>
							) : (
								<GroupChatAvatar
									participants={chat.participants}
									type="sidebar"
								/>
							)
						}
					</div>
					{/* name */}
					<h2 className="font-semibold text-foreground">
						{displayName}
					</h2>
				</div>
			</div>

		</header>
	);
};

export default ChatWindowHeader;