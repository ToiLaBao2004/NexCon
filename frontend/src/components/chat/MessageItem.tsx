import { cn, formatMessageTime, formatBytes, normalizeUrl } from "@/lib/utils";
import type { Conversation, Mention, Message, MessageType, Participant, ReplyToMessage } from "@/types/chat";
import type { ProfileVisibility } from "@/types/user";
import UserAvatar from "./UserAvatar";
import FileTypeIcon from "./FileTypeIcon";
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
import { useState, useMemo, useEffect, useCallback, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import SecureImage from "../SecureImage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import useMediaCacheStore from "@/stores/useMediaCacheStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { chatService } from "@/services/chatService";
import { reminderService } from "@/services/reminderService";
import { FileText, Link2, ExternalLink, Clock, BellPlus, AlertCircle, Pin, PinOff, Undo2, Reply, ImageIcon, Smile, Copy, Download, Search, Forward, Mic, Play, Pause, Captions, Check, CheckCheck, Flag, ShieldAlert, Scale, Loader2 } from "lucide-react";
import { StickerIcon } from "@/components/shared/StickerIcon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSocketStore } from "@/stores/useSocketStore";
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import ReactionDetailModal from "./ReactionDetailModal";
import { useImageViewerStore } from "@/stores/useImageViewerStore";
import { useThemeStore } from "@/stores/useThemeStore";
import ReminderQuickModal from "@/components/reminder/ReminderQuickModal";
import ReminderFormModal from "@/components/reminder/ReminderFormModal";
import type { Reminder, SharedReminderOverviewResponse } from "@/types/reminder";
import { getPresenceBadgeStatus, getPresenceForUser } from "@/utils/userPresence";
import ForwardMessageModal from "./ForwardMessageModal";
import { DetailDialog } from "./ConversationRemindersPanel";
import { ReportDialog } from "@/components/shared/ReportDialog";
import { UserProfileDialog } from "@/components/shared/UserProfileDialog";
import CachedStickerImage from "./CachedStickerImage";
import { decodeMentionTokens, getMentionTextSegments } from "@/utils/mentions";
import { decodeMojibakeFileName } from "@/lib/fileName";
import { ExpiredMessagePlaceholder } from "./ExpiredMessagePlaceholder";
import { SystemMessageBubble } from "./SystemMessageBubble";
import { SystemMessagePill } from "./SystemMessagePill";

const sharedReminderOverviewCache = new Map<string, SharedReminderOverviewResponse>();

/* ── Custom audio player for voice messages ─────────────────────────────────── */
const AUDIO_BAR_COUNT = 32;
const MAX_VISIBLE_SEEN_AVATARS = 8;
const MESSAGE_APPEAL_MIN_REASON_LENGTH = 10;
const singleImageFrameClass = "relative inline-flex max-w-[70vw] overflow-hidden rounded-xl bg-muted sm:max-w-[360px]";
const imagePreviewClass = "block h-auto w-auto max-h-[420px] max-w-[70vw] object-contain cursor-zoom-in hover:opacity-90 transition-opacity sm:max-w-[360px]";

const messageAppealLabels = {
	pending: "Đang chờ xử lý",
	approved: "Đã chấp nhận",
	rejected: "Đã từ chối",
} as const;

function isAiRejectedMessage(message: Message) {
	const metadata = message.metadata || {};
	return Boolean(
		message.reportStatus === true
		&& (
			metadata.moderationStatus === "rejected"
			|| metadata.imageModerationStatus === "rejected"
		)
	);
}

function MentionChip({
	children,
	isOwn,
	onClick,
}: {
	children: React.ReactNode;
	isOwn: boolean;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			onClick={(event) => {
				event.stopPropagation();
				onClick?.();
			}}
			className={cn(
				"inline cursor-pointer border-0 bg-transparent p-0 font-semibold align-baseline transition-opacity hover:opacity-70",
				isOwn
					? "text-white"
					: "text-blue-700 dark:text-blue-300"
			)}
		>
			{children}
		</button>
	);
}

function renderMentionedText(
	text: string,
	mentions: Mention[] | undefined,
	isOwn: boolean,
	participants: Participant[],
	onMentionClick?: (userId: string) => void,
) {
	const parts = getMentionTextSegments(text, mentions, participants).map((segment, index) => {
		if (segment.type === "mention") {
			return (
				<MentionChip
					key={`mention-${segment.userId}-${index}`}
					isOwn={isOwn}
					onClick={() => onMentionClick?.(segment.userId)}
				>
					{segment.text}
				</MentionChip>
			);
		}

		return <span key={`text-${index}`}>{segment.text}</span>;
	});

	return <span className="text-[14px] whitespace-pre-wrap break-words sm:text-[15px]">{parts}</span>;
}

const getMentionSafeText = (
	text: string | null | undefined,
	participants: Participant[],
	mentions?: Mention[],
) => decodeMentionTokens(text ?? "", participants, mentions);

const truncatePreviewText = (text: string, maxLength: number) =>
	text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;

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
				<span className={cn("text-[12px] sm:text-[13px] tabular-nums font-mono leading-none", isOwn ? "text-white/60" : "text-muted-foreground")}>
					{(progress > 0 || isPlaying) ? fmt(currentTime) : fmt(duration)}
				</span>
			</div>
		</div>
	);
}

function AudioMessageBubble({
	message,
	isOwn,
	downloadUrl,
	participants,
	onMentionClick,
}: {
	message: Message;
	isOwn: boolean;
	downloadUrl: string;
	participants: Participant[];
	onMentionClick?: (userId: string) => void;
}) {
	const [showTranscript, setShowTranscript] = useState(false);
	const hasTranscript = Boolean(message.content?.trim());

	useEffect(() => {
		setShowTranscript(false);
	}, [message._id]);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<AudioPlayer src={downloadUrl} isOwn={isOwn} />

				{hasTranscript && (
					<button
						type="button"
						onClick={() => setShowTranscript((current) => !current)}
						className={cn(
							"shrink-0 size-7 rounded-full border text-[12px] sm:text-[13px] font-bold",
							"flex items-center justify-center transition-all",
							showTranscript && "scale-105",
							isOwn
								? cn(
									"border-white/25 text-white",
									showTranscript
										? "bg-white/30 shadow-sm"
										: "bg-white/15 hover:bg-white/25"
								)
								: cn(
									"border-border text-foreground",
									showTranscript
										? "bg-primary text-primary-foreground shadow-sm"
										: "bg-background hover:bg-muted"
								)
						)}
						title={showTranscript ? "Ẩn nội dung thoại" : "Hiện nội dung thoại"}
					>
						<Captions className="size-3.5" />
					</button>
				)}
			</div>

			{hasTranscript && showTranscript && (
				<div
					className={cn(
						"max-w-[340px] rounded-xl px-4 py-3 text-base leading-relaxed sm:text-[17px]",
						"whitespace-pre-wrap break-words animate-in fade-in slide-in-from-top-1 duration-150",
						isOwn
							? "bg-white/12 text-white border border-white/10"
							: "bg-muted/70 text-foreground border border-border/60"
					)}
				>
					{renderMentionedText(
						message.content ?? "",
						message.mentions,
						isOwn,
						participants,
						onMentionClick
					)}
				</div>
			)}
		</div>
	);
}

interface MessageItemProps {
	message: Message;
	index: number;
	messages: Message[];
	selectedConvo: Conversation;
	currentUserId: string;
	isLastMyMessage?: boolean;
	imageBatchItems?: Message[];
	onReply?: (message: Message) => void;
}

function ImageBatchGrid({
	items,
	isOwn,
	participants,
	conversationId,
	onMentionClick,
}: {
	items: Message[];
	isOwn: boolean;
	participants: Participant[];
	conversationId: string;
	onMentionClick?: (userId: string) => void;
}) {
	const visibleItems = items.slice(0, 10);
	const count = visibleItems.length;
	const contentItem = items.find((item) =>
		item.isRecalled !== true
		&& item.reportStatus !== true
		&& item.content?.trim()
	);

	const tileClassName = (index: number) => cn(
		"relative overflow-hidden bg-muted",
		count === 1 ? "max-w-[240px] max-h-[300px]" : "h-[118px] w-[118px] sm:h-[132px] sm:w-[132px]",
		count === 3 && index === 0 && "row-span-2 h-[240px] sm:h-[268px]",
		count >= 4 && "h-[112px] w-[112px] sm:h-[126px] sm:w-[126px]"
	);

	const renderImage = (item: Message) => {
		if (item.reportStatus) {
			return (
				<div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-destructive/10 text-destructive">
					<ShieldAlert className="size-7" strokeWidth={1.7} />
					<span className="px-2 text-center text-[13px] sm:text-[14px] font-semibold">Tin nhắn vi phạm tiêu chuẩn cộng đồng</span>
				</div>
			);
		}

		if (item.isRecalled) {
			return (
				<div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-slate-200/80 text-slate-400 dark:bg-slate-800/70 dark:text-slate-500">
					<ImageIcon className="size-7" strokeWidth={1.7} />
					<span className="text-sm font-semibold">Đã thu hồi</span>
				</div>
			);
		}

		if (item.filePublicId) {
			return (
				<SecureImage
					messageId={item._id}
					alt={item.fileName ?? "image"}
					className="h-full w-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
				/>
			);
		}

		return (
			<img
				src={item.fileUrl ?? ""}
				alt={item.fileName ?? "image"}
				className="h-full w-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
			/>
		);
	};

	return (
		<div className="flex flex-col gap-1.5">
			<div
				className={cn(
					"grid gap-1 overflow-hidden rounded-2xl bg-background/60 dark:bg-black/20",
					count === 1 ? "grid-cols-1" : "grid-cols-2"
				)}
			>
				{visibleItems.map((item, index) => (
					<button
						key={item.clientTempId || item._id}
						type="button"
						className={tileClassName(index)}
						disabled={item.isRecalled === true || item.reportStatus === true}
						onClick={() => {
							if (item.isRecalled || item.reportStatus) return;
							useImageViewerStore.getState().openViewer(
								item.filePublicId
									? { messageId: item._id, conversationId, message: item, alt: item.fileName ?? "image" }
									: { messageId: item._id, src: item.fileUrl!, conversationId, message: item, alt: item.fileName ?? "image" }
							);
						}}
					>
						{renderImage(item)}
						{isOwn && !item.isRecalled && !item.reportStatus && (
							<span className="absolute bottom-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/55 text-white shadow-sm">
								{item.status === "sending" ? (
									<Clock className="size-3 animate-spin" />
								) : item.status === "error" ? (
									<AlertCircle className="size-3 text-red-200" />
								) : (
									<Check className="size-3.5" strokeWidth={2.5} />
								)}
							</span>
						)}
					</button>
				))}
			</div>
			{contentItem?.content && (
				<p className="px-2 text-[14px] leading-relaxed sm:text-[15px]">
					{renderMentionedText(contentItem.content, contentItem.mentions, isOwn, participants, onMentionClick)}
				</p>
			)}
		</div>
	);
}

