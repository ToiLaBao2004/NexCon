import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation, Mention, MessageType } from "@/types/chat";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "../ui/button";
import EmojiPicker from "./EmojiPicker";
import VoiceRecorder from "./VoiceRecorder";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { toast } from "sonner";
import { Paperclip, ImagePlus, Send, X, FileText, Reply, Mic } from "lucide-react";
import StickerPickerPopover from "./StickerPickerPopover";
import { isUrl, formatBytes } from "@/lib/utils";


const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;



interface Attachment {
	type: "image" | "file" | "audio";
	file: File;
	preview?: string;
}

interface MentionCandidate {
	userId: string;
	displayName: string;
	canonicalDisplayName: string;
	avatarUrl?: string | null;
}

interface MentionTokenRange {
	start: number;
	end: number;
}

const getActiveMentionToken = (text: string, cursor: number) => {
	const beforeCursor = text.slice(0, cursor);
	const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/);

	if (!match) {
		return null;
	}

	const query = match[2] || "";
	const start = beforeCursor.length - query.length - 1;
	const end = cursor;

	if (start < 0 || beforeCursor[start] !== "@") {
		return null;
	}

	return {
		query,
		start,
		end,
	};
};

const buildMentionsFromText = (text: string, mentions: MentionCandidate[]): { content: string; mentions: Mention[] } => {
	const remainingMentions = [...mentions].sort((a, b) => b.displayName.length - a.displayName.length);
	const usedRanges: Array<{ start: number; end: number }> = [];
	const matchedRanges: Array<{ start: number; end: number; mention: MentionCandidate }> = [];

	for (const mention of remainingMentions) {
		const token = `@${mention.displayName}`;
		let searchIndex = text.indexOf(token);

		while (searchIndex !== -1) {
			const tokenEnd = searchIndex + token.length;
			const overlaps = usedRanges.some((range) => !(tokenEnd <= range.start || searchIndex >= range.end));

			if (!overlaps) {
				usedRanges.push({ start: searchIndex, end: tokenEnd });
				matchedRanges.push({ start: searchIndex, end: tokenEnd, mention });
				break;
			}

			searchIndex = text.indexOf(token, searchIndex + 1);
		}
	}

	if (!matchedRanges.length) {
		return { content: text, mentions: [] };
	}

	matchedRanges.sort((a, b) => a.start - b.start);

	let cursor = 0;
	let tokenizedContent = "";
	const result: Mention[] = [];

	for (const range of matchedRanges) {
		if (range.start < cursor) {
			continue;
		}

		tokenizedContent += text.slice(cursor, range.start);
		const mentionToken = `@[USER:${range.mention.userId}]`;
		const offset = tokenizedContent.length;
		tokenizedContent += mentionToken;

		result.push({
			userId: range.mention.userId,
			displayName: range.mention.canonicalDisplayName || range.mention.displayName,
			offset,
			length: mentionToken.length,
		});

		cursor = range.end;
	}

	tokenizedContent += text.slice(cursor);

	return {
		content: tokenizedContent,
		mentions: result,
	};
};

