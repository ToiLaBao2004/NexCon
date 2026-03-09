import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
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

interface MessageItemProps {
	message: Message;
	index: number;
	messages: Message[];
	selectedConvo: Conversation;
	currentUserId: string;
}

const MessageItem = ({
	message,
	index,
	messages,
	selectedConvo,
	currentUserId,
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

	const seenByOthers =
		selectedConvo.seenBy?.filter(
			(s: any) => (typeof s === "string" ? s : s._id?.toString()) !== currentUserId
		) ?? [];

	const { recallMessage } = useChatStore();

	const [showConfirmRecall, setShowConfirmRecall] = useState(false);

	const handleRecall = async () => {
		try {
			await recallMessage(message._id);
		} catch (error) {
			console.error("Thu hồi thất bại:", error);
		} finally {
			setShowConfirmRecall(false);
		}
	};

	const displayContent = isRecalled
		? isOwn
			? "Bạn đã thu hồi một tin nhắn"
			: "Tin nhắn đã được thu hồi"
		: message.content;

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
								"px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
								isRecalled
									? "bg-muted text-muted-foreground border border-dashed border-border italic rounded-2xl"
									: isOwn
										? "bg-blue-500 text-white border-0 rounded-2xl rounded-br-none"
										: "bg-gray-100 dark:bg-gray-800 text-foreground border-0 rounded-2xl rounded-bl-none"
							)}
						>
							{displayContent}
						</Card>

						{!isRecalled && (
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
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="18"
											height="18"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2.2"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											<circle cx="12" cy="12" r="1" />
											<circle cx="19" cy="12" r="1" />
											<circle cx="5" cy="12" r="1" />
										</svg>
									</button>
								</DropdownMenuTrigger>

								<DropdownMenuContent align={isOwn ? "end" : "start"} className="w-44">
									<DropdownMenuItem>Trả lời</DropdownMenuItem>
									<DropdownMenuItem>Sao chép</DropdownMenuItem>

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

					{isGroupBreak && (
						<span className="text-xs text-muted-foreground mt-0.5 px-1.5">
							{formatMessageTime(new Date(message.createdAt))}
						</span>
					)}

					{isOwn && index === messages.length - 1 && (
						<div className="flex items-center gap-1.5 mt-0.5 px-1.5">
							{seenByOthers.length > 0 ? (
								seenByOthers.map((seenId) => {
									const seenUserId =
										typeof seenId === "string" ? seenId : seenId._id?.toString();
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
								<span className="text-xs text-muted-foreground">Đã gửi</span>
							)}
						</div>
					)}
				</div>
			</div>

			<ConfirmationModal
				isOpen={showConfirmRecall}
				onClose={() => setShowConfirmRecall(false)}
				onConfirm={handleRecall}
				title="Thu hồi tin nhắn?"
				description="Tin nhắn này sẽ bị xóa khỏi cuộc trò chuyện của bạn và những người khác. Hành động này không thể hoàn tác."
				confirmText="Thu hồi"
				variant="destructive"
			/>
		</>
	);
};

export default MessageItem;