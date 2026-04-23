import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import UnreadCountBadge from "./UnreadCountBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { MoreHorizontal, Paperclip, Image as ImageIcon, Link2, Trash2, PencilLine, Pin, Mail, MailOpen, Mic, BellOff } from "lucide-react";
import { StickerIcon as Sticker } from "@/components/shared/StickerIcon";
import { isMuted } from '@/utils/isMuted';
import { MuteSubMenu } from './MuteSubMenu';
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
import { ConfirmationModal } from "../shared/ConfirmationModal";
import { getSystemMessageText } from "@/utils/chatUtils";

const GroupChatCard = ({ convo, hideStatusIcon }: { convo: Conversation; hideStatusIcon?: boolean }) => {
	const { user } = useAuthStore();
	const {
		focusedConversationId,
		setActiveConversation,
		messages,
		fetchMessages,
		fetchConversations,
		updateGroupName,
		clearConversation,
		toggleConversationPin,
		markAsSeen,
		markAsUnread,
	} = useChatStore();

	const [openRename, setOpenRename] = useState(false);
	const [groupNameDraft, setGroupNameDraft] = useState("");
	const [loading, setLoading] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [openClearConfirm, setOpenClearConfirm] = useState(false);
	const [pinning, setPinning] = useState(false);

	const isConversationPinned = convo.isPinned === true;

	const currentGroupName = useMemo(() => convo.group?.name ?? "", [convo.group?.name]);

	useEffect(() => {
		if (openRename) {
			setGroupNameDraft(currentGroupName);
		}
	}, [openRename, currentGroupName]);

	const myParticipant = convo.participants.find((p) => (p.userId?._id || p.userId)?.toString() === user?._id?.toString());
	const isPartiallyMuted = isMuted(myParticipant?.mute, "messages") || isMuted(myParticipant?.mute, "meetings");

	if (!user) return null;

	const unreadCount = convo.unreadCounts?.[user._id] ?? 0;

	const handleSelectConversation = async (id: string) => {
		setActiveConversation(id);

		if (!messages?.[id]) {
			await fetchMessages(id);
		}
	};

	const onOpenRename = () => {
		setDropdownOpen(false);
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		requestAnimationFrame(() => {
			setOpenRename(true);
		});
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

	const handleClearConversation = async () => {
		try {
			setOpenClearConfirm(false);
			await clearConversation(convo._id);
		} catch (error) {
			console.error("Xóa cuộc trò chuyện thất bại:", error);
		}
	};

	const handleToggleConversationPin = async () => {
		try {
			setPinning(true);
			await toggleConversationPin(convo._id);
			setDropdownOpen(false);
		} catch (error) {
			console.error("Cập nhật ghim hội thoại thất bại:", error);
		} finally {
			setPinning(false);
		}
	};

	const handleToggleUnread = async () => {
		try {
			if (unreadCount > 0) {
				await markAsSeen(convo._id);
			} else {
				await markAsUnread(convo._id);
			}
			setDropdownOpen(false);
		} catch (error) {
			console.error("Cập nhật trạng thái đọc thất bại:", error);
		}
	};

	const menuNode = (
		<>
			<Dialog open={openRename} onOpenChange={setOpenRename}>
				<div className="flex items-center gap-1">
					{isConversationPinned && (
						<Pin className="size-3.5 text-amber-500 fill-current shrink-0" />
					)}
					<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="p-1 rounded hover:bg-muted transition"
								aria-label="More actions"
								onClick={(e) => e.stopPropagation()}
								onPointerDown={(e) => e.stopPropagation()}
							>
								<MoreHorizontal className="size-4 text-muted-foreground" />
							</button>
						</DropdownMenuTrigger>

						<DropdownMenuContent
							align="end"
							sideOffset={6}
							onCloseAutoFocus={(e) => e.preventDefault()}
							onClick={(e) => e.stopPropagation()}
							onPointerDown={(e) => e.stopPropagation()}
						>
							<DropdownMenuItem
								onSelect={(e) => {
									e.preventDefault();
									onOpenRename();
								}}
							>
								<PencilLine className="size-4 mr-2" />
								Đổi group name
							</DropdownMenuItem>
							<MuteSubMenu conversationId={convo._id} />
							<DropdownMenuItem
								disabled={pinning}
								onSelect={(e) => {
									e.preventDefault();
									void handleToggleConversationPin();
								}}
							>
								<Pin className="size-4 mr-2" />
								{isConversationPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"}
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={(e) => {
									e.preventDefault();
									void handleToggleUnread();
								}}
							>
								{unreadCount > 0 ? (
									<>
										<MailOpen className="size-4 mr-2" />
										Đánh dấu đã đọc
									</>
								) : (
									<>
										<Mail className="size-4 mr-2" />
										Đánh dấu chưa đọc
									</>
								)}
							</DropdownMenuItem>
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onSelect={(e) => {
									e.preventDefault();
									setDropdownOpen(false);
									setOpenClearConfirm(true);
								}}
							>
								<Trash2 className="size-4 mr-2" />
								Xóa cuộc trò chuyện
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

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

			<ConfirmationModal
				isOpen={openClearConfirm}
				onClose={() => setOpenClearConfirm(false)}
				onConfirm={handleClearConversation}
				title="Xóa toàn bộ cuộc trò chuyện?"
				description="Hành động này không thể hoàn tác!"
				variant="destructive"
				confirmText="Xác nhận xóa"
			/>
		</>
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
			titleAccessory={isPartiallyMuted && <span title="Đã tắt thông báo" className="flex items-center"><BellOff className="size-3.5 text-muted-foreground shrink-0" /></span>}
			rightSection={menuNode}
			statusIcon={statusIcon}
			leftSection={
				<>
					{unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
					<GroupChatAvatar participants={convo.participants} type="card" groupAvatarUrl={convo.group?.avatarUrl} />
				</>
			}
			subtitle={
				<div className={`flex items-center text-sm truncate w-full ${unreadCount > 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}>
					{(() => {
						if (!convo.lastMessage) return <span className="truncate">{convo.participants.length} Thành Viên</span>;
						const msgObj = convo.lastMessage as any;
						const type = msgObj.type ?? "text";
						const content = msgObj.content ?? "";

						if (type === "system") {
							return <span className="truncate italic">{getSystemMessageText(msgObj, user._id)}</span>;
						}

						const prefix = isMyLastMessage ? "Bạn: " : `${senderName}: `;
						let cleanMsg = content;

						let Icon = null;
						if (type === "audio") {
							Icon = Mic;
							cleanMsg = "Tin nhắn thoại";
						}
						else if (type === "sticker") {
							Icon = Sticker;
							cleanMsg = "Đã gửi một nhãn dán";
						}
						else if (type === "image") Icon = ImageIcon;
						else if (type === "file") Icon = Paperclip;
						else if (type === "link") Icon = Link2;

						return (
							<span className="flex items-center gap-1 w-full truncate">
								<span className="shrink-0">{prefix}</span>
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