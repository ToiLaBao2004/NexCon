import { cn, formatMessageTime, formatBytes, normalizeUrl } from "@/lib/utils";
import type { Conversation, Message, MessageType, Participant, ReplyToMessage } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/useChatStore";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import SecureImage from "../SecureImage";
import useMediaCacheStore from "@/stores/useMediaCacheStore";
import { chatService } from "@/services/chatService";
import { FileText, Link2, ExternalLink, Clock, AlertCircle, Pin, PinOff, Undo2, Reply, ImageIcon, Smile, Copy, Download } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import ReactionDetailModal from "./ReactionDetailModal";

interface MessageItemProps {
	message: Message;
	index: number;
	messages: Message[];
	selectedConvo: Conversation;
	currentUserId: string;
	isLast?: boolean;
	onReply?: (message: Message) => void;
}


// ── Content renderer ──────────────────────────────────────────────────────────
function MessageContent({ message, isOwn, downloadUrl }: { message: Message; isOwn: boolean; downloadUrl: string }) {
	const type: MessageType = message.type ?? "text";

	if (message.isRecalled) {
		return (
			<span className="italic text-muted-foreground">
				{isOwn ? "Bạn đã thu hồi một tin nhắn" : "Tin nhắn đã được thu hồi"}
			</span>
		);
	}

	if (type === "image" && (message.filePublicId || message.fileUrl)) {
		return (
			<div className="flex flex-col gap-1.5">
				{message.filePublicId ? (
					<a href={downloadUrl} target="_blank" rel="noopener noreferrer">
						<SecureImage
							messageId={message._id}
							alt={message.fileName ?? "image"}
							className="max-w-[240px] max-h-[300px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
						/>
					</a>
				) : (
					<a href={message.fileUrl!} target="_blank" rel="noopener noreferrer">
						<img
							src={message.fileUrl!}
							alt={message.fileName ?? "image"}
							className="max-w-[240px] max-h-[300px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
						/>
					</a>
				)}
				{message.content && <p className="text-sm px-1">{message.content}</p>}
			</div>
		);
	}

	if (type === "file" && (message.filePublicId || message.fileUrl)) {
		// Temporary fallback for downloading file. Ideally we also do signed URL for files if needed.
		return (
			<a
				href={downloadUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-2.5 hover:opacity-80 transition-opacity group/file"
				download={message.fileName ?? true}
			>
				<div className={cn("p-2 rounded-lg shrink-0", isOwn ? "bg-white/20" : "bg-primary/10")}>
					<FileText className={cn("size-5", isOwn ? "text-white" : "text-primary")} />
				</div>
				<div className="flex flex-col min-w-0">
					<span className="text-sm font-medium truncate max-w-[180px]">{message.fileName ?? "File"}</span>
					<span className={cn("text-xs", isOwn ? "text-white/70" : "text-muted-foreground")}>
						{message.fileSize ? formatBytes(message.fileSize) : (message.mimeType ?? "")}
					</span>
				</div>
				<ExternalLink className={cn("size-3.5 shrink-0 ml-1 opacity-0 group-hover/file:opacity-70 transition-opacity", isOwn ? "text-white" : "text-muted-foreground")} />
			</a>
		);
	}

	if (type === "link" && message.content) {
		return (
			<a
				href={normalizeUrl(message.content)}
				target="_blank"
				rel="noopener noreferrer"
				className={cn(
					"flex items-center gap-1.5 hover:underline underline-offset-4 transition-colors",
					isOwn ? "decoration-white/60" : "decoration-primary/40 text-primary dark:text-blue-400"
				)}
			>
				<Link2 className="size-3.5 shrink-0" />
				<span className="text-sm break-all">{message.content}</span>
			</a>
		);
	}

	return <span className="text-sm whitespace-pre-wrap break-words">{message.content}</span>;
}

// Reply quote (rendered inside the Card bubble) 
function ReplyQuoteInline({
	replyTo,
	isOwn,
	participants,
	currentUserId,
}: {
	replyTo: ReplyToMessage;
	isOwn: boolean;
	participants: Participant[];
	currentUserId: string;
}) {
	const senderId =
		typeof replyTo.senderId === "object"
			? replyTo.senderId._id
			: replyTo.senderId;

	const senderName =
		senderId?.toString() === currentUserId
			? "Bạn"
			: participants.find(
				(p) => p.userId?._id?.toString() === senderId?.toString()
			)?.userId?.nickname?.trim() ||
			(typeof replyTo.senderId === "object"
				? replyTo.senderId.displayName
				: null) ||
			"Người dùng";

	let preview: React.ReactNode;
	if (replyTo.isRecalled) {
		preview = <span className="italic">Tin nhắn đã thu hồi</span>;
	} else if (replyTo.type === "image") {
		preview = (
			<span className="flex items-center gap-2">
				{replyTo.filePublicId || replyTo.fileUrl ? (
					replyTo.filePublicId ? (
						<SecureImage
							messageId={replyTo._id}
							alt="reply-thumbnail"
							className="w-8 h-8 rounded-md object-cover border border-blue-200 dark:border-blue-400"
						/>
					) : (
						<img
							src={replyTo.fileUrl!}
							alt="reply-thumbnail"
							className="w-8 h-8 rounded-md object-cover border border-blue-200 dark:border-blue-400"
						/>
					)
				) : null}
				<span className="flex items-center gap-1">
					<ImageIcon className="size-3 shrink-0" /> Hình ảnh
				</span>
			</span>
		);
	} else if (replyTo.type === "file") {
		preview = (
			<span className="flex items-center gap-1">
				<FileText className="size-3 shrink-0" /> {replyTo.fileName ?? "Tệp đính kèm"}
			</span>
		);
	} else if (replyTo.type === "link") {
		preview = (
			<span className="flex items-center gap-1">
				<Link2 className="size-3 shrink-0" /> {replyTo.content ?? "Liên kết"}
			</span>
		);
	} else {
		const text = replyTo.content ?? "";
		preview = text.length > 80 ? text.slice(0, 80) + "…" : text;
	}

	return (
		<div
			className={cn(
				"-mb-5 cursor-pointer transition-colors",
				"border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/30",
				"px-3 py-1.5 rounded-xl shadow-sm",
				"flex flex-col gap-0",
				isOwn ? "border-white/60 bg-white/20" : "border-blue-500",
			)}
			style={{ boxShadow: "0 2px 8px 0 rgba(0, 120, 255, 0.08)" }}
			onClick={(e) => {
				e.stopPropagation();
				const el = document.getElementById(`msg-${replyTo._id}`);
				if (el) {
					el.scrollIntoView({ behavior: "smooth", block: "center" });
					el.classList.add("ring-2", "ring-primary/40", "rounded-2xl");
					setTimeout(() => el.classList.remove("ring-2", "ring-primary/40", "rounded-2xl"), 2000);
				}
			}}
		>
			{senderName && (
				<span
					className={cn(
						"block text-xs font-semibold truncate leading-snug mb-0.5",
						isOwn ? "text-white" : "text-blue-700 dark:text-blue-300",
					)}
				>
					{senderName}
				</span>
			)}
			<span
				className={cn(
					"block truncate text-xs leading-snug",
					senderName ? "mt-px" : "",
					isOwn ? "text-white/70" : "text-blue-900 dark:text-blue-100",
				)}
			>
				{preview}
			</span>
		</div>
	);
}

import { getSystemMessageText } from "@/utils/chatUtils";

function SystemMessageComponent({
	message,
	selectedConvo,
	currentUserId,
}: {
	message: Message;
	selectedConvo: Conversation;
	currentUserId: string;
}) {
	const text = getSystemMessageText(message, currentUserId);

	const metadata = message.metadata || {};
	const addedUserIds = Array.isArray(metadata.addedUserIds) ? metadata.addedUserIds : [];
	const addedUsersInfo = Array.isArray(metadata.addedUsersInfo) ? metadata.addedUsersInfo : null;

	const addedParticipants = useMemo(() => {
		if (addedUsersInfo && addedUsersInfo.length > 0) {
			// Using snapshot stored in metadata when the member was added
			return addedUsersInfo.map((info: any) => ({
				userId: {
					_id: info._id,
					displayName: info.displayName,
					avatarUrl: info.avatarUrl
				}
			}));
		}

		// Fallback for older messages
		if (!addedUserIds.length) return [];
		return selectedConvo.participants.filter((p: any) =>
			addedUserIds.some((id: any) => id.toString() === (p.userId?._id || p.userId)?.toString())
		);
	}, [addedUserIds, addedUsersInfo, selectedConvo.participants]);

	return (
		<div className="flex justify-center my-4 w-full animate-in fade-in transition-all duration-300">
			<div className="flex items-center gap-2.5 bg-white/95 dark:bg-gray-800/60 backdrop-blur-sm border border-black/5 dark:border-white/5 py-1.5 px-4 rounded-full max-w-[90%] shadow-[0_2px_12px_-3px_rgba(0,0,0,0.08)] hover:shadow-md transition-all group/sys font-medium">
				<div className="flex -space-x-1.5 shrink-0">
					{addedParticipants.length > 0 ? (
						addedParticipants.slice(0, 2).map((p: any, i: number) => (
							<UserAvatar
								key={p.userId?._id}
								type="seen"
								name={p.userId?.displayName || "User"}
								avatarUrl={p.userId?.avatarUrl ?? undefined}
								className={cn(
									"size-5 border-2 border-background shadow-sm hover:z-20 transition-transform group-hover/sys:scale-105",
									i > 0 && "z-10"
								)}
							/>
						))
					) : (
						<UserAvatar
							type="seen"
							name={(metadata.addedUserNames as string)?.split(',')[0]?.trim() || "User"}
							className="size-5 border-2 border-background shadow-sm"
						/>
					)}
				</div>
				<p className="text-[13px] text-slate-600 dark:text-slate-300 truncate leading-tight tracking-tight">
					{text}
				</p>
			</div>
		</div>
	);
}

const MessageItem = ({
	message,
	index,
	messages,
	selectedConvo,
	currentUserId,
	isLast,
	onReply,
}: MessageItemProps) => {
	if (message.type === "system") {
		return <SystemMessageComponent message={message} selectedConvo={selectedConvo} currentUserId={currentUserId} />;
	}

	const prev = messages[index - 1];

	// Handle populated senderId (from fallback or normally populated)
	const senderObj = typeof message.senderId === "object" ? message.senderId as any : null;
	const actualSenderId = senderObj ? senderObj._id : message.senderId;

	const isGroupBreak =
		index === 0 ||
		actualSenderId !== (typeof prev?.senderId === "object" ? (prev?.senderId as any)._id : prev?.senderId) ||
		new Date(message.createdAt).getTime() - new Date(prev?.createdAt || 0).getTime() > 300000;

	// Determine participant. If populated object, mock the participant object. Otherwise, look up in selectedConvo.
	let participant = selectedConvo.participants.find(
		(p: Participant) => p.userId?._id?.toString() === actualSenderId?.toString()
	);

	if (!participant && senderObj) {
		participant = {
			userId: {
				_id: senderObj._id || "deleted",
				displayName: senderObj.displayName || "Người dùng đã xóa",
				avatarUrl: senderObj.avatarUrl || null,
				email: ""
			},
			joinedAt: message.createdAt
		};
	}

	const isOwn = actualSenderId?.toString() === currentUserId?.toString();
	const isRecalled = message.isRecalled === true;
	const isPinned = message.isPinned === true;
	const isImage = message.type === "image" && !!(message.fileUrl || message.filePublicId) && !isRecalled;
	const isDisbanded = selectedConvo.type === "group" && selectedConvo.disbanded === true;

	const cachedMediaUrl = useMediaCacheStore(state => state.cache[message._id]);
	const downloadUrl = message.fileUrl || cachedMediaUrl || "#";

	// Automatically fetch signed URL for files if not cached
	useEffect(() => {
		if (message.type === "file" && message.filePublicId && !message.fileUrl && !cachedMediaUrl) {
			const fetchUrl = async () => {
				try {
					const { url } = await chatService.getSignedMediaUrl(message._id);
					useMediaCacheStore.getState().setUrl(message._id, url);
				} catch (error) {
					console.error('Failed to fetch media url for file:', message._id, error);
				}
			};
			fetchUrl();
		}
	}, [message._id, message.type, message.filePublicId, message.fileUrl, cachedMediaUrl]);

	const seenByOthers =
		selectedConvo.seenBy?.filter(
			(s: any) => (typeof s === "string" ? s : s._id?.toString()) !== currentUserId
		) ?? [];

	const { recallMessage, pinMessage, reactToMessage } = useChatStore();
	const [showConfirmRecall, setShowConfirmRecall] = useState(false);
	const [showPinOptions, setShowPinOptions] = useState(false);
	const [showReactionModal, setShowReactionModal] = useState(false);
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);
	const [isReacting, setIsReacting] = useState(false);

	const reactionSummary = useMemo(() => {
		if (!message.reactions?.length) return null;

		const counts: Record<string, number> = {};
		message.reactions.forEach(r => {
			counts[r.emoji] = (counts[r.emoji] || 0) + 1;
		});

		const uniqueEmojis = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
		const totalCount = message.reactions.length;
		const myReaction = message.reactions.find(r => r.userId === currentUserId);

		return { uniqueEmojis, totalCount, myReaction };
	}, [message.reactions, currentUserId]);

	const handleEmojiSelect = async (emoji: any) => {
		if (isReacting) return;
		setIsReacting(true);
		try {
			await reactToMessage(message._id, emoji.native);
		} catch (error) {
			console.error("Reaction failed:", error);
		} finally {
			setIsReacting(false);
		}
	};

	const handlePin = async () => {
		try { await pinMessage(message._id); }
		catch (e) { console.error("Ghim thất bại:", e); }
		finally { setShowPinOptions(false); }
	};

	const handleCopy = () => {
		if (message.content) {
			navigator.clipboard.writeText(message.content);
			toast.success("Đã sao chép vào bộ nhớ tạm");
		}
	};

	const handleRecall = async () => {
		try { await recallMessage(message._id); }
		catch (e: any) { toast.error(e.message || "Thu hồi thất bại"); }
		finally { setShowConfirmRecall(false); }
	};

	return (
		<>
			<div
				id={`msg-${message._id}`}
				className={cn(
					"group relative flex gap-2 mt-0.5 mx-2 px-1",
					isOwn ? "justify-end" : "justify-start"
				)}
			>
				{!isOwn && (
					<div className="w-8 shrink-0 pt-0.5">
						{isGroupBreak && (
							<UserAvatar
								type="chat"
								name={participant?.userId.nickname ?? participant?.userId.displayName ?? "User"}
								avatarUrl={participant?.userId.avatarUrl ?? undefined}
							/>
						)}
					</div>
				)}

				<div
					className={cn(
						"relative max-w-[75%] sm:max-w-[65%] md:max-w-[55%] flex flex-col",
						isOwn ? "items-end" : "items-start"
					)}
				>
					<div className={cn("relative", reactionSummary && "mb-3.5")}>
						<Card
							className={cn(
								"shadow-sm overflow-hidden w-fit",
								isOwn && "ms-auto",
								isImage ? "p-0 bg-transparent border-0" : "px-2 py-1.5 text-sm",
								reactionSummary && !isImage && "min-w-[85px]", // Ensure bubble is wide enough for time + reaction
								isRecalled
									? "bg-muted text-muted-foreground border border-dashed border-border italic rounded-2xl"
									: isOwn
										? "bg-blue-500 text-white border-0 rounded-2xl rounded-br-none"
										: "bg-gray-100 dark:bg-gray-800 text-foreground border-0 rounded-2xl rounded-bl-none"
							)}
						>
							{message.replyTo && !isRecalled && (
								<ReplyQuoteInline
									replyTo={message.replyTo}
									isOwn={isOwn}
									participants={selectedConvo.participants}
									currentUserId={currentUserId}
								/>
							)}
							<div className="flex flex-col gap-0.5 w-fit">
								<div className="w-fit">
									<MessageContent message={message} isOwn={isOwn} downloadUrl={downloadUrl} />
								</div>

								{!isImage && (
									<div className={cn(
										"flex items-center gap-1 select-none self-start -mt-0.5",
										isOwn ? "text-white/60" : "text-muted-foreground/60"
									)}>
										<span className="text-[10px] sm:text-[10.5px] font-medium leading-none whitespace-nowrap">
											{formatMessageTime(new Date(message.createdAt))}
										</span>
										{isOwn && message.status === "error" && (
											<AlertCircle className="size-2.5 text-red-300" />
										)}
									</div>
								)}
							</div>
						</Card>

						{isOwn && (
							<div className={cn(
								"flex justify-end mt-0.5 overflow-hidden transition-all duration-300 ease-in-out",
								message.status === "sending" ? "h-6 opacity-100" : "h-0 opacity-0"
							)}>
								<div className="flex items-center gap-1.5 bg-black/20 dark:bg-white/10 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/10 h-5">
									<Clock className="size-3 text-white/80 animate-spin" />
									<span className="text-[11px] font-medium text-white/90">Đang gửi</span>
								</div>
							</div>
						)}

						{/* Reaction Display */}
						{reactionSummary && (
							<button
								onClick={() => setShowReactionModal(true)}
								className={cn(
									"absolute bottom-0 right-0 translate-y-[52%] translate-x-[20%] z-10",
									"flex items-center gap-1.5 px-1.5 py-0.5 rounded-full border shadow-lg transition-all",
									"bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 active:scale-95 group/reacts",
									reactionSummary.myReaction ? "border-primary/50" : "border-border/60"
								)}
							>
								<div className="flex -space-x-1">
									{reactionSummary.uniqueEmojis.map((e, i) => (
										<span key={i} className="text-[13px] leading-none drop-shadow-sm">{e}</span>
									))}
								</div>
								{reactionSummary.totalCount > 1 && (
									<span className="text-[10px] font-bold text-muted-foreground ml-0.5 leading-none group-hover/reacts:text-foreground">
										{reactionSummary.totalCount}
									</span>
								)}
							</button>
						)}

						{/* Hover Action Bar - Quick Reaction Button */}
						{!isRecalled && !message.status && !isDisbanded && (
							<div className={cn(
								"absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-30",
								isOwn ? "-left-18 sm:-left-19" : "-right-18 sm:-right-19"
							)}>
								<div className="flex items-center gap-1 bg-background shadow-md border border-border/40 rounded-full px-0.5 py-0.5">
									<Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
										<PopoverTrigger asChild>
											<button
												className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
												disabled={isReacting}
												title="Thả cảm xúc"
												onClick={() => setShowEmojiPicker(true)}
											>
												<Smile className="h-4 w-4" />
											</button>
										</PopoverTrigger>
										<PopoverContent className="w-auto p-0 border-0 shadow-2xl" align={isOwn ? "end" : "start"} side="top" sideOffset={8}>
											<Picker
												data={data}
												onEmojiSelect={(emoji: any) => {
													handleEmojiSelect(emoji);
													setShowEmojiPicker(false);
												}}
												theme="light"
												set="native"
												autoFocus={false}
												skinTonePosition="none"
												previewPosition="none"
											/>
										</PopoverContent>
									</Popover>
								</div>
							</div>
						)}


						{!isRecalled && (!message.status || message.status === "sent") && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										className={cn(
											"absolute top-1/2 -translate-y-1/2",
											isOwn ? "-left-10 sm:-left-11" : "-right-10 sm:-right-11",
											"opacity-0 group-hover:opacity-70 hover:opacity-100",
											"transition-opacity duration-150 ease-in-out",
											"text-muted-foreground hover:text-foreground",
											"p-1.5 rounded-full hover:bg-accent/40",
											"focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
										)}
										aria-label="Message actions"
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
											<circle cx="12" cy="12" r="1" />
											<circle cx="19" cy="12" r="1" />
											<circle cx="5" cy="12" r="1" />
										</svg>
									</button>
								</DropdownMenuTrigger>

								<DropdownMenuContent align={isOwn ? "end" : "start"} className="w-44">
									{!isDisbanded && (
										<DropdownMenuItem onClick={() => onReply?.(message)}>
											<Reply className="w-4 h-4 mr-2" strokeWidth={1.6} />
											Trả lời
										</DropdownMenuItem>
									)}
									{message.content && (
										<DropdownMenuItem onClick={handleCopy}>
											<Copy className="w-4 h-4 mr-2" strokeWidth={1.6} />
											Sao chép
										</DropdownMenuItem>
									)}
									{(message.fileUrl || message.filePublicId) && (
										<DropdownMenuItem asChild>
											<a href={downloadUrl} download={message.fileName ?? true} target="_blank" rel="noopener noreferrer" className="flex items-center">
												<Download className="w-4 h-4 mr-2" strokeWidth={1.6} />
												Tải xuống
											</a>
										</DropdownMenuItem>
									)}
									{!isDisbanded && (
										<DropdownMenuItem onClick={() => setShowPinOptions(true)}>
											{isPinned ? (
												<PinOff className="w-4 h-4 mr-2" strokeWidth={1.6} />
											) : (
												<Pin className="w-4 h-4 mr-2" strokeWidth={1.6} />
											)}
											{isPinned ? "Bỏ ghim tin nhắn" : "Ghim tin nhắn"}
										</DropdownMenuItem>
									)}
									{isOwn && !isDisbanded && (
										<DropdownMenuItem
											className="text-destructive focus:text-destructive focus:bg-destructive/10"
											onClick={() => setShowConfirmRecall(true)}
										>
											<Undo2 className="w-4 h-4 mr-2" strokeWidth={1.6} />
											Thu hồi
										</DropdownMenuItem>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</div>
			</div>

			{isOwn && isLast && (!message.status || message.status === "sent") && (
				<div className="flex items-center gap-1 mt-0.5 mx-3 justify-end">
					{seenByOthers.length > 0 ? (
						seenByOthers.map((seenId) => {
							const seenUserId = typeof seenId === "string" ? seenId : seenId._id?.toString();
							const seenParticipant = selectedConvo.participants.find(
								(p) => p.userId?._id?.toString() === seenUserId
							);
							return seenParticipant ? (
								<UserAvatar
									key={seenUserId}
									type="seen"
									name={seenParticipant.userId.nickname ?? seenParticipant.userId.displayName ?? "User"}
									avatarUrl={seenParticipant.userId.avatarUrl ?? undefined}
								/>
							) : null;
						})
					) : (
						<span className="text-[11px] text-muted-foreground">Đã gửi</span>
					)}
				</div>
			)}

			<ConfirmationModal
				isOpen={showConfirmRecall}
				onClose={() => setShowConfirmRecall(false)}
				onConfirm={handleRecall}
				title="Thu hồi tin nhắn?"
				description="Tin nhắn này sẽ bị xóa khỏi cuộc trò chuyện của bạn và những người khác. Hành động này không thể hoàn tác."
				confirmText="Thu hồi"
				variant="destructive"
			/>
			<ConfirmationModal
				isOpen={showPinOptions}
				onClose={() => setShowPinOptions(false)}
				onConfirm={handlePin}
				title={isPinned ? "Bỏ ghim tin nhắn?" : "Ghim tin nhắn?"}
				description={isPinned ? "Tin nhắn này sẽ được bỏ ghim." : "Tin nhắn này sẽ được ghim vào đầu cuộc trò chuyện."}
				confirmText={isPinned ? "Bỏ ghim" : "Ghim"}
			/>

			{message.reactions && (
				<ReactionDetailModal
					isOpen={showReactionModal}
					onClose={() => setShowReactionModal(false)}
					reactions={message.reactions}
				/>
			)}
		</>
	);
};

export default MessageItem;