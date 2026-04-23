import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation, MessageType } from "@/types/chat";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import EmojiPicker from "./EmojiPicker";
import VoiceRecorder from "./VoiceRecorder";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { toast } from "sonner";
import { Paperclip, ImagePlus, Send, X, FileText, Reply, Mic } from "lucide-react";
import { isUrl, formatBytes } from "@/lib/utils";


const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;



interface Attachment {
	type: "image" | "file" | "audio";
	file: File;
	preview?: string;
}

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
	const { sendMessage, markAsSeen, replyingTo, setReplyingTo } = useChatStore();
	const { blockedUsers, blockedBy } = useFriendStore();

	const [value, setValue] = useState("");
	const [attachment, setAttachment] = useState<Attachment | null>(null);
	const [sending, setSending] = useState(false);
	const [loadingLocal, setLoadingLocal] = useState(false);
	const [isRecording, setIsRecording] = useState(false);

	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textInputRef = useRef<HTMLTextAreaElement>(null);

	if (!user) return null;

	const participants = selectedConvo.participants;
	const otherUser = participants.find((p) => p.userId?._id?.toString() !== user._id.toString());
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
		setValue("");
		if (textInputRef.current) {
			textInputRef.current.style.height = "auto";
		}
		setAttachment(null);
		setIsRecording(false);
		emitStopTyping(selectedConvo._id);
		if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

		const payload: Parameters<typeof sendMessage>[0] = { type };

		if (selectedConvo.type === "direct") {
			payload.recipientId = otherUserId as string;
		} else {
			payload.conversationId = selectedConvo._id;
		}

		if (currValue) payload.content = currValue;
		if (attachment?.file) payload.file = attachment.file;

		setSending(true);

		try {
			await sendMessage(payload, (_pct) => {
				// Progress is now handled by the bubble in the store
			});
		} catch (error: any) {
			const isModerationError =
				error?.response?.data?.moderation ||
				error?.message?.toLowerCase().includes("tiêu chuẩn cộng đồng");

			if (isModerationError) {
				// ❌ KHÔNG restore lại nội dung
				setValue("");
				setAttachment(null);

				toast.error(
					error?.response?.data?.message ||
					"Tin nhắn vi phạm tiêu chuẩn cộng đồng."
				);
			} else {
				// ✅ lỗi bình thường → restore lại để user không bị mất text
				setValue(currValue);
				setAttachment(prevAttachment);

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
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setValue(e.target.value);
		e.target.style.height = "auto";
		e.target.style.height = `${e.target.scrollHeight}px`;
		if (e.target.value.trim()) {
			emitTyping(selectedConvo._id);
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
			typingTimeoutRef.current = setTimeout(() => emitStopTyping(selectedConvo._id), 2000);
		} else {
			emitStopTyping(selectedConvo._id);
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
		}
	};

	useEffect(() => {
		return () => {
			if (attachment?.preview) {
				URL.revokeObjectURL(attachment.preview);
			}
		};
	}, [attachment]);

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

		const payload: Parameters<typeof sendMessage>[0] = { type: "audio", file };

		if (selectedConvo.type === "direct") {
			payload.recipientId = otherUserId as string;
		} else {
			payload.conversationId = selectedConvo._id;
		}

		setSending(true);
		try {
			await sendMessage(payload);
		} catch {
			toast.error("Gửi tin nhắn thoại thất bại. Vui lòng thử lại!");
		} finally {
			setSending(false);
			setTimeout(() => textInputRef.current?.focus(), 0);
		}
	}, [selectedConvo, otherUserId, sendMessage]);

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
							<span className="text-[11px] text-muted-foreground truncate leading-snug mt-px">
								{replyingTo.isRecalled
									? "Tin nhắn đã thu hồi"
									: replyingTo.type === "image"
										? "Hình ảnh"
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