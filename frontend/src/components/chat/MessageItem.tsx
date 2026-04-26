import { cn, formatMessageTime, formatBytes, normalizeUrl } from "@/lib/utils";
import type { Conversation, Mention, Message, MessageType, Participant, ReplyToMessage } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/useChatStore";
import { useReminderStore } from "@/stores/useReminderStore";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import SecureImage from "../SecureImage";
import { Input } from "@/components/ui/input";
import useMediaCacheStore from "@/stores/useMediaCacheStore";
import { chatService } from "@/services/chatService";
import { reminderService } from "@/services/reminderService";
import { FileText, Link2, ExternalLink, Clock, BellPlus, AlertCircle, Pin, PinOff, Undo2, Reply, ImageIcon, Smile, Copy, Download, Search, Forward, Mic, Play, Pause } from "lucide-react";
import { StickerIcon } from "@/components/shared/StickerIcon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import ReactionDetailModal from "./ReactionDetailModal";
import { useImageViewerStore } from "@/stores/useImageViewerStore";
import { useSocketStore } from "@/stores/useSocketStore";
import ReminderQuickModal from "@/components/reminder/ReminderQuickModal";
import ReminderFormModal from "@/components/reminder/ReminderFormModal";
import type { Reminder, SharedReminderOverviewResponse } from "@/types/reminder";
import ForwardMessageModal from "./ForwardMessageModal";

const sharedReminderOverviewCache = new Map<string, SharedReminderOverviewResponse>();

/* ── Custom audio player for voice messages ─────────────────────────────────── */
const AUDIO_BAR_COUNT = 32;

function MentionChip({ children, isOwn }: { children: React.ReactNode; isOwn: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold align-baseline",
				isOwn
					? "bg-white/15 text-white"
					: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300"
			)}
		>
			{children}
		</span>
	);
}

const MENTION_TOKEN_REGEX = /@\[USER:([^\]]+)\]/g;

const resolveMentionDisplayName = (
	userId: string,
	participants: Participant[],
	mentions: Mention[] | undefined,
) => {
	const participant = participants.find(
		(item) => String(item.userId?._id || item.userId) === String(userId)
	);

	if (participant) {
		return participant.userId?.nickname?.trim() || participant.userId?.displayName || "Người dùng";
	}

	const mentionMeta = (mentions ?? []).find((item) => String(item.userId) === String(userId));
	if (mentionMeta?.displayName?.trim()) {
		return mentionMeta.displayName.trim();
	}

	return "Người dùng";
};

function renderMentionedText(
	text: string,
	mentions: Mention[] | undefined,
	isOwn: boolean,
	participants: Participant[],
) {
	const safeText = text ?? "";

	const tokenParts: React.ReactNode[] = [];
	let tokenCursor = 0;
	let tokenMatched = false;
	let tokenMatch: RegExpExecArray | null = null;

	MENTION_TOKEN_REGEX.lastIndex = 0;
	while ((tokenMatch = MENTION_TOKEN_REGEX.exec(safeText)) !== null) {
		tokenMatched = true;
		const tokenStart = tokenMatch.index;
		const tokenRaw = tokenMatch[0] || "";
		const tokenUserId = (tokenMatch[1] || "").trim();

		if (tokenStart > tokenCursor) {
			tokenParts.push(<span key={`token-text-${tokenCursor}`}>{safeText.slice(tokenCursor, tokenStart)}</span>);
		}

		const mentionLabel = resolveMentionDisplayName(tokenUserId, participants, mentions);
		tokenParts.push(
			<MentionChip key={`token-mention-${tokenStart}-${tokenUserId}`} isOwn={isOwn}>
				{`@${mentionLabel}`}
			</MentionChip>
		);

		tokenCursor = tokenStart + tokenRaw.length;
	}

	if (tokenMatched) {
		if (tokenCursor < safeText.length) {
			tokenParts.push(<span key={`token-tail-${tokenCursor}`}>{safeText.slice(tokenCursor)}</span>);
		}

		return <span className="text-sm whitespace-pre-wrap break-words">{tokenParts}</span>;
	}

	const validMentions = (mentions ?? [])
		.filter((mention) => Number.isFinite(mention.offset) && Number.isFinite(mention.length) && mention.length > 0)
		.sort((a, b) => a.offset - b.offset);

	if (!validMentions.length) {
		return <span className="text-sm whitespace-pre-wrap break-words">{safeText}</span>;
	}

	const parts: React.ReactNode[] = [];
	let cursor = 0;

	for (const mention of validMentions) {
		const mentionStart = Math.max(0, mention.offset);
		const mentionEnd = Math.max(mentionStart, mentionStart + mention.length);

		if (mentionStart > cursor) {
			parts.push(<span key={`text-${cursor}`}>{safeText.slice(cursor, mentionStart)}</span>);
		}

		if (mentionStart < safeText.length && mentionEnd <= safeText.length) {
			parts.push(
				<MentionChip key={`mention-${mentionStart}-${mentionEnd}`} isOwn={isOwn}>
					{safeText.slice(mentionStart, mentionEnd)}
				</MentionChip>
			);
			cursor = mentionEnd;
		}
	}

	if (cursor < safeText.length) {
		parts.push(<span key={`text-tail-${cursor}`}>{safeText.slice(cursor)}</span>);
	}

	return <span className="text-sm whitespace-pre-wrap break-words">{parts}</span>;
}

function AudioPlayer({ src, isOwn }: { src: string; isOwn: boolean }) {
	const [isPlaying, setIsPlaying] = useState(false);
	const [progress, setProgress] = useState(0); // 0-1
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Pseudo-static waveform bars (seeded from src hash for consistency)
	const bars = useMemo(() => {
		let seed = 0;
		for (let i = 0; i < src.length; i++) seed = (seed * 31 + src.charCodeAt(i)) & 0xffffffff;
		return Array.from({ length: AUDIO_BAR_COUNT }, (_, i) => {
			seed = (seed * 1664525 + 1013904223) & 0xffffffff;
			const raw = (Math.abs(seed) / 0x7fffffff);
			const wave = Math.abs(Math.sin((i / AUDIO_BAR_COUNT) * Math.PI));
			return 0.15 + raw * 0.55 * wave + 0.1 * wave;
		});
	}, [src]);

	useEffect(() => {
		if (audioRef.current && src && src !== "#") {
			audioRef.current.load();
		}
	}, [src]);

	const togglePlay = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (src === "#" || !audio.currentSrc) return;

		if (isPlaying) {
			audio.pause();
		} else {
			// Workaround for Chrome Infinity bug on webm:
			if (audio.duration === Infinity) {
				audio.currentTime = 1e101;
				setTimeout(() => {
					audio.currentTime = 0;
					audio.play().catch(console.error);
				}, 100);
			} else {
				audio.play().catch(console.error);
			}
		}
	};

	const seek = (ratio: number) => {
		const audio = audioRef.current;
		if (!audio) return;
		const targetTime = ratio * (isFinite(duration) && duration > 0 ? duration : audio.duration || 0);
		if (isFinite(targetTime)) {
			audio.currentTime = targetTime;
			setProgress(ratio);
		}
	};

	const activeBars = Math.round(progress * AUDIO_BAR_COUNT);

	const fmt = (s: number) => {
		if (!isFinite(s) || isNaN(s) || s < 0) return "0:00";
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return `${m}:${sec < 10 ? "0" : ""}${sec}`;
	};

	const activeColor = isOwn ? "rgba(255,255,255,0.9)" : "rgb(99 102 241)";
	const inactiveColor = isOwn ? "rgba(255,255,255,0.35)" : "rgb(199 210 254 / 0.8)";

	return (
		<div className="flex items-center gap-2 w-[220px] sm:w-[260px]">
			{/* Hidden native audio for robust event management */}
			<audio
				ref={audioRef}
				src={src}
				preload="metadata"
				onPlay={() => setIsPlaying(true)}
				onPause={() => setIsPlaying(false)}
				onEnded={() => {
					setIsPlaying(false);
					setProgress(0);
					setCurrentTime(0);
					const audio = audioRef.current;
					if (audio) audio.currentTime = 0;
				}}
				onTimeUpdate={(e) => {
					const audio = e.currentTarget;
					setCurrentTime(audio.currentTime);
					// Fallback to 1 if duration is Infinity to avoid NaN
					const currentDur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
					if (isFinite(currentDur) && currentDur > 0) {
						setProgress(audio.currentTime / currentDur);
					} else {
						setProgress(0);
					}
				}}
				onLoadedMetadata={(e) => {
					const audio = e.currentTarget;
					if (isFinite(audio.duration)) {
						setDuration(audio.duration);
					}
				}}
				onDurationChange={(e) => {
					const audio = e.currentTarget;
					if (isFinite(audio.duration)) {
						setDuration(audio.duration);
					}
				}}
			/>

			{/* Play / Pause */}
			<button
				type="button"
				onClick={togglePlay}
				className={cn(
					"shrink-0 size-8 rounded-full flex items-center justify-center transition-colors",
					isOwn
						? "bg-white/20 hover:bg-white/30 text-white"
						: "bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-600 dark:text-indigo-300"
				)}
			>
				{isPlaying
					? <Pause className="size-3.5" fill="currentColor" />
					: <Play className="size-3.5" fill="currentColor" />}
			</button>

			{/* Waveform + seek */}
			<div className="flex-1 flex flex-col gap-[3px]">
				<div
					className="flex items-center gap-[2px] h-7 cursor-pointer"
					onClick={(e) => {
						const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
						seek((e.clientX - rect.left) / rect.width);
					}}
					title="Nhấn để tua"
				>
					{bars.map((h, i) => (
						<div
							key={i}
							className="rounded-full shrink-0"
							style={{
								width: "2px",
								height: `${Math.max(3, h * 26)}px`,
								backgroundColor: i < activeBars ? activeColor : inactiveColor,
								transition: "background-color 0.1s",
							}}
						/>
					))}
				</div>
				<span className={cn("text-[10px] tabular-nums font-mono leading-none", isOwn ? "text-white/60" : "text-muted-foreground")}>
					{(progress > 0 || isPlaying) ? fmt(currentTime) : fmt(duration)}
				</span>
			</div>
		</div>
	);
}


