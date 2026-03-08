import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import UnreadCountBadge from "./UnreadCountBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { MoreHorizontal } from "lucide-react";
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

const GroupChatCard = ({ convo }: { convo: Conversation }) => {
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

	// Prefill input mỗi lần mở dialog (và nếu convo đổi)
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

		// Nếu không đổi gì thì đóng luôn cho gọn
		if (value === currentGroupName.trim()) {
			setOpenRename(false);
			return;
		}

		try {
			setLoading(true);
			await updateGroupName(convo._id, value);

			setOpenRename(false);

			// Refresh list để UI update name (nếu store chưa tự update state)
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
			leftSection={
				<>
					{unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
					<GroupChatAvatar participants={convo.participants} type="sidebar" />
				</>
			}
			subtitle={
				<p className="text-sm truncate text-muted-foreground">
					{convo.participants.length} Thành Viên
				</p>
			}
		/>
	);
};

export default GroupChatCard;