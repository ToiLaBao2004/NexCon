import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, MessageType, Participant } from "@/types/chat";
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
import { useState } from "react";
import { toast } from "sonner";
import { FileText, Link2, ExternalLink, Clock, AlertCircle } from "lucide-react";

interface MessageItemProps {
	message: Message;
	index: number;
	messages: Message[];
	selectedConvo: Conversation;
	currentUserId: string;
	isLast?: boolean;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Content renderer ──────────────────────────────────────────────────────────
function MessageContent({ message, isOwn }: { message: Message; isOwn: boolean }) {
	const type: MessageType = message.type ?? "text";

	if (message.isRecalled) {
		return (
			<span className="italic text-muted-foreground">
				{isOwn ? "Bạn đã thu hồi một tin nhắn" : "Tin nhắn đã được thu hồi"}
			</span>
		);
	}

	if (type === "image" && message.fileUrl) {
		return (
			<div className="flex flex-col gap-1.5">
				<a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
					<img
						src={message.fileUrl}
						alt={message.fileName ?? "image"}
						className="max-w-[240px] max-h-[300px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
					/>
				</a>
				{message.content && <p className="text-sm px-1">{message.content}</p>}
			</div>
		);
	}

	if (type === "file" && message.fileUrl) {
		return (
			<a
				href={message.fileUrl}
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
				href={message.content}
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

const MessageItem = ({
	message,
	index,
	messages,
	selectedConvo,
	currentUserId,
	isLast,
}: MessageItemProps) => {
	const prev = messages[index - 1];

	const isGroupBreak =
		index === 0 ||
		message.senderId !== prev?.senderId ||
		new Date(message.createdAt).getTime() - new Date(prev?.createdAt || 0).getTime() > 300000;

	const participant = selectedConvo.participants.find(
		(p: Participant) => p.userId?._id?.toString() === message.senderId?.toString()
	);

	const isOwn = message.senderId === currentUserId;
	const isRecalled = message.isRecalled === true;
	const isImage = message.type === "image" && !!message.fileUrl && !isRecalled;

	const seenByOthers =
		selectedConvo.seenBy?.filter(
			(s: any) => (typeof s === "string" ? s : s._id?.toString()) !== currentUserId
		) ?? [];

	const { recallMessage, pinMessage } = useChatStore();
	const [showConfirmRecall, setShowConfirmRecall] = useState(false);
	const [showPinOptions, setShowPinOptions] = useState(false);

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
								name={participant?.userId.displayName ?? "User"}
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
					<div className="relative">
						<Card
							className={cn(
								"shadow-sm overflow-hidden w-fit",
								isOwn && "ms-auto",
								isImage ? "p-0 bg-transparent border-0" : "px-2 py-1.5 text-sm",
								isRecalled
									? "bg-muted text-muted-foreground border border-dashed border-border italic rounded-2xl"
									: isOwn
										? "bg-blue-500 text-white border-0 rounded-2xl rounded-br-none"
										: "bg-gray-100 dark:bg-gray-800 text-foreground border-0 rounded-2xl rounded-bl-none"
							)}
						>
							<div className="flex flex-col gap-0.5 w-fit">
								<div className="w-fit">
									<MessageContent message={message} isOwn={isOwn} />
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
									<DropdownMenuItem>Trả lời</DropdownMenuItem>
									{message.content && (
										<DropdownMenuItem onClick={handleCopy}>Sao chép</DropdownMenuItem>
									)}
									{message.fileUrl && (
										<DropdownMenuItem asChild>
											<a href={message.fileUrl} download={message.fileName ?? true} target="_blank" rel="noopener noreferrer">
												Tải xuống
											</a>
										</DropdownMenuItem>
									)}
									<DropdownMenuItem onClick={() => setShowPinOptions(true)}>
										Ghim tin nhắn
									</DropdownMenuItem>
									{isOwn && (
										<DropdownMenuItem
											className="text-destructive focus:text-destructive focus:bg-destructive/10"
											onClick={() => setShowConfirmRecall(true)}
										>
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
									name={seenParticipant.userId.displayName ?? ""}
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
				title="Ghim tin nhắn?"
				description="Tin nhắn này sẽ được ghim vào đầu cuộc trò chuyện."
				confirmText="Ghim"
			/>
		</>
	);
};

export default MessageItem;