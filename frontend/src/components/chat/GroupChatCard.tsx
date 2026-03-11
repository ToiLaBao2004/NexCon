import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import UnreadCountBadge from "./UnreadCountBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { MoreHorizontal, Paperclip, Image as ImageIcon, Link2 } from "lucide-react";
import { isUrl } from "@/services/chatService";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useState } from "react";
import { Input } from "../ui/input";
import { Button } from "@/components/ui/button";
import UserAvatar from "./UserAvatar";

const GroupChatCard = ({ convo, hideStatusIcon }: { convo: Conversation; hideStatusIcon?: boolean }) => {
	const { user } = useAuthStore();
	const {
		focusedConversationId,
		setActiveConversation,
		messages,
		fetchMessages,
		fetchConversations,
		updateGroupName,
	} = useChatStore();

	const [openRename, setOpenRename] = useState(false);
	const [groupNameDraft, setGroupNameDraft] = useState("");
	const [loading, setLoading] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const currentGroupName = useMemo(() => convo.group?.name ?? "", [convo.group?.name]);

	useEffect(() => {
		if (openRename) {
			setGroupNameDraft(currentGroupName);
		}
	}, [openRename, currentGroupName]);

	if (!user) return null;

	const unreadCount = convo.unreadCounts?.[user._id] ?? 0;

	const handleSelectConversation = async (id: string) => {
		setActiveConversation(id);

		if (!messages?.[id]) {
			await fetchMessages(id);
		}
	};

	const onOpenRename = () => {
		setOpenRename(true);
	};

	const onSubmitGroupName = async () => {
		const value = groupNameDraft.trim();
		if (!value) return;

		if (value === currentGroupName.trim()) {
			setOpenRename(false);
			return;
		}

		try {
			setLoading(true);
			await updateGroupName(convo._id, value);

			setOpenRename(false);

			await fetchConversations();
		} catch (error) {
			console.error("Cập nhật tên nhóm thất bại:", error);
		} finally {
			setLoading(false);
		}
	};

	const menuNode = (
		<Dialog open={openRename} onOpenChange={setOpenRename}>
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground/60 hover:text-foreground"
						aria-label="More actions"
						onClick={(e) => e.stopPropagation()}
						onPointerDown={(e) => e.stopPropagation()}
					>
						<MoreHorizontal className="size-4" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent
					align="end"
					sideOffset={6}
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
				>
					<DropdownMenuItem
						onSelect={(e) => {
							e.preventDefault();
							setDropdownOpen(false);
							onOpenRename();
						}}
					>
						Đổi group name
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<DialogContent
				onClick={(e) => e.stopPropagation()}
				onPointerDown={(e) => e.stopPropagation()}
			>
				<DialogHeader>
					<DialogTitle>Đổi group name</DialogTitle>
					<DialogDescription>Tên mới sẽ hiển thị cho tất cả thành viên trong nhóm.</DialogDescription>
				</DialogHeader>

				<Input
					value={groupNameDraft}
					onChange={(e) => setGroupNameDraft(e.target.value)}
					placeholder="Nhập tên nhóm mới"
					autoFocus
					onKeyDown={(e) => {
						if (e.key === "Enter") onSubmitGroupName();
					}}
				/>

				<DialogFooter className="gap-2">
					<Button variant="outline" onClick={() => setOpenRename(false)} disabled={loading}>
						Hủy
					</Button>
					<Button
						onClick={onSubmitGroupName}
						disabled={!groupNameDraft.trim() || loading}
					>
						{loading ? "Đang lưu..." : "Lưu"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);

	const lastMessageObj = convo.lastMessage as any;
	const lastMessageSenderId = lastMessageObj?.sender?._id || lastMessageObj?.senderId?._id || lastMessageObj?.senderId;
	const isMyLastMessage = lastMessageSenderId?.toString() === user._id.toString();

	const seenByOthers = convo.seenBy?.filter(
		(s: any) => (typeof s === "string" ? s : s._id?.toString()) !== user._id.toString()
	) ?? [];

	let statusIcon = null;
	if (!hideStatusIcon && isMyLastMessage && seenByOthers.length > 0) {
		statusIcon = (
			<div className="flex -space-x-1">
				{[...seenByOthers].reverse().slice(0, 3).map((seenId) => {
					const seenUserId = typeof seenId === "string" ? seenId : seenId._id?.toString();
					const seenParticipant = convo.participants.find(
						(p) => p.userId?._id?.toString() === seenUserId
					);
					if (!seenParticipant) return null;
					return (
						<UserAvatar
							key={seenUserId}
							type="seen"
							name={seenParticipant.userId.displayName ?? ""}
							avatarUrl={seenParticipant.userId.avatarUrl ?? undefined}
							className="border-[1px] border-background"
						/>
					);
				}).reverse()}
			</div>
		);
	}

	const senderParticipant = convo.participants.find(p => p.userId?._id?.toString() === lastMessageSenderId?.toString());
	const senderName = lastMessageObj?.sender?.displayName || lastMessageObj?.senderId?.displayName || senderParticipant?.userId?.displayName || senderParticipant?.userId?.nickname || "Ai đó";

	return (
		<ChatCard
			convoId={convo._id}
			name={currentGroupName}
			timestamp={
				convo.lastMessage?.createdAt ? new Date(convo.lastMessage.createdAt) : undefined
			}
			isActive={focusedConversationId === convo._id}
			onSelect={handleSelectConversation}
			unreadCount={unreadCount}
			rightSection={menuNode}
			statusIcon={statusIcon}
			leftSection={
				<>
					{unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
					<GroupChatAvatar participants={convo.participants} type="sidebar" />
				</>
			}
			subtitle={
				<div className={`flex items-center text-sm truncate w-full ${unreadCount > 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}>
					{(() => {
						if (!convo.lastMessage) return <span className="truncate">{convo.participants.length} Thành Viên</span>;
						const msgObj = convo.lastMessage as any;
						const content = msgObj.content ?? "";
						const type = msgObj.type ?? "text";
						const prefix = isMyLastMessage ? "Bạn: " : `${senderName}: `;

						let cleanMsg = content;
						if (cleanMsg.startsWith("📎 ")) cleanMsg = cleanMsg.replace("📎 ", "");
						else if (cleanMsg.startsWith("📷 ")) cleanMsg = cleanMsg.replace("📷 ", "");
						else if (cleanMsg.startsWith("🔗 ")) cleanMsg = cleanMsg.replace("🔗 ", "");

						let Icon = null;
						if (type === "image" || content.includes("Đã gửi một ảnh")) Icon = ImageIcon;
						else if (type === "file" || content.startsWith("📎 ")) Icon = Paperclip;
						else if (type === "link" || content.includes("Đã gửi một liên kết") || isUrl(cleanMsg)) Icon = Link2;

						return (
							<span className="flex items-center gap-1 w-full truncate">
								{prefix && <span className="shrink-0">{prefix.trim()}:</span>}
								{Icon && <Icon className="size-3.5 shrink-0" />}
								<span className="truncate">{cleanMsg}</span>
							</span>
						);
					})()}
				</div>
			}
		/>
	);
};

export default GroupChatCard;