function MessageContent({ message, isOwn, downloadUrl, participants, imageBatchItems, onMentionClick }: { message: Message; isOwn: boolean; downloadUrl: string; participants: Participant[]; imageBatchItems?: Message[]; onMentionClick?: (userId: string) => void }) {
	const type: MessageType = message.type ?? "text";

	if (imageBatchItems && imageBatchItems.length > 1) {
		return <ImageBatchGrid items={imageBatchItems} isOwn={isOwn} participants={participants} conversationId={message.conversationId} onMentionClick={onMentionClick} />;
	}

	if (message.reportStatus) {
		return (
			<span className="inline-flex items-center gap-2 text-sm font-medium text-destructive">
				<ShieldAlert className="size-4" />
				Tin nhắn vi phạm tiêu chuẩn cộng đồng
			</span>
		);
	}

	if (message.isRecalled) {
		return (
			<span className="italic text-muted-foreground">
				{isOwn ? "Bạn đã thu hồi một tin nhắn" : "Tin nhắn đã được thu hồi"}
			</span>
		);
	}

	if (type === "image" && (message.filePublicId || message.fileUrl)) {
		const uploadProgress = typeof message.progress === "number" ? Math.min(100, Math.max(0, Math.round(message.progress))) : null;
		const errorBadge = isOwn && message.status === "error" ? (
			<span className="absolute bottom-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/55 text-white shadow-sm">
				<AlertCircle className="size-3 text-red-200" />
			</span>
		) : null;
		const uploadOverlay = isOwn && message.status === "sending" ? (
			<span className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/45 px-4 text-white backdrop-blur-[1px]">
				<span className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
					<span
						className="block h-full rounded-full bg-white transition-all"
						style={{ width: `${uploadProgress ?? 15}%` }}
					/>
				</span>
				<span className="text-xs font-semibold">{uploadProgress ?? 0}%</span>
			</span>
		) : null;

		return (
			<div className="flex flex-col gap-1.5">
				{message.filePublicId ? (
					<button
						type="button"
						className={cn(singleImageFrameClass, "border-0 p-0 cursor-zoom-in")}
						onClick={() =>
							useImageViewerStore.getState().openViewer({
								messageId: message._id,
								conversationId: message.conversationId,
								message,
								alt: message.fileName ?? "image",
							})
						}
					>
						<SecureImage
							messageId={message._id}
							alt={message.fileName ?? "image"}
							className={imagePreviewClass}
						/>
						{uploadOverlay}
						{errorBadge}
					</button>
				) : (
					<button
						type="button"
						className={cn(singleImageFrameClass, "border-0 p-0 cursor-zoom-in")}
						onClick={() =>
							useImageViewerStore.getState().openViewer({
								messageId: message._id,
								src: message.fileUrl!,
								conversationId: message.conversationId,
								message,
								alt: message.fileName ?? "image",
							})
						}
					>
						<img
							src={message.fileUrl!}
							alt={message.fileName ?? "image"}
							className={imagePreviewClass}
						/>
						{uploadOverlay}
						{errorBadge}
					</button>
				)}
				{message.content && (
					<p className="px-2 text-[14px] leading-relaxed sm:text-[15px]">
						{renderMentionedText(message.content, message.mentions, isOwn, participants, onMentionClick)}
					</p>
				)}
			</div>
		);
	}

	if (type === "sticker" && message.content) {
		return (
			<div className="group/sticker relative">
				<div className="relative transition-all duration-300 group-hover/sticker:scale-110 drop-shadow-sm group-hover/sticker:drop-shadow-md">
					<CachedStickerImage
						src={message.content}
						alt="sticker"
						className="w-32 h-32 sm:w-40 sm:h-40 object-contain animate-in zoom-in-50 duration-300"
						loading="lazy"
					/>
					{isOwn && message.status === "sending" && (
						<span className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/55 text-white shadow-sm">
							<Clock className="size-3.5 animate-spin" />
						</span>
					)}
				</div>
			</div>
		);
	}

	if (type === "audio" && (message.filePublicId || message.fileUrl)) {
		return (
			<AudioMessageBubble
				message={message}
				isOwn={isOwn}
				downloadUrl={downloadUrl}
				participants={participants}
				onMentionClick={onMentionClick}
			/>
		);
	}

	if (type === "file" && (message.filePublicId || message.fileUrl)) {
		const displayFileName = decodeMojibakeFileName(message.fileName) || "File";

		return (
			<div className="flex flex-col gap-2">
				<a
					href={downloadUrl}
					target="_blank"
					rel="noopener noreferrer"
					onClick={async (event) => {
						if (!message.filePublicId) return;
						event.preventDefault();

						try {
							let url = useMediaCacheStore.getState().getUrl(message._id);
							if (!url) {
								const response = await chatService.getSignedMediaUrl(message._id);
								url = response.url;
								useMediaCacheStore.getState().setUrl(message._id, url);
							}
							window.open(url, "_blank", "noopener,noreferrer");
						} catch {
							toast.error("Không thể mở file");
						}
					}}
					className={cn(
						"flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group/file",
						isOwn
							? "bg-white/12 border border-white/10 hover:bg-white/18"
							: "bg-background/50 dark:bg-black/20 border border-border/40 hover:bg-background/80 dark:hover:bg-black/30"
					)}
					download={displayFileName}
				>
					<div className={cn("flex size-10 items-center justify-center rounded-lg shrink-0", isOwn ? "bg-white/20" : "bg-primary/10")}>
						<FileTypeIcon fileName={displayFileName} mimeType={message.mimeType} className="size-8" />
					</div>
					<div className="flex flex-col min-w-0">
						<span className="max-w-[180px] truncate text-[14px] font-medium sm:text-[15px]">{displayFileName}</span>
						<span className={cn("text-[12px] sm:text-[13px]", isOwn ? "text-white/70" : "text-muted-foreground")}>
							{message.fileSize ? formatBytes(message.fileSize) : (message.mimeType ?? "")}
						</span>
					</div>
					<ExternalLink className={cn("size-3.5 shrink-0 ml-1 opacity-0 group-hover/file:opacity-70 transition-opacity", isOwn ? "text-white" : "text-muted-foreground")} />
				</a>
				{message.content && (
					<div className="px-2 text-[14px] leading-relaxed whitespace-pre-wrap break-words sm:text-[15px]">
						{renderMentionedText(message.content, message.mentions, isOwn, participants, onMentionClick)}
					</div>
				)}
			</div>
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
						"block max-w-[360px] overflow-hidden rounded-2xl border transition hover:opacity-95",
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
						<div className="mb-1 flex items-center gap-1.5 text-[12px] sm:text-[13px] text-muted-foreground">
							<Link2 className="size-3.5 shrink-0" />
							<span className="truncate">{preview.siteName || hostname}</span>
						</div>

						{preview.title && (
							<div className="line-clamp-2 text-[14px] font-semibold sm:text-[15px]">
								{preview.title}
							</div>
						)}

						{preview.description && (
							<div className="mt-1 line-clamp-2 text-[12px] sm:text-[13px] text-muted-foreground">
								{preview.description}
							</div>
						)}

						<div className="mt-2 text-[12px] sm:text-[13px] break-all text-muted-foreground/80">
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
					isOwn ? "decoration-emerald-500/60" : "decoration-primary/40 text-primary dark:text-blue-400"
				)}
			>
				<Link2 className="size-3.5 shrink-0" />
				<span className="break-all text-[14px] sm:text-[15px]">{message.content}</span>
			</a>
		);
	}

	return renderMentionedText(message.content ?? "", message.mentions, isOwn, participants, onMentionClick);
}