interface MessageItemProps {
	message: Message;
	index: number;
	messages: Message[];
	selectedConvo: Conversation;
	currentUserId: string;
	isLast?: boolean;
	onReply?: (message: Message) => void;
}

function MessageContent({ message, isOwn, downloadUrl, participants }: { message: Message; isOwn: boolean; downloadUrl: string; participants: Participant[] }) {
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
					<button
						type="button"
						className="p-0 border-0 bg-transparent cursor-zoom-in"
						onClick={() =>
							useImageViewerStore.getState().openViewer({
								messageId: message._id,
								alt: message.fileName ?? "image",
							})
						}
					>
						<SecureImage
							messageId={message._id}
							alt={message.fileName ?? "image"}
							className="max-w-[240px] max-h-[300px] rounded-xl object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
						/>
					</button>
				) : (
					<button
						type="button"
						className="p-0 border-0 bg-transparent cursor-zoom-in"
						onClick={() =>
							useImageViewerStore.getState().openViewer({
								src: message.fileUrl!,
								alt: message.fileName ?? "image",
							})
						}
					>
						<img
							src={message.fileUrl!}
							alt={message.fileName ?? "image"}
							className="max-w-[240px] max-h-[300px] rounded-xl object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
						/>
					</button>
				)}
				{message.content && <p className="text-sm px-1">{renderMentionedText(message.content, message.mentions, isOwn, participants)}</p>}
			</div>
		);
	}

	if (type === "sticker" && message.content) {
		return (
			<div className="group/sticker relative">
				<div className="relative transition-all duration-300 group-hover/sticker:scale-110 drop-shadow-sm group-hover/sticker:drop-shadow-md">
					<img
						src={message.content}
						alt="sticker"
						className="w-32 h-32 sm:w-40 sm:h-40 object-contain animate-in zoom-in-50 duration-300"
						loading="lazy"
					/>
				</div>
			</div>
		);
	}

	if (type === "audio" && (message.filePublicId || message.fileUrl)) {
		return (
			<div className="flex flex-col gap-1.5">
				<AudioPlayer src={downloadUrl} isOwn={isOwn} />
				{message.content && (
					<p className="text-sm px-1">{renderMentionedText(message.content, message.mentions, isOwn, participants)}</p>
				)}
			</div>
		);
	}

	if (type === "file" && (message.filePublicId || message.fileUrl)) {
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
		const preview = message.metadata?.linkPreview;
		const hostname =
			preview?.hostname ||
			preview?.siteName ||
			(() => {
				try {
					return new URL(normalizeUrl(message.content!)).hostname;
				} catch {
					return "Liên kết";
				}
			})();

		if (preview?.title || preview?.image || preview?.description) {
			return (
				<a
					href={normalizeUrl(message.content)}
					target="_blank"
					rel="noopener noreferrer"
					className={cn(
						"block max-w-[320px] overflow-hidden rounded-2xl border transition hover:opacity-95",
						isOwn
							? "border-white/20 bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:border-white/10"
							: "border-border bg-background"
					)}
				>
					{preview.image && (
						<img
							src={preview.image}
							alt={preview.title || "Link preview"}
							className="h-40 w-full object-cover"
						/>
					)}

					<div className="p-3">
						<div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
							<Link2 className="size-3.5 shrink-0" />
							<span className="truncate">{preview.siteName || hostname}</span>
						</div>

						{preview.title && (
							<div className="line-clamp-2 text-sm font-semibold">
								{preview.title}
							</div>
						)}

						{preview.description && (
							<div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
								{preview.description}
							</div>
						)}

						<div className="mt-2 text-[11px] break-all text-muted-foreground/80">
							{message.content}
						</div>
					</div>
				</a>
			);
		}

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

	return renderMentionedText(message.content ?? "", message.mentions, isOwn, participants);
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
	} else if (replyTo.type === "sticker") {
		preview = (
			<span className="flex items-center gap-2">
				{replyTo.content && (
					<img
						src={replyTo.content}
						alt="reply-sticker-thumbnail"
						className="w-8 h-8 rounded-md object-contain bg-white/10 border border-blue-200 dark:border-blue-400"
					/>
				)}
				<span className="flex items-center gap-1">
					<StickerIcon className="size-3 shrink-0" /> Nhãn dán
				</span>
			</span>
		);
	} else if (replyTo.type === "audio") {
		preview = (
			<span className="flex items-center gap-1">
				<Mic className="size-3 shrink-0" /> Tin nhắn thoại
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

	const metadata = message.metadata instanceof Map ? Object.fromEntries(message.metadata) : (message.metadata || {});
	const reminders = useReminderStore((state) => state.reminders);
	const removedReminderIds = useReminderStore((state) => state.removedReminderIds);
	const convoMessages = useChatStore((state) => state.messages[selectedConvo._id]?.items ?? []);
	const updateSharedReminderParticipationAsync = useReminderStore((state) => state.updateSharedReminderParticipationAsync);
	const sharedKey = String(metadata.sharedKey || '').trim();
	const reminderIdFromMeta = String(metadata.reminderId || '').trim();
	const hasLinkedReminder = useMemo(() => {
		if (reminderIdFromMeta && reminders.some((item) => item._id === reminderIdFromMeta)) {
			return true;
		}

		if (sharedKey && reminders.some((item) => item.sharedKey === sharedKey)) {
			return true;
		}

		return false;
	}, [reminderIdFromMeta, reminders, sharedKey]);
	const [isUpdatingParticipation, setIsUpdatingParticipation] = useState(false);
	const [sharedOverview, setSharedOverview] = useState<SharedReminderOverviewResponse | null>(null);
	const [isLoadingSharedOverview, setIsLoadingSharedOverview] = useState(false);
	const [isParticipantDialogOpen, setIsParticipantDialogOpen] = useState(false);
	const [participantSearchTerm, setParticipantSearchTerm] = useState('');
	const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
	const [isSharedReminderUnavailable, setIsSharedReminderUnavailable] = useState(false);
	const lastSharedOverviewRefreshTriggerRef = useRef<string | null>(null);
	const isSharedReminderCancelled = useMemo(() => {
		if (!sharedKey) return false;

		return convoMessages.some((item) => {
			if (item.type !== 'system' || item.systemType !== 'shared_reminder_cancelled') return false;
			const itemMetadata = item.metadata instanceof Map ? Object.fromEntries(item.metadata) : (item.metadata || {});
			return String(itemMetadata.sharedKey || '').trim() === sharedKey;
		});
	}, [convoMessages, sharedKey]);

	useEffect(() => {
		if (!isSharedReminderCancelled && !isSharedReminderUnavailable) return;
		setIsParticipantDialogOpen(false);
	}, [isSharedReminderCancelled, isSharedReminderUnavailable]);

	useEffect(() => {
		if (isParticipantDialogOpen) return;
		setParticipantSearchTerm('');
	}, [isParticipantDialogOpen]);

	const addedUserIds = Array.isArray(metadata.addedUserIds) ? metadata.addedUserIds : [];
	const addedUsersInfo = Array.isArray(metadata.addedUsersInfo) ? metadata.addedUsersInfo : null;
	const participantsById = useMemo(() => {
		const map = new Map<string, any>();
		selectedConvo.participants.forEach((p: any) => {
			const pid = (p.userId?._id || p.userId)?.toString?.();
			if (pid) map.set(pid, p.userId);
		});
		return map;
	}, [selectedConvo.participants]);

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

	type Actor = { id: string; name: string; avatarUrl?: string | null };

	const getViewerName = (actor: Actor) => {
		const actorId = actor.id?.startsWith("name:") ? null : actor.id?.toString?.();
		return actorId && actorId === currentUserId?.toString() ? "Bạn" : actor.name;
	};

	const makeActor = (id: any, name: any, avatarUrl?: any): Actor | null => {
		const normalizedId = id?.toString?.() || "";
		const normalizedName = (name || "Người dùng").toString();
		if (!normalizedId && !normalizedName) return null;
		return {
			id: normalizedId || `name:${normalizedName}`,
			name: normalizedName,
			avatarUrl: avatarUrl ?? undefined,
		};
	};

	const actorBadge = (actor: Actor, key?: string) => (
		<span key={key || actor.id} className="inline-flex items-center gap-1.5 align-middle whitespace-nowrap mx-0.5">
			<UserAvatar
				type="seen"
				name={getViewerName(actor)}
				avatarUrl={actor.avatarUrl ?? undefined}
				className="size-[20px] shrink-0 border border-background shadow-sm"
			/>
			<span className="font-semibold text-[13px] text-slate-700 dark:text-slate-200">{getViewerName(actor)}</span>
		</span>
	);

	const textPart = (value: string, key?: string) => (
		<span key={key || value} className="inline align-middle font-normal text-[13px] text-slate-600 dark:text-slate-300">
			{value}
		</span>
	);

	const scrollToReminderCard = useCallback(() => {
		const targets: Array<HTMLElement | null> = [];

		if (sharedKey) {
			const sharedAnchorId = `shared-reminder-card-${sharedKey}`;
			targets.push(document.getElementById(sharedAnchorId) as HTMLElement | null);
			targets.push(document.querySelector(`[data-shared-reminder-card=\"${sharedKey}\"]`) as HTMLElement | null);
		}

		if (reminderIdFromMeta) {
			const personalAnchorId = `reminder-card-${reminderIdFromMeta}`;
			targets.push(document.getElementById(personalAnchorId) as HTMLElement | null);
			targets.push(document.querySelector(`[data-reminder-card=\"${reminderIdFromMeta}\"]`) as HTMLElement | null);
		}

		const target = targets.find((item): item is HTMLElement => Boolean(item));

		if (!target) return false;

		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		target.classList.add('ring-2', 'ring-primary/40', 'ring-offset-1', 'rounded-md');
		window.setTimeout(() => {
			target.classList.remove('ring-2', 'ring-primary/40', 'ring-offset-1', 'rounded-md');
		}, 1800);

		return true;
	}, [reminderIdFromMeta, sharedKey]);

	const reminderLinkPart = useCallback((value: string, key?: string) => (
		<span
			key={key || value}
			onClick={(event) => {
				event.stopPropagation();
				scrollToReminderCard();
			}}
			className="cursor-pointer inline align-middle font-medium text-[13px] text-sky-700 underline decoration-sky-500/60 underline-offset-2 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
		>
			{value}
		</span>
	), [scrollToReminderCard]);

	const reminderActionPart = useCallback((actionText: string, reminderContent: string, keyPrefix: string) => {
		if (!reminderContent) {
			return textPart(actionText, `${keyPrefix}-plain`);
		}

		return (
			<>
				{textPart(`${actionText}:`, `${keyPrefix}-label`)} {reminderLinkPart(reminderContent, `${keyPrefix}-value`)}
			</>
		);
	}, [reminderLinkPart]);

	const renderAddedGroup = (actors: Actor[]) => {
		const uniqueActors = actors.filter((actor, index, arr) => arr.findIndex((a) => a.id === actor.id) === index);
		if (!uniqueActors.length) return null;

		const MAX_VISIBLE = 3;
		const visibleActors = uniqueActors.slice(0, MAX_VISIBLE);
		const remainingCount = Math.max(0, uniqueActors.length - MAX_VISIBLE);
		const visibleNames = visibleActors.map((actor) => getViewerName(actor)).join(", ");
		const namesText = remainingCount > 0
			? `${visibleNames} và ${remainingCount} người khác`
			: visibleNames;

		return (
			<span className="inline-flex items-center gap-1.5 align-middle mx-0.5">
				<span className="inline-flex -space-x-1.5 shrink-0">
					{visibleActors.map((actor, idx) => (
						<UserAvatar
							key={`added-avatar-${actor.id}-${idx}`}
							type="seen"
							name={actor.name}
							avatarUrl={actor.avatarUrl ?? undefined}
							className="size-[20px] border border-background shadow-sm"
						/>
					))}
					{remainingCount > 0 && (
						<span className="inline-flex size-[20px] items-center justify-center rounded-full border border-background bg-slate-500 text-[9px] font-semibold text-white shadow-sm">
							+{remainingCount}
						</span>
					)}
				</span>
				<span className="font-semibold text-[13px] text-slate-700 dark:text-slate-200">
					{namesText}
				</span>
			</span>
		);
	};

	const systemContent = useMemo(() => {
		if (message.systemType === "member_added") {
			const addedById = metadata.addedBy?.toString?.() || metadata.addedBy;
			const addedByFromParticipants = addedById ? participantsById.get(addedById?.toString?.()) : null;
			const isAddedBySender = addedById && message.senderId && addedById.toString() === message.senderId.toString();

			const adder = makeActor(
				addedById,
				metadata.addedByName || message.senderInfo?.displayName,
				metadata.addedByInfo?.avatarUrl ||
				addedByFromParticipants?.avatarUrl ||
				(isAddedBySender ? message.senderInfo?.avatarUrl : undefined)
			);

			const addedActors: Actor[] = [];
			if (addedUsersInfo?.length) {
				addedUsersInfo.forEach((u: any) => {
					const actor = makeActor(u?._id, u?.displayName, u?.avatarUrl);
					if (actor) addedActors.push(actor);
				});
			} else if (addedParticipants.length) {
				addedParticipants.forEach((p: any) => {
					const actor = makeActor(p.userId?._id, p.userId?.displayName, p.userId?.avatarUrl);
					if (actor) addedActors.push(actor);
				});
			} else if (typeof metadata.addedUserNames === "string") {
				metadata.addedUserNames
					.split(",")
					.map((n: string) => n.trim())
					.filter(Boolean)
					.forEach((n: string) => {
						const actor = makeActor(`name:${n}`, n, undefined);
						if (actor) addedActors.push(actor);
					});
			}

			if (adder && addedActors.length) {
				const addedGroup = renderAddedGroup(addedActors);
				return (
					<>
						{addedGroup} {textPart("được")} {actorBadge(adder)} {textPart("thêm vào nhóm")}
					</>
				);
			}
		}

		if (message.systemType === "admin_transferred") {
			const appointed = makeActor(
				metadata.appointedUserId,
				metadata.appointedUserInfo?.displayName,
				metadata.appointedUserInfo?.avatarUrl
			);
			if (appointed) {
				return (
					<>
						{actorBadge(appointed)} {textPart("đã trở thành trưởng nhóm mới")}
					</>
				);
			}
		}

		if (message.systemType === "group_avatar_updated") {
			const updatedByActor = makeActor(
				metadata.updatedBy || message.senderId,
				metadata.updatedByName || message.senderInfo?.displayName || "Một thành viên",
				metadata.updatedByAvatarUrl || message.senderInfo?.avatarUrl
			);

			if (updatedByActor) {
				return (
					<>
						{actorBadge(updatedByActor)} {textPart("đã đổi ảnh đại diện nhóm")}
					</>
				);
			}
		}

		if (message.systemType === "group_name_updated") {
			const updatedByActor = makeActor(
				metadata.updatedBy || message.senderId,
				metadata.updatedByName || message.senderInfo?.displayName || "Một thành viên",
				metadata.updatedByAvatarUrl || message.senderInfo?.avatarUrl
			);
			const newName = String(metadata.newName || "").trim();

			if (updatedByActor) {
				return (
					<>
						{actorBadge(updatedByActor)} {textPart(newName ? `đã đổi tên nhóm thành ${newName}` : "đã đổi tên nhóm")}
					</>
				);
			}
		}

		if (message.systemType === "message_pinned") {
			const actor = makeActor(
				metadata.actionBy || message.senderId,
				metadata.actionByName || message.senderInfo?.displayName || "Một thành viên",
				message.senderInfo?.avatarUrl
			);

			if (actor) {
				return (
					<>
						{actorBadge(actor)} {textPart("đã ghim một tin nhắn")}
					</>
				);
			}
		}

		if (message.systemType === "message_unpinned") {
			const actor = makeActor(
				metadata.actionBy || message.senderId,
				metadata.actionByName || message.senderInfo?.displayName || "Một thành viên",
				message.senderInfo?.avatarUrl
			);

			if (actor) {
				return (
					<>
						{actorBadge(actor)} {textPart("đã bỏ ghim một tin nhắn")}
					</>
				);
			}
		}

		if (message.systemType === "member_left") {
			const leftActor = makeActor(
				metadata.leftUserId || metadata.userId,
				metadata.leftUserName || metadata.userName || message.senderInfo?.displayName,
				metadata.leftUserAvatarUrl || message.senderInfo?.avatarUrl
			);
			if (leftActor) {
				return (
					<>
						{actorBadge(leftActor)} {textPart("đã rời khỏi nhóm")}
					</>
				);
			}
		}

		if (message.systemType === "member_kicked") {
			const adminActor = makeActor(
				metadata.adminId || metadata.removedBy,
				metadata.adminName || metadata.removedByName || "Quản trị viên",
				metadata.adminAvatarUrl || metadata.removedByAvatarUrl || message.senderInfo?.avatarUrl
			);
			const kickedId = (metadata.kickedUserId || metadata.removedUserId)?.toString?.();
			const kickedFromParticipants = kickedId ? participantsById.get(kickedId) : null;
			const kickedActor = makeActor(
				metadata.kickedUserId || metadata.removedUserId,
				metadata.kickedUserName || metadata.removedUserName || "Thành viên",
				metadata.kickedUserAvatarUrl || metadata.removedUserAvatarUrl || kickedFromParticipants?.avatarUrl
			);
			if (adminActor && kickedActor) {
				return (
					<>
						{actorBadge(adminActor)} {textPart("đã đưa")} {actorBadge(kickedActor)} {textPart("ra khỏi nhóm")}
					</>
				);
			}
		}

		if (message.systemType === "approval_mode_changed") {
			const changedByActor = makeActor(
				metadata.changedBy,
				metadata.changedByName || message.senderInfo?.displayName || "Quản trị viên",
				metadata.changedByInfo?.avatarUrl || message.senderInfo?.avatarUrl
			);
			if (changedByActor) {
				const actionText = metadata.isApprovalRequired
					? "đã bật chế độ phê duyệt thành viên mới"
					: "đã tắt chế độ phê duyệt thành viên mới";
				return (
					<>
						{actorBadge(changedByActor)} {textPart(actionText)}
					</>
				);
			}
		}

		if (message.systemType === "reminder_created_local") {
			const creatorActor = makeActor(
				metadata.creatorId || message.senderId,
				metadata.creatorName || message.senderInfo?.displayName || "Một thành viên",
				metadata.creatorAvatarUrl || message.senderInfo?.avatarUrl
			);
			const reminderContent = String(metadata.reminderContent || "").trim();
			if (creatorActor) {
				return (
					<>
						{actorBadge(creatorActor)} {reminderActionPart("đã tạo nhắc hẹn mới", reminderContent, `local-created-${message._id}`)}
					</>
				);
			}
		}

		if (message.systemType === "shared_reminder_created") {
			const creatorActor = makeActor(
				metadata.creatorId || message.senderId,
				metadata.creatorName || message.senderInfo?.displayName || "Một thành viên",
				metadata.creatorAvatarUrl || message.senderInfo?.avatarUrl
			);
			const reminderContent = String(metadata.reminderContent || "").trim();
			if (creatorActor) {
				return (
					<>
						{actorBadge(creatorActor)} {reminderActionPart("đã tạo nhắc hẹn chung", reminderContent, `shared-created-${message._id}`)}
					</>
				);
			}
		}

		if (message.systemType === "shared_reminder_participation_changed") {
			const actor = makeActor(
				metadata.actorId || message.senderId,
				metadata.actorName || message.senderInfo?.displayName || "Một thành viên",
				metadata.actorAvatarUrl || message.senderInfo?.avatarUrl
			);
			const action = String(metadata.action || "").trim().toLowerCase();
			const reminderContent = String(metadata.reminderContent || "").trim();

			if (actor) {
				const actionText = action === "joined"
					? "đã tham gia nhắc hẹn"
					: action === "declined"
						? "đã rời nhắc hẹn"
						: "đã cập nhật trạng thái nhắc hẹn";

				return (
					<>
						{actorBadge(actor)} {reminderActionPart(actionText, reminderContent, `shared-participation-${message._id}`)}
					</>
				);
			}
		}

		if (message.systemType === "shared_reminder_cancelled") {
			const actor = makeActor(
				metadata.actorId || message.senderId,
				metadata.actorName || message.senderInfo?.displayName || "Một thành viên",
				metadata.actorAvatarUrl || message.senderInfo?.avatarUrl
			);
			const reminderContent = String(metadata.reminderContent || "").trim();

			if (actor) {
				return (
					<>
						{actorBadge(actor)} {reminderActionPart("đã hủy nhắc hẹn chung", reminderContent, `shared-cancelled-${message._id}`)}
					</>
				);
			}
		}

		if (message.systemType === "shared_reminder_updated") {
			const actor = makeActor(
				metadata.actorId || message.senderId,
				metadata.actorName || message.senderInfo?.displayName || "Một thành viên",
				metadata.actorAvatarUrl || message.senderInfo?.avatarUrl
			);
			const reminderContent = String(metadata.reminderContent || "").trim();

			if (actor) {
				return (
					<>
						{actorBadge(actor)} {reminderActionPart("đã chỉnh sửa nhắc hẹn chung", reminderContent, `shared-updated-${message._id}`)}
					</>
				);
			}
		}

		return textPart(text);
	}, [
		addedParticipants,
		addedUsersInfo,
		message.senderInfo?.avatarUrl,
		message.senderInfo?.displayName,
		message.senderId,
		message.systemType,
		metadata,
		participantsById,
		reminderActionPart,
		reminderLinkPart,
		currentUserId,
		text,
	]);

	const loadSharedOverview = useCallback(async (forceRefresh = false) => {
		if (message.systemType !== 'shared_reminder_created' || !sharedKey || isSharedReminderCancelled) {
			setSharedOverview(null);
			if (isSharedReminderCancelled) {
				setIsSharedReminderUnavailable(false);
			}
			return;
		}

		if (!forceRefresh) {
			const cached = sharedReminderOverviewCache.get(sharedKey);
			if (cached) {
				setSharedOverview(cached);
				setIsSharedReminderUnavailable(false);
				return;
			}
		}

		try {
			setIsLoadingSharedOverview(true);
			const overview = await reminderService.getSharedReminderOverview(sharedKey);
			sharedReminderOverviewCache.set(sharedKey, overview);
			setSharedOverview(overview);
			setIsSharedReminderUnavailable(false);
		} catch (error) {
			console.error('Load shared reminder overview failed:', error);
			const statusCode = typeof error === 'object' && error !== null
				? (error as { response?: { status?: number } }).response?.status
				: undefined;

			if (statusCode === 404) {
				sharedReminderOverviewCache.delete(sharedKey);
				setSharedOverview(null);
				setIsSharedReminderUnavailable(true);
				return;
			}

			const cached = sharedReminderOverviewCache.get(sharedKey);
			setSharedOverview(cached || null);
			setIsSharedReminderUnavailable(false);
		} finally {
			setIsLoadingSharedOverview(false);
		}
	}, [isSharedReminderCancelled, message.systemType, sharedKey]);

	useEffect(() => {
		if (message.systemType !== 'shared_reminder_created') return;
		if (isSharedReminderCancelled) {
			setSharedOverview(null);
			return;
		}
		if (!hasLinkedReminder || isParticipantDialogOpen) {
			void loadSharedOverview();
		}
	}, [hasLinkedReminder, isParticipantDialogOpen, isSharedReminderCancelled, loadSharedOverview, message.systemType]);

	useEffect(() => {
		if (message.systemType !== 'shared_reminder_created' || !sharedKey) return;
		if (isSharedReminderCancelled) return;

		let latestEvent: Message | null = null;
		for (let index = convoMessages.length - 1; index >= 0; index -= 1) {
			const item = convoMessages[index];
			if (item.type !== 'system') continue;
			if (item.systemType !== 'shared_reminder_participation_changed' && item.systemType !== 'shared_reminder_updated') continue;

			const itemMetadata = item.metadata instanceof Map ? Object.fromEntries(item.metadata) : (item.metadata || {});
			const itemSharedKey = String(itemMetadata.sharedKey || '').trim();
			if (itemSharedKey !== sharedKey) continue;

			latestEvent = item;
			break;
		}

		if (!latestEvent) return;
		if (lastSharedOverviewRefreshTriggerRef.current === latestEvent._id) return;

		lastSharedOverviewRefreshTriggerRef.current = latestEvent._id;
		void loadSharedOverview(true);
	}, [convoMessages, isSharedReminderCancelled, loadSharedOverview, message.systemType, sharedKey]);

	const linkedReminder = useMemo(() => {
		if (reminderIdFromMeta) {
			const direct = reminders.find((item) => item._id === reminderIdFromMeta);
			if (direct) return direct;
		}

		if (!sharedKey) return null;
		return reminders.find((item) => item.sharedKey === sharedKey) || null;
	}, [reminders, reminderIdFromMeta, sharedKey]);

	const joinedParticipants = useMemo(
		() => (sharedOverview?.participants || []).filter((participant) => participant.participationStatus === 'joined'),
		[sharedOverview]
	);

	const filteredJoinedParticipants = useMemo(() => {
		const keyword = participantSearchTerm.trim().toLowerCase();
		if (!keyword) return joinedParticipants;

		return joinedParticipants.filter((participant) => {
			const displayName = participant.userId === currentUserId ? 'Bạn' : participant.displayName;
			return displayName.toLowerCase().includes(keyword) || participant.displayName.toLowerCase().includes(keyword);
		});
	}, [currentUserId, joinedParticipants, participantSearchTerm]);

	const isReminderCreationMessage = message.systemType === "reminder_created_local" || message.systemType === "shared_reminder_created";

	if (isReminderCreationMessage) {
		const isShared = message.systemType === 'shared_reminder_created';
		const reminderContent = String(
			(isShared ? (sharedOverview?.content || linkedReminder?.content) : linkedReminder?.content)
			|| metadata.reminderContent
			|| message.content
			|| 'Nhắc hẹn mới'
		).trim();
		const remindAt = String(
			(isShared ? (sharedOverview?.remindAt || linkedReminder?.remindAt) : linkedReminder?.remindAt)
			|| metadata.remindAt
			|| ''
		).trim();
		const creatorId = String(metadata.creatorId || message.senderId || '').trim();
		const reminderAnchorId = isShared
			? (sharedKey ? `shared-reminder-card-${sharedKey}` : '')
			: ((linkedReminder?._id || reminderIdFromMeta) ? `reminder-card-${linkedReminder?._id || reminderIdFromMeta}` : '');
		const isCancelled = isShared && (isSharedReminderCancelled || isSharedReminderUnavailable);
		const isPersonalReminderCancelled = !isShared && Boolean(reminderIdFromMeta) && removedReminderIds.includes(reminderIdFromMeta);
		const isReminderUnavailable = isShared ? isCancelled : isPersonalReminderCancelled;
		const isCreator = creatorId === currentUserId;
		const meParticipant = sharedOverview?.participants.find((item) => item.userId === currentUserId);
		const participationStatus = meParticipant?.participationStatus || linkedReminder?.participationStatus || 'joined';
		const joinedCount = sharedOverview?.joinedCount ?? Number(metadata.participantCount || 0);
		const participantCount = sharedOverview?.participantCount || Number(metadata.participantCount || 0) || 0;
		const canViewParticipants = isShared && !isCancelled && participantCount > 0;
		const canEditSharedAsCreator = isShared && isCreator && Boolean(linkedReminder?._id);
		const remindAtTimestamp = remindAt ? new Date(remindAt).getTime() : Number.NaN;
		const isPastByTime = Number.isFinite(remindAtTimestamp) && remindAtTimestamp <= Date.now();
		const isPastByStatus = linkedReminder?.status === 'triggered' || linkedReminder?.status === 'dismissed';
		const isEditableByStatus = linkedReminder?.status === 'pending' || linkedReminder?.status === 'snoozed';
		const canOpenReminderEdit = Boolean(linkedReminder?._id)
			&& !isPastByTime
			&& !isPastByStatus
			&& isEditableByStatus
			&& (!isShared || canEditSharedAsCreator);
		const targetDetailTab = (isPastByStatus || isPastByTime) ? 'past' : 'upcoming';

		const clock = remindAt
			? new Intl.DateTimeFormat('vi-VN', {
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'Asia/Ho_Chi_Minh',
			}).format(new Date(remindAt))
			: '';

		const dayLine = remindAt
			? new Intl.DateTimeFormat('vi-VN', {
				weekday: 'long',
				day: '2-digit',
				month: '2-digit',
				timeZone: 'Asia/Ho_Chi_Minh',
			}).format(new Date(remindAt))
			: '';

		const openReminder = () => {
			if (isReminderUnavailable) return;
			const focusId = String(linkedReminder?._id || reminderIdFromMeta || '').trim();

			if (focusId) {
				window.location.assign(`/reminder?tab=${targetDetailTab}&focus=${encodeURIComponent(focusId)}`);
				return;
			}

			if (sharedKey) {
				window.location.assign(`/reminder?tab=${targetDetailTab}&shared=${encodeURIComponent(sharedKey)}`);
				return;
			}

			window.location.assign(`/reminder?tab=${targetDetailTab}`);
		};

		const openReminderEdit = () => {
			if (isReminderUnavailable) return;
			if (!canOpenReminderEdit) return;

			if (!linkedReminder?._id) {
				toast.error('Không thể mở chỉnh sửa vì chưa tải được dữ liệu nhắc hẹn.');
				return;
			}

			setEditingReminder(linkedReminder);
		};

		const updateParticipation = async (participate: boolean) => {
			if (!sharedKey || isReminderUnavailable) return;
			try {
				setIsUpdatingParticipation(true);
				await updateSharedReminderParticipationAsync(sharedKey, participate);
				await loadSharedOverview(true);
				toast.success(participate ? 'Bạn đã tham gia nhắc hẹn chung.' : 'Bạn đã không tham gia nhắc hẹn chung.');
			} catch (error) {
				console.error('Update shared reminder participation failed:', error);
				toast.error('Không thể cập nhật trạng thái tham gia.');
			} finally {
				setIsUpdatingParticipation(false);
			}
		};

		return (
			<>
				<div className="my-4 flex w-full animate-in justify-center fade-in transition-all duration-300">
					<div className="flex max-w-[92%] items-center gap-2 rounded-lg border border-border/70 bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
						<p className="text-[13px] font-normal tracking-normal break-words">
							<span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 align-middle">
								{systemContent}
							</span>
						</p>
					</div>
				</div>

				<div className="my-2 mx-auto w-full max-w-[520px] space-y-2 animate-in fade-in duration-300">
					<div
						id={reminderAnchorId || undefined}
						data-shared-reminder-card={isShared && sharedKey ? sharedKey : undefined}
						data-reminder-card={!isShared && (linkedReminder?._id || reminderIdFromMeta) ? (linkedReminder?._id || reminderIdFromMeta) : undefined}
						className="w-full rounded-2xl border border-border/80 bg-card p-4 shadow-sm"
					>
						<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
							<BellPlus className="h-5 w-5" />
						</div>
						<p className="mt-3 line-clamp-2 whitespace-pre-wrap text-center text-base font-semibold text-foreground">{reminderContent}</p>
						{clock && (
							<p className="mt-1 inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
								<Clock className="h-4 w-4 text-muted-foreground" />
								{clock}{dayLine ? ` - ${dayLine}` : ''}
							</p>
						)}

						{isShared && (
							<div className="mt-3 space-y-2">
								<p className="text-center text-sm text-muted-foreground">
									{isCancelled
										? 'Nhắc hẹn này đã bị hủy bởi người tạo.'
										: isCreator
											? 'Nhắc hẹn này áp dụng cho toàn bộ thành viên trong cuộc trò chuyện.'
											: participationStatus === 'declined'
												? 'Bạn đang không tham gia nhắc hẹn này.'
												: 'Bạn đang tham gia nhắc hẹn này.'}
								</p>
								{canViewParticipants && (
									<div className="flex items-center justify-between gap-2">
										<p className="text-xs font-medium text-foreground">
											Đã tham gia: {joinedCount}/{participantCount}
										</p>
										<button
											type="button"
											onClick={() => {
												setIsParticipantDialogOpen(true);
												void loadSharedOverview();
											}}
											className="h-8 rounded-full border border-border bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
										>
											Xem người tham gia
										</button>
									</div>
								)}
							</div>
						)}

						{!isShared && isReminderUnavailable && (
							<p className="mt-2 text-center text-xs text-muted-foreground">
								Nhắc hẹn cá nhân này đã bị hủy.
							</p>
						)}

						<div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4">
							{isReminderUnavailable ? (
								<div className="w-full rounded-xl border border-border bg-muted/40 py-2 text-center text-sm font-medium text-muted-foreground">
									{isShared ? 'Nhắc hẹn đã bị hủy' : 'Nhắc hẹn cá nhân đã bị hủy'}
								</div>
							) : (
								<>
									{canOpenReminderEdit && (
										<button
											type="button"
											onClick={openReminderEdit}
											className="w-full rounded-xl border border-border bg-muted/50 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
										>
											Chỉnh sửa
										</button>
									)}

									{isShared && !isCreator && sharedKey && (
										participationStatus === 'declined' ? (
											<button
												type="button"
												disabled={isUpdatingParticipation}
												onClick={() => void updateParticipation(true)}
												className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
											>
												Tham gia lại
											</button>
										) : (
											<button
												type="button"
												disabled={isUpdatingParticipation}
												onClick={() => void updateParticipation(false)}
												className="w-full rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-60"
											>
												Không tham gia
											</button>
										)
									)}

									<button
										type="button"
										onClick={openReminder}
										className="w-full rounded-xl border border-border bg-muted py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
									>
										Xem chi tiết
									</button>
								</>
							)}
						</div>
					</div>
				</div>

				<Dialog open={isParticipantDialogOpen} onOpenChange={setIsParticipantDialogOpen}>
					<DialogContent className="max-w-[440px] p-0 overflow-hidden border border-border shadow-lg [&>button]:right-3 [&>button]:top-3">
						<DialogHeader className="px-4 py-3 border-b border-border bg-background">
							<DialogTitle className="pr-10 text-base font-semibold">Thành viên tham gia nhắc hẹn</DialogTitle>
							<p className="mt-1 text-xs text-muted-foreground">
								Thành viên tham gia: {joinedCount}
							</p>
						</DialogHeader>

						<div className="max-h-[420px] overflow-y-auto beautiful-scrollbar bg-background px-4 py-3">
							{isLoadingSharedOverview ? (
								<div className="rounded-md border border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">Đang tải danh sách...</div>
							) : joinedParticipants.length === 0 ? (
								<div className="rounded-md border border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">Chưa có thành viên tham gia.</div>
							) : (
								<div className="space-y-2">
									<div className="relative">
										<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
										<Input
											value={participantSearchTerm}
											onChange={(event) => setParticipantSearchTerm(event.target.value)}
											placeholder="Tìm theo tên thành viên"
											className="h-8 rounded-md pl-8 text-xs"
										/>
									</div>

									{filteredJoinedParticipants.length === 0 ? (
										<div className="rounded-md border border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
											Không tìm thấy thành viên phù hợp.
										</div>
									) : (
										<div className="space-y-1.5">
											{filteredJoinedParticipants.map((participant) => (
												<div key={participant.userId} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
													<UserAvatar
														type="seen"
														name={participant.userId === currentUserId ? 'Bạn' : participant.displayName}
														avatarUrl={participant.avatarUrl || undefined}
														className="size-8 ring-1 ring-border/40"
													/>
													<div className="min-w-0">
														<p className="truncate text-sm font-medium text-foreground">
															{participant.userId === currentUserId ? 'Bạn' : participant.displayName}
															{participant.isCreator && (
																<span className="ml-2 inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 align-middle">
																	Người tạo
																</span>
															)}
														</p>
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							)}
						</div>
					</DialogContent>
				</Dialog>

				<ReminderFormModal
					open={Boolean(editingReminder)}
					onOpenChange={(nextOpen) => {
						if (!nextOpen) {
							setEditingReminder(null);
						}
					}}
					mode="edit"
					editScope={
						editingReminder
							&& editingReminder.scope === 'shared'
							&& String(editingReminder.createdBy || '') !== String(currentUserId || '')
							? 'notifyOnly'
							: 'full'
					}
					reminder={editingReminder ?? undefined}
					onSuccess={() => {
						if (isShared) {
							void loadSharedOverview(true);
						}
					}}
				/>
			</>
		);
	}

	return (
		<div className="flex justify-center my-4 w-full animate-in fade-in transition-all duration-300 px-3">
			<div className="max-w-[95%] sm:max-w-[85%] text-center rounded-[20px] border border-border/70 bg-card/90 px-4 py-2 shadow-sm backdrop-blur-sm">
				<p className="text-[13px] font-normal leading-[1.6] break-words text-slate-600 dark:text-slate-300">
					{systemContent}
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
	const { onlineUsers } = useSocketStore();
	const isRecalled = message.isRecalled === true;
	const isPinned = message.isPinned === true;
	const isImage = message.type === "image" && !!(message.fileUrl || message.filePublicId) && !isRecalled;
	const isLink = message.type === "link" && !isRecalled;
	const isSticker = message.type === "sticker" && !isRecalled;
	const isDisbanded = selectedConvo.type === "group" && selectedConvo.disbanded === true;

	const cachedMediaUrl = useMediaCacheStore(state => state.cache[message._id]);
	const downloadUrl = message.fileUrl || cachedMediaUrl || "#";
	const isSenderOnline = actualSenderId ? onlineUsers.includes(actualSenderId.toString()) : false;

	// Automatically fetch signed URL for files and audio if not cached
	useEffect(() => {
		if ((message.type === "file" || message.type === "audio") && message.filePublicId && !message.fileUrl && !cachedMediaUrl) {
			const fetchUrl = async () => {
				try {
					const { url } = await chatService.getSignedMediaUrl(message._id);
					useMediaCacheStore.getState().setUrl(message._id, url);
				} catch (error) {
					console.error('Failed to fetch media url for file/audio:', message._id, error);
				}
			};
			fetchUrl();
		}
	}, [message._id, message.type, message.filePublicId, message.fileUrl, cachedMediaUrl]);

	const seenByOthers =
		selectedConvo.seenBy?.filter(
			(s: any) => (typeof s === "string" ? s : s._id?.toString()) !== currentUserId
		) ?? [];

	const { recallMessage, pinMessage, reactToMessage, createReminderSystemMessage } = useChatStore();
	const [showConfirmRecall, setShowConfirmRecall] = useState(false);
	const [showPinOptions, setShowPinOptions] = useState(false);
	const [showReactionModal, setShowReactionModal] = useState(false);
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);
	const [isReacting, setIsReacting] = useState(false);
	const [isCoarsePointer, setIsCoarsePointer] = useState(false);
	const [showTouchActions, setShowTouchActions] = useState(false);
	const [touchActionView, setTouchActionView] = useState<"menu" | "emoji">("menu");
	const [reminderTargetMessage, setReminderTargetMessage] = useState<{ messageId: string; messagePreview: string } | null>(null);
	const [showForwardModal, setShowForwardModal] = useState(false);
	const messageRootRef = useRef<HTMLDivElement | null>(null);
	const longPressTimeoutRef = useRef<number | null>(null);

	const clearLongPressTimer = useCallback(() => {
		if (longPressTimeoutRef.current !== null) {
			window.clearTimeout(longPressTimeoutRef.current);
			longPressTimeoutRef.current = null;
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const mediaQuery = window.matchMedia("(hover: none), (pointer: coarse)");
		const updateMode = () => setIsCoarsePointer(mediaQuery.matches);

		updateMode();
		mediaQuery.addEventListener("change", updateMode);

		return () => {
			mediaQuery.removeEventListener("change", updateMode);
		};
	}, []);

	useEffect(() => {
		if (!showTouchActions) return;
		// On coarse-pointer (touch) devices, the Dialog component handles its own
		// dismissal via the Radix overlay. Using a global pointerdown listener here
		// causes a race condition: pointerdown fires before onClick, closing the
		// dialog before the "emoji" view can be set.
		if (isCoarsePointer) return;

		const handleOutsidePointerDown = (event: PointerEvent) => {
			if (!messageRootRef.current) return;
			if (messageRootRef.current.contains(event.target as Node)) return;
			setShowTouchActions(false);
		};

		window.addEventListener("pointerdown", handleOutsidePointerDown);
		return () => {
			window.removeEventListener("pointerdown", handleOutsidePointerDown);
		};
	}, [showTouchActions, isCoarsePointer]);

	useEffect(() => {
		return () => {
			clearLongPressTimer();
		};
	}, [clearLongPressTimer]);

	const handlePointerDownForActions = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!isCoarsePointer) return;
		if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
		if (isRecalled || (message.status && message.status !== "sent") || isDisbanded) return;

		clearLongPressTimer();
		longPressTimeoutRef.current = window.setTimeout(() => {
			setShowTouchActions(true);
		}, 380);
	};

	const handlePointerEndForActions = () => {
		clearLongPressTimer();
	};

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
			setShowTouchActions(false);
		} catch (error) {
			console.error("Reaction failed:", error);
		} finally {
			setIsReacting(false);
		}
	};

	const handlePin = async () => {
		try { await pinMessage(message._id); }
		catch (e) { console.error("Ghim thất bại:", e); }
		finally {
			setShowPinOptions(false);
			setShowTouchActions(false);
		}
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
		finally {
			setShowConfirmRecall(false);
			setShowTouchActions(false);
		}
	};

	const canCreateReminder = !isDisbanded && !isRecalled && (message.type === "text" || message.type === "image");
	const shouldShowTouchActionControls = isCoarsePointer && showTouchActions;

	return (
		<>
			<div
				ref={messageRootRef}
				id={`msg-${message._id}`}
				className={cn(
					"group relative flex gap-2 mt-0.5 mx-2 px-1",
					isOwn ? "justify-end" : "justify-start"
				)}
				onPointerDown={handlePointerDownForActions}
				onPointerUp={handlePointerEndForActions}
				onPointerCancel={handlePointerEndForActions}
				onPointerLeave={handlePointerEndForActions}
				onContextMenu={(event) => {
					if (isCoarsePointer) {
						event.preventDefault();
					}
				}}
			>
				{!isOwn && (
					<div className="w-8 shrink-0 pt-0.5">
						{isGroupBreak && (
							<UserAvatar
								type="chat"
								name={participant?.userId.nickname ?? participant?.userId.displayName ?? "User"}
								avatarUrl={participant?.userId.avatarUrl ?? undefined}
								status={isSenderOnline ? "online" : "offline"}
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
								(isImage || isLink || isSticker) ? "p-0 bg-transparent border-0 shadow-none" : "px-2 py-1.5 text-sm",
								reactionSummary && !isImage && !isLink && !isSticker && "min-w-[85px]",
								isRecalled
									? "bg-muted text-muted-foreground border border-dashed border-border italic rounded-2xl"
									: isLink || isSticker
										? "bg-transparent border-0 shadow-none"
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
							{!isRecalled && message.metadata?.forwardedFrom && (
								<div className={cn("flex items-center gap-1 px-1 pt-1 pb-0 text-[11px] opacity-70 select-none", isOwn ? "text-blue-100 justify-end" : "text-muted-foreground justify-start")}>
									<Forward className="h-3 w-3 shrink-0" strokeWidth={2} />
									<span>Đã chuyển tiếp tin nhắn</span>
								</div>
							)}
							<div className="flex flex-col gap-0.5 w-fit">
								<div className="w-fit">
									<MessageContent message={message} isOwn={isOwn} downloadUrl={downloadUrl} participants={selectedConvo.participants} />
								</div>

								{!isImage && !isSticker && (
									<div className={cn(
										"flex items-center gap-1 select-none -mt-0.5 pb-1",
										isOwn ? "self-end" : "self-start",
										(isOwn && !isLink) ? "text-white/60" : "text-muted-foreground/60"
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
								"hidden sm:flex absolute top-1/2 -translate-y-1/2 transition-all duration-200 z-30",
								"opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto",
								isOwn ? "-left-10" : "-right-10"
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
										<PopoverContent
											className="w-[320px] max-w-[95vw] shadow-2xl rounded-2xl overflow-hidden p-0 border border-border/10 bg-background/95 backdrop-blur-sm relative z-[100] scale-[0.85] sm:scale-100 origin-bottom sm:origin-top"
											align={isOwn ? "end" : "start"}
											side="top"
											sideOffset={8}
										>
											<div className="flex w-full justify-center">
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
											</div>
										</PopoverContent>
									</Popover>
								</div>
							</div>
						)}


						{!isRecalled && (!message.status || message.status === "sent") && (
							<>
								{/* Desktop Dropdown */}
								<div className="hidden sm:block">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<button
												className={cn(
													"absolute top-1/2 -translate-y-1/2",
													isOwn ? "-left-18 sm:-left-19" : "-right-18 sm:-right-19",
													shouldShowTouchActionControls ? "opacity-100" : "opacity-0 group-hover:opacity-70 hover:opacity-100",
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

										<DropdownMenuContent align={isOwn ? "end" : "start"} className="w-46">
											{!isDisbanded && (
												<DropdownMenuItem onClick={() => { setShowTouchActions(false); onReply?.(message); }}>
													<Reply className="w-4 h-4 mr-2" strokeWidth={1.6} />
													Trả lời
												</DropdownMenuItem>
											)}
											{!isRecalled && (
												<DropdownMenuItem onClick={() => { setShowTouchActions(false); setShowForwardModal(true); }}>
													<Forward className="w-4 h-4 mr-2" strokeWidth={1.6} />
													Chuyển tiếp
												</DropdownMenuItem>
											)}
											{message.content && message.type !== 'sticker' && (
												<DropdownMenuItem onClick={() => { setShowTouchActions(false); handleCopy(); }}>
													<Copy className="w-4 h-4 mr-2" strokeWidth={1.6} />
													Sao chép
												</DropdownMenuItem>
											)}
											{(message.fileUrl || message.filePublicId) && (
												<DropdownMenuItem asChild>
													<a href={downloadUrl} download={message.fileName ?? true} target="_blank" rel="noopener noreferrer" className="flex items-center" onClick={() => setShowTouchActions(false)}>
														<Download className="w-4 h-4 mr-2" strokeWidth={1.6} />
														Tải xuống
													</a>
												</DropdownMenuItem>
											)}
											{!isDisbanded && (
												<DropdownMenuItem onClick={() => { setShowTouchActions(false); setShowPinOptions(true); }}>
													{isPinned ? (
														<PinOff className="w-4 h-4 mr-2" strokeWidth={1.6} />
													) : (
														<Pin className="w-4 h-4 mr-2" strokeWidth={1.6} />
													)}
													{isPinned ? "Bỏ ghim tin nhắn" : "Ghim tin nhắn"}
												</DropdownMenuItem>
											)}
											{canCreateReminder && (
												<DropdownMenuItem
													onClick={() => {
														setShowTouchActions(false);
														setReminderTargetMessage({
															messageId: message._id,
															messagePreview: message.type === "image" ? "[Hình ảnh]" : (message.content ?? "Tin nhắn"),
														});
													}}
												>
													<BellPlus className="w-4 h-4 mr-2" strokeWidth={1.6} />
													Tạo nhắc hẹn
												</DropdownMenuItem>
											)}
											{isOwn && !isDisbanded && (
												<DropdownMenuItem
													className="text-destructive focus:text-destructive focus:bg-destructive/10"
													onClick={() => { setShowTouchActions(false); setShowConfirmRecall(true); }}
												>
													<Undo2 className="w-4 h-4 mr-2" strokeWidth={1.6} />
													Thu hồi
												</DropdownMenuItem>
											)}
										</DropdownMenuContent>
									</DropdownMenu>
								</div>

								{/* Mobile Touch Action Dialog — Menu */}
								{isCoarsePointer && (
									<>
										<Dialog open={showTouchActions && touchActionView === "menu"} onOpenChange={(open) => {
											if (!open) setShowTouchActions(false);
										}}>
											<DialogContent
												className="w-[92vw] max-w-[380px] rounded-[24px] shadow-2xl bg-background/95 backdrop-blur-xl border-border/10 p-5 pt-6 gap-5"
												showCloseButton={false}
											>
												<DialogTitle className="sr-only">Thao tác tin nhắn</DialogTitle>
												<div className="grid grid-cols-4 sm:grid-cols-5 gap-y-6 gap-x-1">
													<button onClick={() => setTouchActionView("emoji")} className="flex flex-col items-center gap-2">
														<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
															<Smile className="h-5 w-5" strokeWidth={1.5} />
														</div>
														<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Cảm xúc</span>
													</button>

													{!isDisbanded && (
														<button onClick={() => { setShowTouchActions(false); onReply?.(message); }} className="flex flex-col items-center gap-2">
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
																<Reply className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Trả lời</span>
														</button>
													)}

													{!isRecalled && (
														<button onClick={() => { setShowTouchActions(false); setShowForwardModal(true); }} className="flex flex-col items-center gap-2">
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
																<Forward className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Chuyển tiếp</span>
														</button>
													)}

													{message.content && message.type !== 'sticker' && (
														<button onClick={() => { setShowTouchActions(false); handleCopy(); }} className="flex flex-col items-center gap-2">
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
																<Copy className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Sao chép</span>
														</button>
													)}

													{(message.fileUrl || message.filePublicId) && (
														<a href={downloadUrl} download={message.fileName ?? true} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2" onClick={() => setShowTouchActions(false)}>
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
																<Download className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Tải xuống</span>
														</a>
													)}

													{!isDisbanded && (
														<button onClick={() => { setShowTouchActions(false); setShowPinOptions(true); }} className="flex flex-col items-center gap-2">
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
																{isPinned ? <PinOff className="h-5 w-5" strokeWidth={1.5} /> : <Pin className="h-5 w-5" strokeWidth={1.5} />}
															</div>
															<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">{isPinned ? "Bỏ ghim" : "Ghim"}</span>
														</button>
													)}

													{canCreateReminder && (
														<button
															onClick={() => {
																setShowTouchActions(false);
																setReminderTargetMessage({ messageId: message._id, messagePreview: message.type === "image" ? "[Hình ảnh]" : (message.content ?? "Tin nhắn") });
															}}
															className="flex flex-col items-center gap-2"
														>
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
																<BellPlus className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap overflow-visible">Nhắc hẹn</span>
														</button>
													)}

													{isOwn && !isDisbanded && (
														<button onClick={() => { setShowTouchActions(false); setShowConfirmRecall(true); }} className="flex flex-col items-center gap-2">
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-500 shadow-sm hover:bg-red-200 dark:hover:bg-red-500/20 transition-colors">
																<Undo2 className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-red-600 dark:text-red-500 whitespace-nowrap">Thu hồi</span>
														</button>
													)}
												</div>
											</DialogContent>
										</Dialog>

										{/* Emoji Picker — separate Dialog to avoid padding clipping */}
										<Dialog open={showTouchActions && touchActionView === "emoji"} onOpenChange={(open) => {
											if (!open) {
												setTouchActionView("menu");
												setShowTouchActions(false);
											}
										}}>
											<DialogContent
												className="w-[92vw] max-w-[380px] rounded-[24px] shadow-2xl bg-background overflow-hidden p-0 gap-0 border-border/10"
												showCloseButton={false}
											>
												<DialogTitle className="sr-only">Chọn cảm xúc</DialogTitle>
												<div className="flex items-center gap-2 px-4 pt-4 pb-2">
													<button
														onClick={() => setTouchActionView("menu")}
														className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
													>
														<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
															<path d="M15 18l-6-6 6-6" />
														</svg>
													</button>
													<span className="text-sm font-semibold text-foreground">Chọn cảm xúc</span>
												</div>
												<div className="w-full">
													<Picker
														data={data}
														onEmojiSelect={(emoji: any) => {
															handleEmojiSelect(emoji);
															setShowTouchActions(false);
														}}
														theme="light"
														set="native"
														autoFocus={false}
														skinTonePosition="none"
														previewPosition="none"
														style={{ width: "100%" }}
													/>
												</div>
											</DialogContent>
										</Dialog>
									</>
								)}
							</>
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

			{reminderTargetMessage && (
				<ReminderQuickModal
					conversationId={message.conversationId}
					messageId={reminderTargetMessage.messageId}
					messagePreview={reminderTargetMessage.messagePreview}
					onClose={() => setReminderTargetMessage(null)}
					onCreated={(createdReminder) => {
						if (createdReminder.scope !== 'personal') return;

						void createReminderSystemMessage(message.conversationId, createdReminder).catch(() => {
							toast.error('Không thể đồng bộ tin nhắn nhắc hẹn cá nhân');
						});
					}}
				/>
			)}

			{showForwardModal && (
				<ForwardMessageModal
					open={showForwardModal}
					onOpenChange={(open) => setShowForwardModal(open)}
					message={message}
				/>
			)}
		</>
	);
};

export default MessageItem;