function ProgressBar({ percent, label = "Đang tải lên…" }: { percent: number, label?: string }) {
	return (
		<div className="px-3 pb-2">
			<div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
				<span>{label}</span>
				<span>{Math.round(percent)}%</span>
			</div>
			<div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
				<div
					className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-200"
					style={{ width: `${percent}%` }}
				/>
			</div>
		</div>
	);
}

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
	const { user } = useAuthStore();
	const { emitTyping, emitStopTyping } = useSocketStore();
	const { sendMessage, markAsSeen, replyingTo, setReplyingTo, setDraft, clearDraft } = useChatStore();
	const { blockedUsers, blockedBy } = useFriendStore();
	const currentUserId = user?._id ?? "";

	const [value, setValue] = useState("");
	const [attachment, setAttachment] = useState<Attachment | null>(null);
	const [sending, setSending] = useState(false);
	const [loadingLocal, setLoadingLocal] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [mentionQuery, setMentionQuery] = useState("");
	const [mentionRange, setMentionRange] = useState<MentionTokenRange | null>(null);
	const [mentionOpen, setMentionOpen] = useState(false);
	const [activeMentionIndex, setActiveMentionIndex] = useState(0);
	const [selectedMentions, setSelectedMentions] = useState<MentionCandidate[]>([]);
	const draftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textInputRef = useRef<HTMLTextAreaElement>(null);

	const participants = selectedConvo.participants;
	const mentionCandidates = useMemo(() => {
		const keyword = mentionQuery.trim().toLowerCase();

		return participants
			.filter((participant) => participant.userId?._id?.toString() !== currentUserId)
			.map((participant) => ({
				userId: participant.userId._id,
				displayName: participant.userId.nickname?.trim() || participant.userId.displayName,
				canonicalDisplayName: participant.userId.displayName,
				avatarUrl: participant.userId.avatarUrl,
			}))
			.filter((participant) => {
				if (!keyword) return true;
				return participant.displayName.toLowerCase().includes(keyword);
			});
	}, [currentUserId, mentionQuery, participants]);

	if (!user) return null;

	const otherUser = participants.find((p) => p.userId?._id?.toString() !== currentUserId);
	const otherUserId = otherUser?.userId?._id;

	const isBlockedByMe = blockedUsers.some((u) => u._id === otherUserId);
	const isBlockedByOther = otherUserId && blockedBy.includes(otherUserId);

	const resolveType = (text: string): MessageType => {
		if (attachment) return attachment.type;
		if (text && isUrl(text)) return "link";
		return "text";
	};

	const handleSend = async () => {
		const trimmed = value.trim();
		const type = resolveType(trimmed);

		if (type === "text" && !trimmed && !attachment) return;
		if ((type === "image" || type === "file" || type === "audio") && !attachment?.file) return;

		const currValue = trimmed;
		const prevAttachment = attachment;
		const prevMentions = selectedMentions;
		setValue("");
		if (textInputRef.current) {
			textInputRef.current.style.height = "auto";
		}
		setAttachment(null);
		setIsRecording(false);
		setSelectedMentions([]);
		setMentionOpen(false);
		setMentionQuery("");
		setMentionRange(null);
		emitStopTyping(selectedConvo._id);
		if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
		if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
		clearDraft(selectedConvo._id);

		const payload: Parameters<typeof sendMessage>[0] = { type };

		if (selectedConvo.type === "direct") {
			payload.recipientId = otherUserId as string;
		} else {
			payload.conversationId = selectedConvo._id;
		}

		const tokenized = buildMentionsFromText(currValue, prevMentions);
		if (tokenized.content) payload.content = tokenized.content;
		if (attachment?.file) payload.file = attachment.file;
		if (tokenized.mentions.length > 0) payload.mentions = tokenized.mentions;

		setSending(true);

		try {
			await sendMessage(payload, (_pct) => {
			});
		} catch (error: any) {
			const isModerationError =
				error?.response?.data?.moderation ||
				error?.message?.toLowerCase().includes("tiêu chuẩn cộng đồng");

			if (isModerationError) {
				setValue("");
				setAttachment(null);

				toast.error(
					error?.response?.data?.message ||
					"Tin nhắn vi phạm tiêu chuẩn cộng đồng."
				);
			} else {
				setValue(currValue);
				setAttachment(prevAttachment);
				setSelectedMentions(prevMentions);

				toast.error(
					error?.message ?? "Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại!"
				);
			}
		} finally {
			setSending(false);
			setTimeout(() => textInputRef.current?.focus(), 0);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (mentionOpen && mentionCandidates.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setActiveMentionIndex((current) => (current + 1) % mentionCandidates.length);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setActiveMentionIndex((current) => (current - 1 + mentionCandidates.length) % mentionCandidates.length);
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				const selectedCandidate = mentionCandidates[activeMentionIndex] ?? mentionCandidates[0];
				if (selectedCandidate) {
					insertMention(selectedCandidate);
				}
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setMentionOpen(false);
				setMentionQuery("");
				setMentionRange(null);
				return;
			}
		}

		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const insertMention = useCallback((candidate: MentionCandidate) => {
		const range = mentionRange ?? { start: value.length, end: value.length };
		const mentionText = `@${candidate.displayName}`;
		const nextValue = `${value.slice(0, range.start)}${mentionText} ${value.slice(range.end)}`;
		const nextCursor = range.start + mentionText.length + 1;

		setValue(nextValue);
		setSelectedMentions((current) => {
			const filtered = current.filter((item) => item.userId !== candidate.userId);
			return [...filtered, candidate];
		});
		setMentionOpen(false);
		setMentionQuery("");
		setMentionRange(null);
		setActiveMentionIndex(0);

		requestAnimationFrame(() => {
			const textarea = textInputRef.current;
			if (!textarea) return;
			textarea.focus();
			textarea.setSelectionRange(nextCursor, nextCursor);
		});
	}, [mentionRange, value]);

	const handleMentionSelect = (candidate: MentionCandidate) => {
		insertMention(candidate);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const nextValue = e.target.value;
		setValue(nextValue);
		e.target.style.height = "auto";
		e.target.style.height = `${e.target.scrollHeight}px`;

		const cursor = e.target.selectionStart ?? nextValue.length;
		const activeToken = getActiveMentionToken(nextValue, cursor);
		if (activeToken) {
			setMentionOpen(true);
			setMentionQuery(activeToken.query);
			setMentionRange({ start: activeToken.start, end: activeToken.end });
			setActiveMentionIndex(0);
		} else {
			setMentionOpen(false);
			setMentionQuery("");
			setMentionRange(null);
			setActiveMentionIndex(0);
		}

		if (nextValue.trim()) {
			emitTyping(selectedConvo._id);
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
			typingTimeoutRef.current = setTimeout(() => emitStopTyping(selectedConvo._id), 2000);
		} else {
			emitStopTyping(selectedConvo._id);
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
		}

		// Handle Draft
		if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
		draftTimeoutRef.current = setTimeout(() => {
			if (nextValue.trim()) {
				setDraft(selectedConvo._id, nextValue);
			} else {
				clearDraft(selectedConvo._id);
			}
		}, 300);
	};

	useEffect(() => {
		return () => {
			if (attachment?.preview) {
				URL.revokeObjectURL(attachment.preview);
			}
		};
	}, [attachment]);

	useEffect(() => {
		const existingDraft = useChatStore.getState().drafts[selectedConvo._id] || "";
		setValue(existingDraft);
		setAttachment(null);
		setSelectedMentions([]);
		setMentionOpen(false);
		setMentionQuery("");
		setMentionRange(null);

		// Focus and adjust height for draft
		if (existingDraft && textInputRef.current) {
			setTimeout(() => {
				if (textInputRef.current) {
					textInputRef.current.style.height = "auto";
					textInputRef.current.style.height = `${textInputRef.current.scrollHeight}px`;
					textInputRef.current.focus();
				}
			}, 0);
		}
	}, [selectedConvo._id]);

	const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const items = Array.from(e.clipboardData?.items || []);

		const imageItem = items.find((item) => item.type.startsWith("image/"));
		if (!imageItem) return;

		e.preventDefault();

		const file = imageItem.getAsFile();
		if (!file) {
			toast.error("Không đọc được ảnh từ clipboard.");
			return;
		}

		// Nếu đang có attachment cũ thì dọn preview cũ trước
		if (attachment?.preview) {
			URL.revokeObjectURL(attachment.preview);
		}

		// Đặt tên file dễ nhìn hơn
		const extension = file.type.split("/")[1] || "png";
		const pastedImage = new File(
			[file],
			`pasted-image-${Date.now()}.${extension}`,
			{ type: file.type, lastModified: Date.now() }
		);

		attachImage(pastedImage);
	};

	const attachImage = (file: File) => {
		if (!file.type.startsWith("image/")) {
			toast.error("Chỉ hỗ trợ file ảnh (jpg, png, gif, webp…)");
			return;
		}
		if (file.size > MAX_IMAGE_SIZE) {
			toast.error(`Ảnh quá lớn — tối đa ${formatBytes(MAX_IMAGE_SIZE)}`);
			return;
		}

		// cleanup preview cũ nếu có
		if (attachment?.preview) {
			URL.revokeObjectURL(attachment.preview);
		}

		setLoadingLocal(true);
		setTimeout(() => {
			setAttachment({ type: "image", file, preview: URL.createObjectURL(file) });
			setLoadingLocal(false);
		}, 400);
	};

	const attachFile = (file: File) => {
		if (file.type.startsWith("image/")) {
			return attachImage(file);
		}

		if (file.size > MAX_FILE_SIZE) {
			toast.error(`File quá lớn! Tối đa ${formatBytes(MAX_FILE_SIZE)}, file của bạn: ${formatBytes(file.size)}`);
			return;
		}

		setLoadingLocal(true);
		setTimeout(() => {
			setAttachment({ type: "file", file });
			setLoadingLocal(false);
		}, 400);
	};

	/** Gửi trực tiếp một audio file (từ VoiceRecorder) */
	const sendAudio = useCallback(async (file: File) => {
		setIsRecording(false);

		const currValue = value;
		const prevAttachment = attachment;
		const prevMentions = selectedMentions;

		const payload: Parameters<typeof sendMessage>[0] = { type: "audio", file };

		if (selectedConvo.type === "direct") {
			payload.recipientId = otherUserId as string;
		} else {
			payload.conversationId = selectedConvo._id;
		}

		setSending(true);
		try {
			await sendMessage(payload);
		} catch (error: any) {
			const isModerationError =
				error?.response?.data?.moderation ||
				error?.message?.toLowerCase().includes("tiêu chuẩn cộng đồng");

			if (isModerationError) {
				setValue("");
				setAttachment(null);

				toast.error(
					error?.response?.data?.message ||
					"Tin nhắn vi phạm tiêu chuẩn cộng đồng."
				);
			} else {
				setValue(currValue);
				setAttachment(prevAttachment);
				setSelectedMentions(prevMentions);

				toast.error(
					error?.message ?? "Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại!"
				);
			}
		} finally {
			setSending(false);
			setTimeout(() => textInputRef.current?.focus(), 0);
		}
	}, [selectedConvo, otherUserId, sendMessage]);

	const handleStickerSelect = async (url: string) => {
		const payload: Parameters<typeof sendMessage>[0] = {
			type: "sticker",
			content: url
		};

		if (selectedConvo.type === "direct") {
			payload.recipientId = otherUserId as string;
		} else {
			payload.conversationId = selectedConvo._id;
		}

		setSending(true);
		try {
			await sendMessage(payload);
		} catch {
			toast.error("Gửi sticker thất bại. Vui lòng thử lại!");
		} finally {
			setSending(false);
			setTimeout(() => textInputRef.current?.focus(), 0);
		}
	};

	const removeAttachment = () => {
		if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
		setAttachment(null);
	};

	if (selectedConvo.type === "direct") {
		if (isBlockedByMe) {
			return (
				<div className="flex items-center justify-center p-4 bg-muted/30 border-t border-border/50">
					<p className="text-sm text-muted-foreground italic">Bạn đã chặn người dùng này.</p>
				</div>
			);
		}
		if (isBlockedByOther) {
			return (
				<div className="flex items-center justify-center p-4 bg-muted/30 border-t border-border/50">
					<p className="text-sm text-muted-foreground italic">Bạn không thể gửi tin nhắn cho người này.</p>
				</div>
			);
		}
	}

	if (selectedConvo.type === "group" && selectedConvo.disbanded === true) {
		return (
			<div className="flex items-center justify-center p-4 bg-red-50 dark:bg-red-950/20 border-t border-red-100 dark:border-red-900/30">
				<p className="text-sm text-red-500 font-medium italic">Nhóm đã giải tán</p>
			</div>
		);
	}

	const canSend = !sending && (attachment !== null || value.trim().length > 0);

	return (
		<div className="flex flex-col bg-background border-t border-border/50">

			{replyingTo && (
				<div className="flex items-center gap-2 px-3 pt-2.5 pb-1 animate-in slide-in-from-bottom-2 duration-200">
					<div className="flex-1 min-w-0 flex items-center gap-2.5 border-l-[3px] border-blue-500 bg-blue-500/8 dark:bg-blue-400/10 rounded-r-lg px-3 py-2">
						<Reply className="size-4 text-blue-500 dark:text-blue-400 shrink-0 rotate-180" />
						<div className="flex flex-col min-w-0">
							<span className="text-[12px] font-bold text-blue-600 dark:text-blue-400 truncate">
								Đang trả lời
							</span>
							<div className="flex items-center gap-2">
								{replyingTo.type === "sticker" && replyingTo.content && (
									<img
										src={replyingTo.content}
										alt="sticker-reply"
										className="size-8 rounded-md object-contain bg-white/10"
									/>
								)}
								<span className="text-[11px] text-muted-foreground truncate leading-snug mt-px">
									{replyingTo.isRecalled
										? "Tin nhắn đã thu hồi"
										: replyingTo.type === "image"
											? "Hình ảnh"
											: replyingTo.type === "sticker"
												? "Nhãn dán"
												: replyingTo.type === "audio"
													? "🎙️ Tin nhắn thoại"
													: replyingTo.type === "file"
														? (replyingTo.fileName ?? "Tệp đính kèm")
														: (replyingTo.content && replyingTo.content.length > 50
															? replyingTo.content.slice(0, 50) + "…"
															: replyingTo.content ?? "")}
								</span>
							</div>
						</div>
					</div>
					<button
						onClick={() => setReplyingTo(null)}
						className="p-1.5 rounded-full hover:bg-muted/80 transition-colors shrink-0"
						title="Hủy trả lời"
					>
						<X className="size-4 text-muted-foreground hover:text-foreground transition-colors" />
					</button>
				</div>
			)}

			{loadingLocal && <ProgressBar percent={100} label="Đang tải" />}

			{attachment && (
				<div className="flex items-center gap-2 px-3 pt-2.5">
					{attachment.type === "image" && attachment.preview ? (
						<div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border/50 shrink-0">
							<img src={attachment.preview} alt="preview" className="w-full h-full object-cover" />
							<button
								onClick={removeAttachment}
								className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 hover:bg-black/80 transition-colors"
							>
								<X className="size-3 text-white" />
							</button>
						</div>
					) : attachment.type === "audio" && attachment.preview ? (
						<div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2 text-sm max-w-xs w-full">
							<audio controls src={attachment.preview} className="h-8 w-48" />
							<button onClick={removeAttachment} className="ml-1 hover:text-destructive transition-colors shrink-0">
								<X className="size-4" />
							</button>
						</div>
					) : (
						<div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2 text-sm max-w-xs">
							<FileText className="size-4 text-primary shrink-0" />
							<div className="flex flex-col min-w-0">
								<span className="truncate font-medium text-foreground">{attachment.file.name}</span>
								<span className="text-xs text-muted-foreground">{formatBytes(attachment.file.size)}</span>
							</div>
							<button onClick={removeAttachment} className="ml-1 hover:text-destructive transition-colors shrink-0">
								<X className="size-4" />
							</button>
						</div>
					)}
				</div>
			)}

			<div className="flex items-center gap-1.5 p-2 bg-background border-t border-border/40 relative z-10">

				<input
					ref={imageInputRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={(e) => { const f = e.target.files?.[0]; if (f) attachImage(f); e.target.value = ""; }}
				/>
				<input
					ref={fileInputRef}
					type="file"
					className="hidden"
					onChange={(e) => { const f = e.target.files?.[0]; if (f) attachFile(f); e.target.value = ""; }}
				/>

				<Button
					variant="ghost" size="icon"
					className="size-9 shrink-0 hover:bg-primary/10 transition-colors"
					title="Gửi ảnh"
					onClick={() => imageInputRef.current?.click()}
					disabled={sending}
				>
					<ImagePlus className="size-4" />
				</Button>

				<Button
					variant="ghost" size="icon"
					className="size-9 shrink-0 hover:bg-primary/10 transition-colors"
					title="Gửi file"
					onClick={() => fileInputRef.current?.click()}
					disabled={sending}
				>
					<Paperclip className="size-4" />
				</Button>

				{!isRecording && (
					<Button
						type="button"
						variant="ghost" size="icon"
						className="size-9 shrink-0 hover:bg-primary/10 hover:text-primary transition-colors"
						title="Ghi âm"
						onClick={() => setIsRecording(true)}
						disabled={sending}
					>
						<Mic className="size-4" />
					</Button>
				)}

				{!isRecording && (
					<StickerPickerPopover onSelect={handleStickerSelect} />
				)}

				{isRecording ? (
					<VoiceRecorder
						onSend={sendAudio}
						onCancel={() => setIsRecording(false)}
					/>
				) : (
					<div className="flex-1 relative flex items-center">
						<textarea
							ref={textInputRef}
							onKeyDown={handleKeyDown}
							value={value}
							onChange={handleInputChange}
							onPaste={handlePaste}
							onFocus={() => markAsSeen()}
							rows={1}
							placeholder={
								attachment
									? "Thêm chú thích (tuỳ chọn)…"
									: "Soạn tin nhắn"
							}
							className="pr-12 py-[8px] min-h-[36px] max-h-32 resize-none overflow-y-auto bg-white dark:bg-muted border border-border/50 focus:border-primary/50 transition-colors w-full rounded-md px-3 text-sm shadow-xs outline-none scrollbar-none"
							disabled={sending}
						/>

						{mentionOpen && (
							<div className="absolute left-0 bottom-full mb-2 z-40 w-60 max-w-full border border-border/60 bg-popover shadow-lg overflow-hidden rounded-sm">
								{mentionCandidates.length > 0 ? (
									<ul className="max-h-56 overflow-y-auto py-1">
										{mentionCandidates.map((candidate, index) => {
											const isActive = index === activeMentionIndex;
											return (
												<li key={candidate.userId}>
													<button
														type="button"
														onMouseDown={(event) => event.preventDefault()}
														onClick={() => handleMentionSelect(candidate)}
														className={`w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors rounded-sm ${isActive ? "bg-primary/10" : "hover:bg-muted/70"}`}
													>
														<span className="size-6 rounded-sm overflow-hidden shrink-0 bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
															{candidate.avatarUrl ? (
																<img src={candidate.avatarUrl} alt={candidate.displayName} className="w-full h-full object-cover" />
															) : (
																candidate.displayName.charAt(0).toUpperCase()
															)}
														</span>
														<div className="min-w-0">
															<span className="text-sm font-medium text-foreground truncate">{candidate.displayName}</span>
														</div>
													</button>
												</li>
											);
										})}
									</ul>
								) : (
									<div className="px-3 py-2.5 text-sm text-muted-foreground">Không tìm thấy thành viên phù hợp</div>
								)}
							</div>
						)}

						<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
							<Button asChild variant="ghost" size="icon" className="size-8 hover:bg-primary/10">
								<div>
									<EmojiPicker onChange={(emoji: string) => setValue(`${value}${emoji}`)} />
								</div>
							</Button>
						</div>
					</div>
				)}

				{!isRecording && (
					<Button
						onClick={handleSend}
						className="bg-gradient-chat hover:shadow-glow transition-all hover:scale-105 shrink-0"
						disabled={!canSend}
						size="icon"
						title="Gửi"
					>
						<Send className="size-4 text-white" />
					</Button>
				)}
			</div>
		</div>
	);
};

export default MessageInput;