// Reply quote (rendered inside the Card bubble) 
function ReplyQuoteInline({
	replyTo,
	isOwn,
	participants,
	currentUserId,
	conversationId,
	messages,
}: {
	replyTo: ReplyToMessage;
	isOwn: boolean;
	participants: Participant[];
	currentUserId: string;
	conversationId: string;
	messages: Message[];
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

	const replyImageBatch = useMemo(() => {
		if (replyTo.type !== "image") return [];

		const canPreview = (message: ReplyToMessage | Message) =>
			message.type === "image"
			&& message.isRecalled !== true
			&& message.reportStatus !== true
			&& Boolean(message.filePublicId || message.fileUrl);
		const fallback = canPreview(replyTo) ? [replyTo] : [];
		const batchId = replyTo.metadata?.clientBatchId?.trim();
		if (!batchId) return fallback;

		const batchItems = messages
			.filter((message) =>
				message.metadata?.clientBatchId === batchId
				&& canPreview(message)
			)
			.sort((a, b) =>
				Number(a.metadata?.clientBatchIndex ?? 0) - Number(b.metadata?.clientBatchIndex ?? 0)
			);

		return batchItems.length > 0 ? batchItems : fallback;
	}, [messages, replyTo]);
	const visibleReplyImages = replyImageBatch.slice(0, 3);
	const hiddenReplyImageCount = Math.max(0, replyImageBatch.length - visibleReplyImages.length);

	let preview: React.ReactNode;
	if (replyTo.reportStatus && visibleReplyImages.length === 0) {
		preview = <span className="italic">Tin nhắn vi phạm tiêu chuẩn cộng đồng</span>;
	} else if (replyTo.isRecalled) {
		preview = <span className="italic">Tin nhắn đã thu hồi</span>;
	} else if (replyTo.type === "image") {
		preview = (
			<span className="flex items-center gap-2">
				{visibleReplyImages.length > 0 && (
					<span className="flex shrink-0 items-center gap-1">
						{visibleReplyImages.map((image) => (
							image.filePublicId ? (
								<SecureImage
									key={image._id}
									messageId={image._id}
									alt="reply-thumbnail"
									className="size-6 rounded-md object-cover border border-blue-200 dark:border-blue-400"
									fallbackMinSize={24}
									showFallbackText={false}
								/>
							) : (
								<img
									key={image._id}
									src={image.fileUrl!}
									alt="reply-thumbnail"
									className="size-6 rounded-md object-cover border border-blue-200 dark:border-blue-400"
								/>
							)
						))}
						{hiddenReplyImageCount > 0 && (
							<span className="flex size-6 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-[10px] font-semibold text-blue-600 dark:border-blue-400/70 dark:bg-blue-950/50 dark:text-blue-300">
								+{hiddenReplyImageCount}
							</span>
						)}
					</span>
				)}
				<span className="flex items-center gap-1">
					<ImageIcon className="size-3 shrink-0" /> Hình ảnh
				</span>
			</span>
		);
	} else if (replyTo.type === "sticker") {
		preview = (
			<span className="flex items-center gap-2">
				{replyTo.content && (
					<CachedStickerImage
						src={replyTo.content}
						alt="reply-sticker-thumbnail"
						className="size-6 rounded-md object-contain bg-white/10 border border-blue-200 dark:border-blue-400"
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
				<FileText className="size-3 shrink-0" /> {decodeMojibakeFileName(replyTo.fileName) || "Tệp đính kèm"}
			</span>
		);
	} else if (replyTo.type === "link") {
		const linkText = getMentionSafeText(replyTo.content ?? "Liên kết", participants, replyTo.mentions) || "Liên kết";
		preview = (
			<span className="flex items-center gap-1">
				<Link2 className="size-3 shrink-0" /> {linkText}
			</span>
		);
	} else {
		const text = getMentionSafeText(replyTo.content, participants, replyTo.mentions);
		preview = truncatePreviewText(text, 80);
	}

	return (
		<div
			className={cn(
				"mb-1 w-fit max-w-full min-w-0 self-start cursor-pointer rounded-xl border px-2 py-1.5 shadow-sm transition-colors",
				isOwn
					? "border-white/25 bg-white/20 text-white/90 hover:bg-white/25 dark:border-white/20 dark:bg-white/15 dark:hover:bg-white/20"
					: "border-slate-200/80 bg-slate-100/75 text-slate-900 hover:bg-slate-100 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-50 dark:hover:bg-slate-900/75",
			)}
			onClick={async (e) => {
				e.stopPropagation();
				const el = document.getElementById(`message-${replyTo._id}`)
					?? Array.from(document.querySelectorAll<HTMLElement>("[data-message-ids]"))
						.find((element) => element.dataset.messageIds?.split(" ").includes(replyTo._id));
				if (el) {
					el.scrollIntoView({ behavior: "smooth", block: "center" });
					el.classList.add("animate-jump-highlight");
					setTimeout(() => el.classList.remove("animate-jump-highlight"), 3000);
				} else {
					// Message not in DOM, use store jump functionality
					await useChatStore.getState().jumpToMessage(conversationId, replyTo._id);
				}
			}}
		>
			<div className="flex min-w-0 max-w-[240px] gap-1.5">
				<span
					className={cn(
						"mt-0.5 w-[3px] self-stretch rounded-full",
						isOwn ? "bg-emerald-200/80 dark:bg-emerald-300/75" : "bg-blue-500"
					)}
				/>
				<div className="min-w-0 flex-1">
					{senderName && (
						<span
							className={cn(
								"block truncate text-[12px] font-semibold leading-tight",
								isOwn ? "text-white/90" : "text-slate-900 dark:text-slate-50"
							)}
						>
							{senderName}
						</span>
					)}
					<span
						className={cn(
							"mt-0.5 block truncate text-[11.5px] leading-tight sm:text-[12px]",
							isOwn ? "text-white/65" : "text-slate-600 dark:text-slate-300"
						)}
					>
						{preview}
					</span>
				</div>
			</div>
		</div>
	);
}

import { getSystemMessageText } from "@/utils/chatUtils";

// ── Detect date/time hints in Vietnamese text ─────────────────────────────────
// NOTE: Avoid Unicode lookbehind (unsupported in some JS engines).
const DATE_TIME_PATTERNS: RegExp[] = [
	// Multi-word relative phrases
	/(ngày mai|ngày kia|ngày mốt|tuần tới|tuần sau|tháng tới|tháng sau|năm tới|năm sau|cuối tuần|đầu tuần|cuối tháng|đầu tháng|hôm nay|chiều nay|sáng nay|tối nay|đêm nay|trưa nay)/i,
	// "mai" / "mốt" surrounded by whitespace, punctuation, or string boundaries
	/(^|[\s,.:;!?([\-\u2013])mai($|[\s,.:;!?)[\]\u2013\-])/i,
	/(^|[\s,.:;!?([\-\u2013])mốt($|[\s,.:;!?)[\]\u2013\-])/i,
	// Explicit date formats: dd/mm/yyyy, dd/mm/yy, dd-mm-yyyy
	/\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?/,
	// "ngày X tháng Y" or "X tháng Y năm Z"
	/(ngày\s*)?\d{1,2}\s*tháng\s*\d{1,2}(\s*(năm\s*)?\d{2,4})?/i,
	// Weekday references
	/(thứ\s*(hai|ba|tư|năm|sáu|bảy)|chủ\s*nhật)/i,
	// Time expressions: "X giờ", "X:XX giờ", "lúc X"
	/\d{1,2}(:\d{2})?\s*(giờ|\bh\b)/i,
	/lúc\s+\d{1,2}/i,
	// "X ngày/tuần/tháng nữa"
	/\d+\s*(ngày|tuần|tháng|giờ|phút)\s*(nữa|sau)/i,
];

function detectDateTimeInText(text: string): boolean {
	if (!text) return false;
	try {
		return DATE_TIME_PATTERNS.some((pattern) => pattern.test(text));
	} catch {
		return false;
	}
}

// ── Quick reminder button shown below a message bubble ────────────────────────
function SmartReminderButton({
	isOwn,
	onOpen,
	disabled = false,
}: {
	message: Message;
	isOwn: boolean;
	onOpen: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				if (!disabled) onOpen();
			}}
			disabled={disabled}
			className={cn(
				"mt-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium border",
				"transition-all duration-150 animate-in fade-in slide-in-from-top-1",
				"select-none",
				disabled 
					? "opacity-50 grayscale cursor-not-allowed" 
					: "hover:opacity-80 active:scale-95 cursor-pointer",

				isOwn
					? "bg-white/10 text-white border-white/20"
					: "bg-muted text-foreground border-border"
			)}
		>
			<BellPlus className="size-3 shrink-0" />
			Tạo nhắc hẹn
		</button>
	);
}

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
	const openChat = useChatStore((state) => state.openChat);
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
	const [selectedReminderForDialog, setSelectedReminderForDialog] = useState<Reminder | null>(null);
	const [isSharedReminderUnavailable, setIsSharedReminderUnavailable] = useState(false);
	const [profileUser, setProfileUser] = useState<{
		_id: string;
		displayName: string;
		email?: string;
		avatarUrl?: string;
		bio?: string;
		phone?: string;
		profileVisibility?: ProfileVisibility;
		profileVisibleToViewer?: boolean;
	} | null>(null);
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

	type Actor = {
		id: string;
		name: string;
		avatarUrl?: string | null;
		email?: string;
		bio?: string;
		phone?: string;
		profileVisibility?: ProfileVisibility;
		profileVisibleToViewer?: boolean;
	};

	const getViewerName = useCallback((actor: Actor) => {
		const actorId = actor.id?.startsWith("name:") ? null : actor.id?.toString?.();
		return actorId && actorId === currentUserId?.toString() ? "Bạn" : actor.name;
	}, [currentUserId]);

	const makeActor = useCallback((id: any, name: any, avatarUrl?: any): Actor | null => {
		const normalizedId = id?.toString?.() || "";
		const normalizedName = (name || "Người dùng").toString();
		const participant = normalizedId && !normalizedId.startsWith("name:")
			? participantsById.get(normalizedId)
			: null;
		const displayName = participant?.nickname?.trim() || normalizedName || participant?.displayName || "Người dùng";
		if (!normalizedId && !displayName) return null;
		return {
			id: normalizedId || `name:${displayName}`,
			name: displayName,
			avatarUrl: avatarUrl ?? participant?.avatarUrl ?? undefined,
			email: participant?.email,
			bio: participant?.bio,
			phone: participant?.phone,
			profileVisibility: participant?.profileVisibility,
			profileVisibleToViewer: participant?.profileVisibleToViewer,
		};
	}, [participantsById]);

	const openActorProfile = useCallback((actor: Actor, event: ReactMouseEvent | ReactPointerEvent) => {
		event.stopPropagation();
		const actorId = actor.id?.startsWith("name:") ? "" : actor.id?.toString?.();
		if (!actorId) return;

		setProfileUser({
			_id: actorId,
			displayName: actor.name || "Người dùng",
			email: actor.email || "",
			avatarUrl: actor.avatarUrl || undefined,
			bio: actor.bio,
			phone: actor.phone,
			profileVisibility: actor.profileVisibility,
			profileVisibleToViewer: actor.profileVisibleToViewer,
		});
	}, []);

	const actorBadge = useCallback((actor: Actor, key?: string) => {
		const canOpenProfile = Boolean(actor.id && !actor.id.startsWith("name:"));
		const content = (
			<>
				<span className="mr-1.5 inline-flex align-[-4px]">
					<UserAvatar
						type="seen"
						name={getViewerName(actor)}
						avatarUrl={actor.avatarUrl ?? undefined}
						className="size-[20px] shrink-0 border border-background shadow-sm"
					/>
				</span>
				<span className="font-semibold text-[13px] text-slate-700 dark:text-slate-200">{getViewerName(actor)}</span>
			</>
		);

		if (!canOpenProfile) {
			return (
				<span key={key || actor.id} className="inline whitespace-nowrap">
					{content}
				</span>
			);
		}

		return (
			<button
				key={key || actor.id}
				type="button"
				onClick={(event) => openActorProfile(actor, event)}
				onPointerDown={(event) => event.stopPropagation()}
				className="inline whitespace-nowrap rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				{content}
			</button>
		);
	}, [getViewerName, openActorProfile]);

	const textPart = (value: string, key?: string) => (
		<span key={key || value} className="inline font-normal text-[13px] text-slate-600 dark:text-slate-300">
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
			className="cursor-pointer inline font-medium text-[13px] text-sky-700 underline decoration-sky-500/60 underline-offset-2 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
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
		return (
			<span className="inline-flex flex-wrap items-center gap-1 align-middle">
				{visibleActors.map((actor, idx) => actorBadge(actor, `added-actor-${actor.id}-${idx}`))}
				{remainingCount > 0 && (
					<span className="inline-flex items-center whitespace-nowrap rounded-full px-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
						và {remainingCount} người khác
					</span>
				)}
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

		if (message.systemType === "group_avatar_permission_changed") {
			const changedByActor = makeActor(
				metadata.changedBy,
				metadata.changedByName || message.senderInfo?.displayName || "Quản trị viên",
				metadata.changedByInfo?.avatarUrl || message.senderInfo?.avatarUrl
			);
			if (changedByActor) {
				const actionText = metadata.allowMembersChangeAvatar
					? "đã bật quyền cho thành viên đổi tên và ảnh nhóm"
					: "đã tắt quyền cho thành viên đổi tên và ảnh nhóm";
				return (
					<>
						{actorBadge(changedByActor)} {textPart(actionText)}
					</>
				);
			}
		}

		if (message.systemType === "shared_reminder_permission_changed") {
			const changedByActor = makeActor(
				metadata.changedBy,
				metadata.changedByName || message.senderInfo?.displayName || "Quản trị viên",
				metadata.changedByInfo?.avatarUrl || message.senderInfo?.avatarUrl
			);
			if (changedByActor) {
				const actionText = metadata.allowMembersCreateSharedReminder
					? "đã bật quyền cho thành viên tạo nhắc hẹn chung"
					: "đã tắt quyền cho thành viên tạo nhắc hẹn chung";
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

	const actorProfileDialog = (
		<UserProfileDialog
			open={Boolean(profileUser)}
			onOpenChange={(open) => {
				if (!open) setProfileUser(null);
			}}
			user={profileUser}
			onOpenChat={async (targetUser) => {
				setProfileUser(null);
				await openChat({ userId: targetUser.friendId || targetUser._id });
			}}
		/>
	);

	const loadSharedOverview = useCallback(async (forceRefresh = false) => {
		const isCancelledFromMetadata = metadata?.isCancelled === true;

		if (message.systemType !== 'shared_reminder_created' || !sharedKey || isSharedReminderCancelled || isCancelledFromMetadata) {
			setSharedOverview(null);
			if (isSharedReminderCancelled || isCancelledFromMetadata) {
				setIsSharedReminderUnavailable(true);
			} else {
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

			if (linkedReminder) {
				setSelectedReminderForDialog(linkedReminder);
				return;
			}

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
				<SystemMessagePill contentClassName="font-medium tracking-normal">
					<span className="inline align-middle">
						{systemContent}
					</span>
				</SystemMessagePill>
				{actorProfileDialog}

				<div className="my-2 mx-auto w-full max-w-[520px] space-y-2 font-sans animate-in fade-in duration-300">
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
											className="h-8 rounded-lg border border-border/70 bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted/60"
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
											className="w-full rounded-lg border border-border/70 bg-background py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
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
												className="w-full rounded-lg border border-primary/25 bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
											>
												Tham gia lại
											</button>
										) : (
											<button
												type="button"
												disabled={isUpdatingParticipation}
												onClick={() => void updateParticipation(false)}
												className="w-full rounded-lg border border-rose-500/45 bg-background py-2.5 text-sm font-semibold text-rose-500 transition-colors hover:bg-rose-500/10 disabled:opacity-60"
											>
												Không tham gia
											</button>
										)
									)}

									<button
										type="button"
										onClick={openReminder}
										className="w-full rounded-lg border border-primary/25 bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
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

				<DetailDialog
					reminder={selectedReminderForDialog}
					onClose={() => setSelectedReminderForDialog(null)}
					onUpdate={(updated) => {
						useReminderStore.getState().updateReminderInStore(updated);
						setSelectedReminderForDialog(updated);
					}}
					currentUserId={currentUserId}
					onCancelSharedForAll={(sharedKey) => {
						useReminderStore.getState().removeRemindersBySharedKey(sharedKey);
						setSelectedReminderForDialog(null);
					}}
				/>
			</>
		);
	}

	return (
		<>
			<SystemMessagePill>
				{systemContent}
			</SystemMessagePill>
			{actorProfileDialog}
		</>
	);
}

const MessageItem = ({
	message,
	index,
	messages,
	selectedConvo,
	currentUserId,
	isLastMyMessage,
	imageBatchItems,
	onReply,
}: MessageItemProps) => {
	if (message.type === "system") {
		if (
			message.systemType === "disappearing_messages_enabled"
			|| message.systemType === "disappearing_messages_disabled"
		) {
			return <SystemMessageBubble message={message} conversation={selectedConvo} />;
		}
		return <SystemMessageComponent message={message} selectedConvo={selectedConvo} currentUserId={currentUserId} />;
	}

	if (message.isExpired) {
		const sender = typeof message.senderId === "object" ? (message.senderId as any)?._id : message.senderId;
		return <ExpiredMessagePlaceholder isOwn={String(sender) === String(currentUserId)} />;
	}

	const prev = messages[index - 1];
	const prevIsSystemBreak = prev?.type === "system" && prev.systemType !== "call";

	// Handle populated senderId (from fallback or normally populated)
	const senderObj = typeof message.senderId === "object" ? message.senderId as any : null;
	const actualSenderId = senderObj ? senderObj._id : message.senderId;

	const isGroupBreak =
		index === 0 ||
		prevIsSystemBreak ||
		actualSenderId !== (typeof prev?.senderId === "object" ? (prev?.senderId as any)._id : prev?.senderId) ||
		new Date(message.createdAt).getTime() - new Date(prev?.createdAt || 0).getTime() > 300000;
	const hasTimeGapFromPrev = prev
		? (new Date(message.createdAt).getTime() - new Date(prev.createdAt || 0).getTime()) > 300000
		: false;
	const isSameSenderAsPrev = Boolean(prev) && actualSenderId?.toString() === (typeof prev?.senderId === "object" ? (prev?.senderId as any)._id : prev?.senderId)?.toString?.();
	const shouldAddGap = isSameSenderAsPrev && hasTimeGapFromPrev;

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
	const resolveMessageSenderId = (msg?: Message | null) => {
		if (!msg) return "";
		const senderObj = typeof msg.senderId === "object" ? (msg.senderId as any) : null;
		return (senderObj ? senderObj._id : msg.senderId)?.toString?.() ?? "";
	};

	const { onlineUsers, userPresences } = useSocketStore();
	const isImageBatch = (imageBatchItems?.length ?? 0) > 1;
	const bubbleMessages = imageBatchItems?.length ? imageBatchItems : [message];
	const actionableMessage = bubbleMessages.find((item) =>
		item.isRecalled !== true
		&& item.reportStatus !== true
		&& (!item.status || item.status === "sent")
	) ?? null;
	const actionMessage = actionableMessage ?? message;
	const isDisappearing = Boolean(actionMessage.expiresAt);
	const hasUnrecalledBatchMessage = imageBatchItems?.some((item) => item.isRecalled !== true) ?? false;
	const hasUnmoderatedBatchMessage = imageBatchItems?.some((item) => item.reportStatus !== true) ?? false;
	const isRecalled = message.isRecalled === true && (!isImageBatch || !hasUnrecalledBatchMessage);
	const isViolationMessage = message.reportStatus === true && (!isImageBatch || !hasUnmoderatedBatchMessage);
	const isPinned = actionMessage.isPinned === true;
	const isImage = isImageBatch || (message.type === "image" && !!(message.fileUrl || message.filePublicId) && !isRecalled && !isViolationMessage);
	const isLink = message.type === "link" && !isRecalled && !isViolationMessage;
	const linkPreview = isLink ? message.metadata?.linkPreview : null;
	const hasLinkPreview = Boolean(linkPreview?.title || linkPreview?.image || linkPreview?.description);
	const isSticker = message.type === "sticker" && !isRecalled;
	const isTextBubble = (!message.type || message.type === "text") && !isRecalled && !isViolationMessage;
	const isDisbanded = selectedConvo.type === "group" && selectedConvo.disbanded === true;

	const hasContent = isImageBatch
		? Boolean(imageBatchItems?.some((item) => item.isRecalled !== true && item.reportStatus !== true && item.content?.trim()))
		: message.type === "sticker" || isViolationMessage ? false : !!message.content?.trim();
	const isVisualOnly = (isImage || isSticker) && !hasContent && !message.replyTo && !message.metadata?.forwardedFrom;
	const nextMessage = messages[index + 1];
	const nextSenderId = resolveMessageSenderId(nextMessage);
	const currentSenderId = actualSenderId?.toString?.() ?? "";
	const isNextSameSender = nextSenderId !== "" && nextSenderId === currentSenderId;
	const nextIsSystem = nextMessage?.type === "system";
	const hasGapToNext = nextMessage
		? (new Date(nextMessage.createdAt).getTime() - new Date(message.createdAt).getTime()) > 300000
		: true;
	const showTimestamp = !nextMessage || nextIsSystem || !isNextSameSender || hasGapToNext;
	const showSendingReceipt = isOwn && message.status === "sending" && isLastMyMessage;
	const canShowSettledReceipt = !message.status || message.status === "sent";
	const messageReceiptClassName = "ml-auto mr-3 mt-0.5 flex h-5 w-20 items-center justify-end gap-1 whitespace-nowrap text-[12px] sm:text-[13px] leading-none text-muted-foreground";

	const cachedMediaUrl = useMediaCacheStore(state => state.getUrl(message._id));
	const isBlob = message.fileUrl?.startsWith("blob:") ?? false;
	const downloadUrl = (!isBlob && message.fileUrl) || cachedMediaUrl || "#";
	const downloadableBubbleMessages = bubbleMessages.filter((item) =>
		item.isRecalled !== true && item.reportStatus !== true && (item.fileUrl || item.filePublicId) && (!item.status || item.status === "sent")
	);
	const senderPresence = getPresenceForUser(
		actualSenderId?.toString?.(),
		userPresences,
		participant?.userId?.presence ?? null,
		onlineUsers,
	);
	const senderBadgeStatus = getPresenceBadgeStatus(senderPresence);
	// Automatically fetch signed URL for files and audio if not cached
	useEffect(() => {
		if (
			!isViolationMessage &&
			(message.type === "file" || message.type === "audio") &&
			message.filePublicId &&
			(!message.fileUrl || isBlob) &&  // fetch nếu là blob hoặc không có url
			!cachedMediaUrl
		) {
			const fetchUrl = async () => {
				try {
					const { url } = await chatService.getSignedMediaUrl(message._id);
					useMediaCacheStore.getState().setUrl(message._id, url);
				} catch (error) {
					console.error('Failed to fetch media url:', message._id, error);
				}
			};
			fetchUrl();
		}
	}, [message._id, message.type, message.filePublicId, message.fileUrl, cachedMediaUrl, isViolationMessage]);

	const readReceiptsMap = useMemo(() => {
		const map: Record<string, { _id: string; displayName: string; avatarUrl?: string | null }[]> = {};
		if (!selectedConvo.participants || !messages?.length || !currentUserId) return map;

		const currentUserIdStr = currentUserId.toString();
		const messageIndexById = new Map<string, number>();
		messages.forEach((msg, idx) => {
			messageIndexById.set(msg._id, idx);
		});

		const resolveSenderId = (msg: Message) => {
			const senderObj = typeof msg.senderId === "object" ? (msg.senderId as any) : null;
			return (senderObj ? senderObj._id : msg.senderId)?.toString?.() ?? "";
		};

		for (const p of selectedConvo.participants) {
			const pid = p.userId?._id?.toString();
			if (!pid || pid === currentUserIdStr) continue;
			const lastReadId = p.lastReadMessageId;
			if (!lastReadId) continue;
			const lastReadIndex = messageIndexById.get(String(lastReadId));
			if (lastReadIndex === undefined) continue;

			let targetMessageId: string | null = null;
			for (let i = lastReadIndex; i >= 0; i -= 1) {
				const msg = messages[i];
				if (msg.type === "system" && msg.systemType !== "call") continue;
				if (resolveSenderId(msg) === pid) continue;

				if (!msg.status || msg.status === "sent") {
					targetMessageId = msg._id;
					break;
				}
			}

			if (!targetMessageId) continue;

			if (!map[targetMessageId]) map[targetMessageId] = [];
			map[targetMessageId].push({
				_id: pid,
				displayName: p.userId.nickname?.trim() || p.userId.displayName || "User",
				avatarUrl: p.userId.avatarUrl,
			});
		}
		return map;
	}, [selectedConvo.participants, currentUserId, messages]);

	const seenUsersForThisMessage = readReceiptsMap[message._id] ?? [];
	const visibleSeenUsers = seenUsersForThisMessage.slice(0, MAX_VISIBLE_SEEN_AVATARS);
	const hiddenSeenUsers = seenUsersForThisMessage.slice(MAX_VISIBLE_SEEN_AVATARS);
	const shouldAlignSeenReceiptsRight = isOwn || selectedConvo.type === "group";
	const seenReceiptClassName = cn(
		"mt-0.5 flex h-5 items-center",
		shouldAlignSeenReceiptsRight ? "ml-auto mr-3 justify-end" : "ml-[60px] mr-3 justify-start"
	);

	const { recallMessage, pinMessage, reactToMessage, createReminderSystemMessage, openChat, updateMessageAppealLocal } = useChatStore();
	const { isDark } = useThemeStore();
	const { blockedUsers, blockedBy } = useFriendStore();

	const isBlocked = useMemo(() => {
		if (selectedConvo.type !== "direct") return false;
		const otherUser = selectedConvo.participants.find((p) => p.userId?._id?.toString() !== currentUserId);
		if (!otherUser?.userId?._id) return false;
		return (
			blockedUsers.some((u) => u._id === otherUser.userId._id) ||
			blockedBy.includes(otherUser.userId._id)
		);
	}, [selectedConvo, currentUserId, blockedUsers, blockedBy]);
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
	const [showSeenUsersDialog, setShowSeenUsersDialog] = useState(false);
	const [showReportDialog, setShowReportDialog] = useState(false);
	const [showAppealDialog, setShowAppealDialog] = useState(false);
	const [appealReason, setAppealReason] = useState("");
	const [appealSubmitting, setAppealSubmitting] = useState(false);
	const [profileUser, setProfileUser] = useState<{
		_id: string;
		displayName: string;
		email?: string;
		avatarUrl?: string;
		bio?: string;
		phone?: string;
		profileVisibility?: ProfileVisibility;
		profileVisibleToViewer?: boolean;
	} | null>(null);
	const messageRootRef = useRef<HTMLDivElement | null>(null);
	const longPressTimeoutRef = useRef<number | null>(null);

	const openSenderProfile = useCallback((event: ReactMouseEvent | ReactPointerEvent) => {
		event.stopPropagation();
		const sender = participant?.userId;
		const senderId = sender?._id?.toString?.();
		if (!sender || !senderId || selectedConvo.type !== "group") return;

		setProfileUser({
			_id: senderId,
			displayName: sender.displayName || sender.nickname?.trim() || "Người dùng",
			email: sender.email || "",
			avatarUrl: sender.avatarUrl || undefined,
			bio: sender.bio,
			phone: sender.phone,
			profileVisibility: sender.profileVisibility,
			profileVisibleToViewer: sender.profileVisibleToViewer,
		});
	}, [participant?.userId, selectedConvo.type]);

	const openMentionProfile = useCallback((userId: string) => {
		const mentionedParticipant = selectedConvo.participants.find(
			(item) => item.userId?._id?.toString?.() === userId.toString()
		)?.userId;
		if (!mentionedParticipant?._id) return;

		setProfileUser({
			_id: mentionedParticipant._id.toString(),
			displayName: mentionedParticipant.displayName || mentionedParticipant.nickname?.trim() || "Người dùng",
			email: mentionedParticipant.email || "",
			avatarUrl: mentionedParticipant.avatarUrl || undefined,
			bio: mentionedParticipant.bio,
			phone: mentionedParticipant.phone,
			profileVisibility: mentionedParticipant.profileVisibility,
			profileVisibleToViewer: mentionedParticipant.profileVisibleToViewer,
		});
	}, [selectedConvo.participants]);

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
		if (!actionableMessage || isDisbanded) return;

		clearLongPressTimer();
		longPressTimeoutRef.current = window.setTimeout(() => {
			setShowTouchActions(true);
		}, 380);
	};

	const handlePointerEndForActions = () => {
		clearLongPressTimer();
	};

	const reactionSummary = useMemo(() => {
		if (isViolationMessage) return null;
		if (!actionMessage.reactions?.length) return null;

		const counts: Record<string, number> = {};
		actionMessage.reactions.forEach(r => {
			counts[r.emoji] = (counts[r.emoji] || 0) + 1;
		});

		const uniqueEmojis = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
		const totalCount = actionMessage.reactions.length;
		const myReaction = actionMessage.reactions.find(r => r.userId === currentUserId);

		return { uniqueEmojis, totalCount, myReaction };
	}, [isViolationMessage, actionMessage.reactions, currentUserId]);

	// ── Smart reminder detection ───────────────────────────────────────────────
	const showSmartReminderButton = useMemo(() => {
		if (isRecalled) return false;
		if (isViolationMessage) return false;
		if (isDisbanded) return false;
		if (message.type !== "text") return false;
		if (!message.content) return false;
		return detectDateTimeInText(message.content);
	}, [isRecalled, isViolationMessage, isDisbanded, message.type, message.content]);

	const messagePreviewText = useMemo(() => {
		if (message.type === "image") return "[Hình ảnh]";
		if (message.type === "file") return decodeMojibakeFileName(message.fileName) || "[File]";
		if (message.type === "sticker") return "[Nhãn dán]";
		if (message.type === "audio") return "[Tin nhắn thoại]";
		return getMentionSafeText(message.content, selectedConvo.participants, message.mentions) || "Tin nhắn";
	}, [message.content, message.fileName, message.mentions, message.type, selectedConvo.participants]);

	const openSmartReminder = useCallback(() => {
		setReminderTargetMessage({
			messageId: message._id,
			messagePreview: messagePreviewText,
		});
	}, [message._id, messagePreviewText]);
	// ─────────────────────────────────────────────────────────────────────────

	const handleEmojiSelect = async (emoji: any) => {
		if (isReacting) return;
		setIsReacting(true);
		try {
			await reactToMessage(actionMessage._id, emoji.native);
			setShowTouchActions(false);
		} catch (error) {
			console.error("Reaction failed:", error);
		} finally {
			setIsReacting(false);
		}
	};

	const handlePin = async () => {
		if (isDisappearing) {
			toast.warning("Tin nhắn tự xóa không thể ghim.");
			return;
		}
		try { await pinMessage(actionMessage._id); }
		catch (e) { console.error("Ghim thất bại:", e); }
		finally {
			setShowPinOptions(false);
			setShowTouchActions(false);
		}
	};

	const handleCopy = () => {
		if (actionMessage.content) {
			navigator.clipboard.writeText(getMentionSafeText(actionMessage.content, selectedConvo.participants, actionMessage.mentions));
			toast.success("Đã sao chép vào bộ nhớ tạm");
		}
	};

	const downloadMessageFile = async (item: Message) => {
		let url = item.filePublicId ? useMediaCacheStore.getState().getUrl(item._id) : item.fileUrl;
		if (!url && item.filePublicId) {
			const response = await chatService.getSignedMediaUrl(item._id);
			url = response.url;
			useMediaCacheStore.getState().setUrl(item._id, url);
		}
		if (!url) return;

		try {
			let response = await fetch(url);
			if (!response.ok && item.filePublicId) {
				const refreshed = await chatService.getSignedMediaUrl(item._id);
				url = refreshed.url;
				useMediaCacheStore.getState().setUrl(item._id, url);
				response = await fetch(url);
			}
			if (!response.ok) throw new Error("Download failed");

			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = blobUrl;
			anchor.download = decodeMojibakeFileName(item.fileName) || `${item.type}-${item._id}`;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(blobUrl);
		} catch {
			window.open(url, "_blank", "noopener,noreferrer");
		}
	};

	const handleDownloadBubble = async () => {
		try {
			for (const item of downloadableBubbleMessages) {
				await downloadMessageFile(item);
			}
		} catch {
			toast.error("Tải xuống thất bại");
		}
	};

	const handleRecall = () => {
		const recallTargets = bubbleMessages.filter((entry) => entry.isRecalled !== true && entry.reportStatus !== true && (!entry.status || entry.status === "sent"));
		setShowConfirmRecall(false);
		setShowTouchActions(false);

		void (async () => {
			try {
				for (const item of recallTargets) {
					await recallMessage(item._id);
				}
			}
			catch (e: any) { toast.error(e.message || "Thu hồi thất bại"); }
		})();
	};

	const canCreateReminder = !isDisbanded && !isRecalled && !isViolationMessage && message.type === "text";
	const isCurrentUserGroupAdmin = selectedConvo.type === "group"
		&& (selectedConvo.group?.admins || []).some((adminId: any) => String(adminId?._id || adminId) === String(currentUserId));
	const canCreateSharedReminder = selectedConvo.type !== "group"
		|| selectedConvo.group?.allowMembersCreateSharedReminder !== false
		|| isCurrentUserGroupAdmin;
	const canReportMessage = !isOwn && !isDisbanded && Boolean(actionableMessage);
	const canAppealMessage = isOwn && !isDisbanded && isAiRejectedMessage(message);
	const hasSubmittedAppeal = Boolean(message.appeal);
	const canSubmitAppeal = canAppealMessage && !hasSubmittedAppeal;
	const appealStatusLabel = message.appeal?.status ? messageAppealLabels[message.appeal.status] : "";
	const shouldShowTouchActionControls = isCoarsePointer && showTouchActions;

	const handleSubmitAppeal = async () => {
		const reason = appealReason.trim();
		if (!canSubmitAppeal || appealSubmitting) return;
		if (reason.length < MESSAGE_APPEAL_MIN_REASON_LENGTH) {
			toast.warning(`Vui lòng nhập lý do ít nhất ${MESSAGE_APPEAL_MIN_REASON_LENGTH} ký tự.`);
			return;
		}

		try {
			setAppealSubmitting(true);
			const result = await chatService.submitMessageAppeal(message._id, reason);
			if (result.appeal) {
				updateMessageAppealLocal(message.conversationId, message._id, result.appeal);
			}
			toast.success("Đã gửi kháng cáo tin nhắn");
			setShowAppealDialog(false);
			setAppealReason("");
		} catch (error: any) {
			if (error?.appeal) {
				updateMessageAppealLocal(message.conversationId, message._id, error.appeal);
			}
			toast.error(error?.message || "Không thể gửi kháng cáo");
		} finally {
			setAppealSubmitting(false);
		}
	};

	return (
		<>
			<div
				ref={messageRootRef}
				id={`msg-${message._id}`}
				className={cn(
					"group relative flex gap-2 mx-2 px-1",
					shouldAddGap ? "mt-3" : "mt-0.5",
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
					<div className="w-10 shrink-0 pt-0.5">
						{isGroupBreak && (
							selectedConvo.type === "group" ? (
								<button
									type="button"
									onClick={openSenderProfile}
									onPointerDown={(event) => event.stopPropagation()}
									className="block rounded-full outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
									aria-label={`Xem thông tin ${participant?.userId.displayName || "người dùng"}`}
								>
									<UserAvatar
										type="chat"
										name={participant?.userId.nickname?.trim() || participant?.userId.displayName || "User"}
										avatarUrl={participant?.userId.avatarUrl ?? undefined}
										className="size-10 text-base"
										status={senderBadgeStatus}
									/>
								</button>
							) : (
								<UserAvatar
									type="chat"
									name={participant?.userId.nickname?.trim() || participant?.userId.displayName || "User"}
									avatarUrl={participant?.userId.avatarUrl ?? undefined}
									className="size-10 text-base"
								/>
							)
						)}
					</div>
				)}

				<div
					className={cn(
						"relative max-w-[90%] sm:max-w-[80%] md:max-w-[72%] flex flex-col",
						isOwn ? "items-end" : "items-start"
					)}
				>
					<div className={cn("relative", reactionSummary && "mb-3.5")}>
						<Card
							className={cn(
								"shadow-sm overflow-hidden w-fit gap-0",
								isOwn && "ms-auto",
								isTextBubble && "min-w-[68px]",
								(isVisualOnly || hasLinkPreview) ? "p-0 bg-transparent border-0 shadow-none" : (isImage ? "p-2.5 text-[14px] leading-relaxed sm:text-[15px]" : "px-4 py-2.5 text-[14px] leading-relaxed sm:text-[15px]"),
								reactionSummary && !isVisualOnly && "min-w-[85px]",
								(isRecalled && !isImageBatch)
									? "bg-muted text-muted-foreground border border-dashed border-border italic rounded-2xl"
									: isViolationMessage
										? "bg-destructive/10 text-destructive border border-destructive/25 rounded-2xl"
									: (isVisualOnly || hasLinkPreview)
										? "bg-transparent border-0 shadow-none"
										: isOwn
											? "bg-blue-500 text-white border border-blue-600/30 shadow-[0_1px_2px_rgba(37,99,235,0.18)] rounded-2xl rounded-br-none"
											: "bg-white dark:bg-gray-800 text-foreground border border-slate-200/90 dark:border-slate-700/80 shadow-[0_1px_2px_rgba(15,23,42,0.08)] rounded-2xl rounded-bl-none"
							)}
						>
							{message.replyTo && !isRecalled && !isViolationMessage && (
								<ReplyQuoteInline
									replyTo={message.replyTo}
									isOwn={isOwn}
									participants={selectedConvo.participants}
									currentUserId={currentUserId}
									conversationId={selectedConvo._id}
									messages={messages}
								/>
							)}
							{!isRecalled && !isViolationMessage && message.metadata?.forwardedFrom && (
								<div className={cn("flex items-center gap-1 px-1 pt-1 pb-0 text-[12px] sm:text-[13px] opacity-70 select-none", isOwn ? "text-blue-100 justify-end" : "text-muted-foreground justify-start")}>
									<Forward className="h-3 w-3 shrink-0" strokeWidth={2} />
									<span>Đã chuyển tiếp tin nhắn</span>
								</div>
							)}
							<div className="flex w-full min-w-0 flex-col gap-1">
								<div className="w-fit max-w-full">
									<MessageContent
										message={message}
										isOwn={isOwn}
										downloadUrl={downloadUrl}
										participants={selectedConvo.participants}
										imageBatchItems={imageBatchItems}
										onMentionClick={openMentionProfile}
									/>
								</div>

								{!isVisualOnly && showTimestamp && (
									<div className={cn(
										"flex w-full items-end gap-2 select-none",
										showSmartReminderButton ? "justify-between" : "justify-start",
										(isOwn && !isLink) ? "text-white/65" : "text-foreground/65"
									)}>
										{/* ── Smart Reminder Button ─────────────────────────────────────────── */}
										{showSmartReminderButton && (
											<SmartReminderButton
												message={message}
												isOwn={isOwn}
												onOpen={openSmartReminder}
												disabled={isBlocked}
											/>
										)}
										<span className="shrink-0 whitespace-nowrap text-[10.5px] font-normal leading-none tabular-nums tracking-normal">
											{formatMessageTime(new Date(message.createdAt))}
										</span>
										{isOwn && message.status === "error" && (
											<AlertCircle className="size-2.5 shrink-0 text-red-300" />
										)}
									</div>
								)}

							</div>
						</Card>
						{(canSubmitAppeal || message.appeal) && (
							<div className={cn(
								"mt-1.5 flex max-w-[260px] items-center gap-2 text-[12px] sm:text-[13px]",
								isOwn ? "justify-end self-end" : "justify-start"
							)}>
								{message.appeal ? (
									<span className={cn(
										"inline-flex items-center gap-1 rounded-full border px-2 py-1 font-medium",
										message.appeal.status === "approved"
											? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
											: message.appeal.status === "rejected"
												? "border-destructive/30 bg-destructive/10 text-destructive"
												: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
									)}>
										<Scale className="size-3.5" />
										{appealStatusLabel}
									</span>
								) : (
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="h-8 rounded-md border-destructive/30 px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
										onClick={() => setShowAppealDialog(true)}
									>
										<Scale className="size-3.5" />
										Kháng cáo
									</Button>
								)}
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
									<span className="text-[12px] font-bold text-muted-foreground ml-0.5 leading-none group-hover/reacts:text-foreground">
										{reactionSummary.totalCount}
									</span>
								)}
							</button>
						)}

						{/* Hover Action Bar - Quick Reaction Button */}
						{actionableMessage && !isDisbanded && (
							<div className={cn(
								"hidden sm:flex absolute top-1/2 -translate-y-1/2 transition-all duration-200 z-30",
								"opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto",
								isOwn ? "-left-10" : "-right-10"
							)}>
								<div className="flex items-center gap-1 bg-background shadow-md border border-border/40 rounded-full px-0.5 py-0.5">
									<Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
										<PopoverTrigger asChild>
											<button
												className={cn(
													"p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-primary transition-colors disabled:opacity-50",
													isBlocked && "grayscale opacity-40 cursor-not-allowed"
												)}
												disabled={isReacting || isBlocked}
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
													theme={isDark ? "dark" : "light"}
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


						{actionableMessage && (
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

										<DropdownMenuContent
											align={isOwn ? "end" : "start"}
											className="w-46"
											onCloseAutoFocus={(e) => {
												if (useChatStore.getState().replyingTo) {
													e.preventDefault();
												}
											}}
										>
											<DropdownMenuItem 
												disabled={isBlocked}
												onClick={() => { if(!isBlocked) { setShowTouchActions(false); onReply?.(actionMessage); } }}
												className={cn(isBlocked && "opacity-50 grayscale cursor-not-allowed")}
											>
												<Reply className="w-4 h-4 mr-2" strokeWidth={1.6} />
												Trả lời
											</DropdownMenuItem>
											{!isRecalled && (
												<DropdownMenuItem onClick={() => { setShowTouchActions(false); setShowForwardModal(true); }}>
													<Forward className="w-4 h-4 mr-2" strokeWidth={1.6} />
													Chuyển tiếp
												</DropdownMenuItem>
											)}
											{actionMessage.content && actionMessage.type !== 'sticker' && (
												<DropdownMenuItem onClick={() => { setShowTouchActions(false); handleCopy(); }}>
													<Copy className="w-4 h-4 mr-2" strokeWidth={1.6} />
													Sao chép
												</DropdownMenuItem>
											)}
											{downloadableBubbleMessages.length > 0 && (
												<DropdownMenuItem onClick={() => { setShowTouchActions(false); void handleDownloadBubble(); }}>
													<Download className="w-4 h-4 mr-2" strokeWidth={1.6} />
													Tải xuống
												</DropdownMenuItem>
											)}
											<DropdownMenuItem 
												disabled={isBlocked || isDisappearing}
												onClick={() => { if(!isBlocked && !isDisappearing) { setShowTouchActions(false); setShowPinOptions(true); } }}
												className={cn((isBlocked || isDisappearing) && "opacity-50 grayscale cursor-not-allowed")}
											>
												{isPinned ? (
													<PinOff className="w-4 h-4 mr-2" strokeWidth={1.6} />
												) : (
													<Pin className="w-4 h-4 mr-2" strokeWidth={1.6} />
												)}
												{isPinned ? "Bỏ ghim tin nhắn" : "Ghim tin nhắn"}
											</DropdownMenuItem>
											{canCreateReminder && (
												<DropdownMenuItem
													disabled={isBlocked}
													onClick={() => {
														if(!isBlocked) {
															setShowTouchActions(false);
															setReminderTargetMessage({
																messageId: message._id,
																messagePreview: messagePreviewText,
															});
														}
													}}
													className={cn(isBlocked && "opacity-50 grayscale cursor-not-allowed")}
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
											{canReportMessage && (
												<DropdownMenuItem
													className="text-destructive focus:text-destructive focus:bg-destructive/10"
													onClick={() => { setShowTouchActions(false); setShowReportDialog(true); }}
												>
													<Flag className="w-4 h-4 mr-2" strokeWidth={1.6} />
													Báo cáo tin nhắn
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
												onCloseAutoFocus={(e) => {
													if (useChatStore.getState().replyingTo) {
														e.preventDefault();
													}
												}}
											>
												<DialogTitle className="sr-only">Thao tác tin nhắn</DialogTitle>
												<div className="grid grid-cols-4 sm:grid-cols-5 gap-y-6 gap-x-1">
													<button 
														disabled={isBlocked}
														onClick={() => { if(!isBlocked) setTouchActionView("emoji"); }} 
														className={cn("flex flex-col items-center gap-2", isBlocked && "opacity-40 grayscale cursor-not-allowed")}
													>
														<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
															<Smile className="h-5 w-5" strokeWidth={1.5} />
														</div>
														<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Cảm xúc</span>
													</button>

													<button 
														disabled={isBlocked}
														onClick={() => { if(!isBlocked) { setShowTouchActions(false); onReply?.(actionMessage); } }}
														className={cn("flex flex-col items-center gap-2", isBlocked && "opacity-40 grayscale cursor-not-allowed")}
													>
														<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
															<Reply className="h-5 w-5" strokeWidth={1.5} />
														</div>
														<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Trả lời</span>
													</button>

													{!isRecalled && (
														<button onClick={() => { setShowTouchActions(false); setShowForwardModal(true); }} className="flex flex-col items-center gap-2">
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
																<Forward className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Chuyển tiếp</span>
														</button>
													)}

													{actionMessage.content && actionMessage.type !== 'sticker' && (
														<button onClick={() => { setShowTouchActions(false); handleCopy(); }} className="flex flex-col items-center gap-2">
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
																<Copy className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Sao chép</span>
														</button>
													)}

													{downloadableBubbleMessages.length > 0 && (
														<button className="flex flex-col items-center gap-2" onClick={() => { setShowTouchActions(false); void handleDownloadBubble(); }}>
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
																<Download className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">Tải xuống</span>
														</button>
													)}

													<button 
														disabled={isBlocked || isDisappearing}
														onClick={() => { if(!isBlocked && !isDisappearing) { setShowTouchActions(false); setShowPinOptions(true); } }}
														className={cn("flex flex-col items-center gap-2", (isBlocked || isDisappearing) && "opacity-40 grayscale cursor-not-allowed")}
													>
														<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-foreground shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
															{isPinned ? <PinOff className="h-5 w-5" strokeWidth={1.5} /> : <Pin className="h-5 w-5" strokeWidth={1.5} />}
														</div>
														<span className="text-[11.5px] font-medium text-foreground whitespace-nowrap">{isPinned ? "Bỏ ghim" : "Ghim"}</span>
													</button>

													{canCreateReminder && (
														<button
															disabled={isBlocked}
															onClick={() => {
																if(!isBlocked) {
																	setShowTouchActions(false);
																	setReminderTargetMessage({ messageId: message._id, messagePreview: messagePreviewText });
																}
															}}
															className={cn("flex flex-col items-center gap-2", isBlocked && "opacity-40 grayscale cursor-not-allowed")}
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
													{canReportMessage && (
														<button onClick={() => { setShowTouchActions(false); setShowReportDialog(true); }} className="flex flex-col items-center gap-2">
															<div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-500 shadow-sm hover:bg-red-200 dark:hover:bg-red-500/20 transition-colors">
																<Flag className="h-5 w-5" strokeWidth={1.5} />
															</div>
															<span className="text-[11.5px] font-medium text-red-600 dark:text-red-500 whitespace-nowrap">Báo cáo</span>
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
														theme={isDark ? "dark" : "light"}
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

			{(canShowSettledReceipt || showSendingReceipt) && (
				showSendingReceipt ? (
					<div className={messageReceiptClassName}>
						<Clock className="size-3.5 animate-spin" strokeWidth={2.2} />
						<span>Đang gửi</span>
					</div>
				) : seenUsersForThisMessage.length > 0 ? (
					isCoarsePointer ? (
						<div className={seenReceiptClassName}>
							<button
								type="button"
								className={cn(
									"flex h-5 items-center -space-x-1 rounded-full active:bg-muted/70",
									shouldAlignSeenReceiptsRight ? "justify-end px-1.5" : "justify-start pl-0 pr-1.5"
								)}
								aria-label={`Xem ${seenUsersForThisMessage.length} người đã xem tin nhắn`}
								onClick={() => setShowSeenUsersDialog(true)}
							>
								{visibleSeenUsers.map((seenUser) => (
									<span key={seenUser._id} className="relative inline-flex rounded-full ring-2 ring-background">
										<UserAvatar
											type="seen"
											name={seenUser.displayName}
											avatarUrl={seenUser.avatarUrl ?? undefined}
										/>
									</span>
								))}
								{hiddenSeenUsers.length > 0 && (
									<span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-semibold leading-none text-muted-foreground ring-2 ring-background">
										+{hiddenSeenUsers.length}
									</span>
								)}
							</button>
						</div>
					) : (
						<TooltipProvider delayDuration={120}>
							<div className={cn(seenReceiptClassName, "-space-x-1")}>
								{visibleSeenUsers.map((seenUser) => (
									<Tooltip key={seenUser._id}>
										<TooltipTrigger asChild>
											<span className="relative inline-flex rounded-full ring-2 ring-background transition-transform hover:z-10 hover:-translate-y-0.5">
												<UserAvatar
													type="seen"
													name={seenUser.displayName}
													avatarUrl={seenUser.avatarUrl ?? undefined}
												/>
											</span>
										</TooltipTrigger>
										<TooltipContent side="top" sideOffset={6}>
											{seenUser.displayName}
										</TooltipContent>
									</Tooltip>
								))}
								{hiddenSeenUsers.length > 0 && (
									<Tooltip>
										<TooltipTrigger asChild>
											<span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-semibold leading-none text-muted-foreground ring-2 ring-background hover:z-10">
												+{hiddenSeenUsers.length}
											</span>
										</TooltipTrigger>
										<TooltipContent side="top" sideOffset={6} className="max-w-56 text-left">
											<div className="mb-1 text-[12px] sm:text-[13px] font-semibold text-background/80">Đã xem bởi</div>
											<div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto beautiful-scrollbar pr-1">
												{seenUsersForThisMessage.map((seenUser) => (
													<span key={seenUser._id}>{seenUser.displayName}</span>
												))}
											</div>
										</TooltipContent>
									</Tooltip>
								)}
							</div>
						</TooltipProvider>
					)
				) : isLastMyMessage ? (
					selectedConvo.type === "direct" ? (
						<div className={messageReceiptClassName}>
							{message.isDelivered ? (
								<>
									<CheckCheck className="size-3.5" strokeWidth={2.2} />
									<span>Đã nhận</span>
								</>
							) : (
								<>
									<Check className="size-3.5" strokeWidth={2.2} />
									<span>Đã gửi</span>
								</>
							)}
						</div>
					) : (
						<div className={messageReceiptClassName}>
							<span>Đã gửi</span>
						</div>
					)
				) : null
			)}

			<Dialog open={showSeenUsersDialog} onOpenChange={setShowSeenUsersDialog}>
				<DialogContent className="w-[92vw] max-w-sm rounded-2xl border-border/70 bg-background p-0 shadow-2xl">
					<DialogHeader className="px-5 pt-5 pb-3 text-left">
						<DialogTitle>Đã xem bởi</DialogTitle>
						<p className="text-sm text-muted-foreground">
							{seenUsersForThisMessage.length} người đã xem tin nhắn này
						</p>
					</DialogHeader>
					<div className="max-h-[60vh] overflow-y-auto beautiful-scrollbar px-5 pb-5">
						<div className="flex flex-col gap-2">
							{seenUsersForThisMessage.map((seenUser) => (
								<div key={seenUser._id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
									<UserAvatar
										type="chat"
										name={seenUser.displayName}
										avatarUrl={seenUser.avatarUrl ?? undefined}
									/>
									<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
										{seenUser.displayName}
									</span>
								</div>
							))}
						</div>
					</div>
				</DialogContent>
			</Dialog>

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

			{actionMessage.reactions && (
				<ReactionDetailModal
					isOpen={showReactionModal}
					onClose={() => setShowReactionModal(false)}
					reactions={actionMessage.reactions}
				/>
			)}

			{reminderTargetMessage && (
				<ReminderQuickModal
					conversationId={message.conversationId}
					messageId={reminderTargetMessage.messageId}
					messagePreview={reminderTargetMessage.messagePreview}
					sharedDisabled={!canCreateSharedReminder}
					sharedDisabledReason="Chỉ quản trị viên nhóm có thể tạo nhắc hẹn chung lúc này."
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
					message={actionMessage}
					messages={bubbleMessages.filter((item) => item.isRecalled !== true && item.reportStatus !== true && (!item.status || item.status === "sent"))}
				/>
			)}

			<UserProfileDialog
				open={Boolean(profileUser)}
				onOpenChange={(open) => {
					if (!open) setProfileUser(null);
				}}
				user={profileUser}
				onOpenChat={async (targetUser) => {
					setProfileUser(null);
					await openChat({ userId: targetUser.friendId || targetUser._id });
				}}
			/>

			{canAppealMessage && (
				<Dialog open={showAppealDialog} onOpenChange={(open) => {
					if (appealSubmitting) return;
					setShowAppealDialog(open);
					if (!open) setAppealReason("");
				}}>
					<DialogContent className="z-[300] !flex max-h-[calc(100dvh-2rem)] w-[92vw] max-w-md flex-col !gap-0 overflow-hidden rounded-2xl p-0 sm:!max-w-md">
						<DialogHeader className="shrink-0 px-5 pt-5 pb-3 text-left">
							<div className="flex items-start gap-3">
								<div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
									<Scale className="size-5" strokeWidth={1.8} />
								</div>
								<div className="min-w-0">
									<DialogTitle>Kháng cáo tin nhắn</DialogTitle>
									<DialogDescription className="mt-1">
										Gửi lý do để admin xem xét lại kết luận vi phạm của AI.
									</DialogDescription>
								</div>
							</div>
						</DialogHeader>

						<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4 beautiful-scrollbar">
							<div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
								Tin nhắn hiện đang bị ẩn vì AI đánh dấu vi phạm tiêu chuẩn cộng đồng.
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-3">
									<label htmlFor={`message-appeal-${message._id}`} className="text-sm font-medium text-foreground">
										Lý do kháng cáo
									</label>
									<span className="text-xs text-muted-foreground">
										{appealReason.trim().length}/{MESSAGE_APPEAL_MIN_REASON_LENGTH}
									</span>
								</div>
								<Textarea
									id={`message-appeal-${message._id}`}
									value={appealReason}
									maxLength={2000}
									onChange={(event) => setAppealReason(event.target.value)}
									placeholder="Ví dụ: AI hiểu nhầm ngữ cảnh cuộc trò chuyện..."
									className="min-h-28 resize-none"
									disabled={appealSubmitting || hasSubmittedAppeal}
								/>
							</div>
						</div>

						<DialogFooter className="shrink-0 border-t bg-muted/20 px-5 py-4 sm:justify-end">
							<Button variant="ghost" onClick={() => setShowAppealDialog(false)} disabled={appealSubmitting}>
								Hủy
							</Button>
							<Button
								variant="destructive"
								onClick={() => void handleSubmitAppeal()}
								disabled={appealSubmitting || hasSubmittedAppeal || appealReason.trim().length < MESSAGE_APPEAL_MIN_REASON_LENGTH}
							>
								{appealSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
								Gửi kháng cáo
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}

			{canReportMessage && (
				<ReportDialog
					open={showReportDialog}
					onOpenChange={setShowReportDialog}
					targetType="message"
					targetId={actionMessage._id}
					targetName={actionMessage.senderInfo?.displayName}
					conversationId={actionMessage.conversationId}
					preview={messagePreviewText}
				/>
			)}
		</>
	);
};

export default MessageItem;
