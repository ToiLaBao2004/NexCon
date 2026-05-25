import { useMemo, useState } from "react";
import {
	ChevronDown,
	ChevronUp,
	MoreHorizontal,
	Pin,
	PinOff,
} from "lucide-react";
import type { Message } from "@/types/chat";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { decodeMentionTokens } from "@/utils/mentions";

interface PinnedMessagesBannerProps {
	onPinClick?: (messageId: string) => void;
}

const EMPTY_PINNED_MESSAGES: Message[] = [];
const EMPTY_PARTICIPANTS: any[] = [];

export function PinnedMessagesBanner({
	onPinClick,
}: PinnedMessagesBannerProps = {}) {
	const [expanded, setExpanded] = useState(false);
	const currentUserId = useAuthStore((s) => s.user?._id ?? "");

	const {
		activeConversationId,
		pinnedRaw,
		participants,
		pinMessage,
	} = useChatStore(
		useShallow((s) => {
			const activeId = s.activeConversationId;
			const selectedConvo = s.conversations.find((c) => c._id === activeId);

			return {
				activeConversationId: activeId,
				pinnedRaw: activeId
					? s.messages[activeId]?.pinnedMessages ?? EMPTY_PINNED_MESSAGES
					: EMPTY_PINNED_MESSAGES,
				participants: selectedConvo?.participants ?? EMPTY_PARTICIPANTS,
				pinMessage: s.pinMessage,
			};
		})
	);

	const pinned = useMemo(() => {
		return [...pinnedRaw].sort((a, b) => {
			const aTime = new Date(a.pinnedAt || a.createdAt).getTime();
			const bTime = new Date(b.pinnedAt || b.createdAt).getTime();
			return bTime - aTime;
		});
	}, [pinnedRaw]);

	const latestPinned = pinned[0];

	if (!activeConversationId || pinned.length === 0 || !latestPinned) return null;

	const handleUnpin = async (e: React.MouseEvent, messageId: string) => {
		e.stopPropagation();
		try {
			await pinMessage(messageId);
		} catch (error) {
			console.error(error);
		}
	};

	const getSenderName = (msg: Message) => {
		const senderIdStr = typeof msg.senderId === "object" 
			? ((msg.senderId as any)?._id?.toString() || (msg.senderId as any)?.toString())
			: msg.senderId?.toString();
			
		if (senderIdStr === currentUserId) return "Bạn";

		const found = participants.find(
			(p) => p.userId?._id?.toString() === senderIdStr
		);

		return (
			found?.userId?.nickname?.trim() ||
			found?.userId?.displayName?.trim() ||
			msg.senderInfo?.displayName?.trim() ||
			(typeof msg.senderId === "object" ? (msg.senderId as any)?.displayName?.trim() : null) ||
			"Người dùng"
		);
	};

	const getPreview = (msg: Message) => {
		if (msg.isRecalled) return "[Tin nhắn đã thu hồi]";
		if (msg.content?.trim()) return decodeMentionTokens(msg.content.trim(), participants, msg.mentions);
		if (msg.type === 'image') return "[Hình ảnh]";
		if (msg.type === 'file')  return `[File: ${msg.fileName ?? 'Tệp đính kèm'}]`;
		if (msg.type === 'link')  return "[Liên kết]";
		return "[Tin nhắn]";
	};

	const highlightMessage = (messageId: string) => {
		const el = document.getElementById(`message-${messageId}`);
		if (!el) return false;

		el.scrollIntoView({ behavior: "smooth", block: "center" });

		// restart animation nếu click nhiều lần
		el.classList.remove("animate-jump-highlight");
		void el.offsetWidth;
		el.classList.add("animate-jump-highlight");

		setTimeout(() => {
			el.classList.remove("animate-jump-highlight");
		}, 3000);

		return true;
	};

	const handleJump = async (msg: Message) => {
		if (onPinClick) {
			onPinClick(msg._id);
			return;
		}

		if (highlightMessage(msg._id)) {
			setExpanded(false);
			return;
		}

		const store = useChatStore.getState();
		if (activeConversationId) {
			await store.jumpToMessage(activeConversationId, msg._id);
			setExpanded(false);
		}
	};


	return (
		<div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className={cn(
					"w-full px-3 py-2 text-left transition-colors",
					"hover:bg-accent/30"
				)}
			>
				<div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/80 px-3 py-2 shadow-sm">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-500">
						<Pin className="h-4 w-4 fill-sky-500/20" />
					</div>

					<div className="min-w-0 flex-1">
						<div className="mb-0.5 flex items-center gap-1.5">
							<span className="text-[13px] font-semibold text-foreground">
								Tin nhắn ghim
							</span>
						</div>

						<p className="truncate text-[13px] text-foreground/95">
							<span className="font-semibold">{getSenderName(latestPinned)}:</span>{" "}
							{getPreview(latestPinned)}
						</p>
					</div>

					<div className="flex items-center gap-1.5">
						{pinned.length > 1 && (
							<span className="inline-flex h-7 items-center rounded-md border border-border/70 bg-background px-2.5 text-[12px] font-semibold text-foreground shadow-sm">
								+{pinned.length - 1} pin
							</span>
						)}

						<div className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground">
							{expanded ? (
								<ChevronUp className="h-4 w-4" />
							) : (
								<ChevronDown className="h-4 w-4" />
							)}
						</div>
					</div>
				</div>
			</button>

			<div
				className={cn(
					"grid transition-all duration-200 ease-out",
					expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
				)}
			>
				<div className="overflow-hidden">
					<div className="mx-3 mb-3 rounded-xl border border-border/60 bg-card/95 shadow-sm">
						<div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
							<div className="text-sm font-semibold text-foreground">
								Danh sách ghim ({pinned.length})
							</div>

							<button
								type="button"
								onClick={() => setExpanded(false)}
								className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
							>
								Thu gọn
								<ChevronUp className="h-3.5 w-3.5" />
							</button>
						</div>

						<div className="max-h-[220px] overflow-y-auto beautiful-scrollbar">
							{pinned.map((msg) => (
								<div
									key={msg._id}
									role="button"
									tabIndex={0}
									onClick={() => void handleJump(msg)}
									className={cn(
										"group flex w-full cursor-pointer items-start gap-2.5 border-b border-border/50 px-3 py-2 text-left transition-colors",
										"hover:bg-accent/40"
									)}
								>
									<div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-500">
										<Pin className="h-3.5 w-3.5 fill-sky-500/20" />
									</div>

									<div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">

										<div className="truncate text-[13px] leading-5 text-foreground/95">
											<span className="font-semibold">{getSenderName(msg)}:</span>{" "}
											{getPreview(msg)}
										</div>

										<div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
											{msg.pinnedAt
												? `Ghim lúc ${new Date(msg.pinnedAt).toLocaleString("vi-VN", {
													dateStyle: "short",
													timeStyle: "short",
												})}`
												: new Date(msg.createdAt).toLocaleString("vi-VN", {
													dateStyle: "short",
													timeStyle: "short",
												})}
										</div>
									</div>

									<div className="mt-0.5 flex shrink-0 items-center text-muted-foreground">
										<DropdownMenu modal={false}>
											<DropdownMenuTrigger asChild>
												<button
													type="button"
													className="rounded-full p-1 opacity-0 transition-opacity hover:bg-muted/60 focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
													onClick={(e) => e.stopPropagation()}
												>
													<MoreHorizontal className="h-4 w-4" />
												</button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-[180px]">
												<DropdownMenuItem
													className="cursor-pointer text-destructive focus:text-destructive"
													onClick={(e) => handleUnpin(e as unknown as React.MouseEvent, msg._id)}
												>
													<PinOff className="mr-2 h-4 w-4" />
													<span>Bỏ ghim tin nhắn</span>
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
