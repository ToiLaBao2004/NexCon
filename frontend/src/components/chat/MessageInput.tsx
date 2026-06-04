import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation, Message, MessageType } from "@/types/chat";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "../ui/button";
import { useNavigate } from "react-router";
import EmojiPicker from "./EmojiPicker";
import VoiceRecorder from "./VoiceRecorder";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useImageViewerStore } from "@/stores/useImageViewerStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { toast } from "sonner";
import { Paperclip, ImagePlus, Send, X, FileText, Reply, Mic, UploadCloud, Loader2 } from "lucide-react";
import StickerPickerPopover from "./StickerPickerPopover";
import CachedStickerImage from "./CachedStickerImage";
import SecureImage from "../SecureImage";
import { getAvatarSrc } from "@/lib/avatar";
import { isUrl, formatBytes } from "@/lib/utils";
import { draftStorage } from "@/lib/draftStorage";
import { validateImageFile } from "@/lib/imageCrop";
import { buildModerationNotice, getModerationPayload, isModerationBlockError } from "@/lib/moderationNotice";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	buildMentionMessagePayload,
	decodeMentionTokens,
	getActiveMentionToken,
	insertMentionIntoText,
	isDraftMentionIntact,
	normalizeMentionSearch,
	reconcileDraftMentions,
	sanitizeDraftMentions,
	splitMentionMessagePayload,
	type DraftMention,
	type MentionCandidate,
	type MentionTokenRange,
} from "@/utils/mentions";


const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_ATTACHMENTS = 10;
const MAX_TEXT_MESSAGE_LENGTH = 1000;

interface Attachment {
	id: string;
	type: "image" | "file" | "audio";
	file: File;
	preview?: string;
	isLoading?: boolean;
}

const revokeAttachmentPreview = (attachment?: Attachment | null) => {
	if (attachment?.preview) {
		URL.revokeObjectURL(attachment.preview);
	}
};

const revokeAttachmentPreviews = (attachments: Attachment[]) => {
	attachments.forEach(revokeAttachmentPreview);
};

const createClientBatchId = () => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const createAttachmentId = () => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

function AttachmentLoadingOverlay() {
	return (
		<div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
			<Loader2 className="size-5 animate-spin text-primary" />
		</div>
	);
}

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
	const { user } = useAuthStore();
	const navigate = useNavigate();
	const isMobile = useIsMobile();
	const { emitTyping, emitStopTyping } = useSocketStore();
	const { sendMessage, markAsSeen, messages, replyingTo, setReplyingTo, setDraft, clearDraft } = useChatStore();
	const { blockedUsers, blockedBy, fetchBlockedList } = useFriendStore();
	const currentUserId = user?._id ?? "";

	const [value, setValue] = useState("");
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const [isRecording, setIsRecording] = useState(false);
	const [mentionQuery, setMentionQuery] = useState("");
	const [mentionRange, setMentionRange] = useState<MentionTokenRange | null>(null);
	const [mentionOpen, setMentionOpen] = useState(false);
	const [activeMentionIndex, setActiveMentionIndex] = useState(0);
	const [selectedMentions, setSelectedMentions] = useState<DraftMention[]>([]);
	const [isDraggingFiles, setIsDraggingFiles] = useState(false);
	const draftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const valueRef = useRef(value);
	const attachmentsRef = useRef<Attachment[]>([]);
	const dragDepthRef = useRef(0);

	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textInputRef = useRef<HTMLTextAreaElement>(null);
	const restoreInputFocusAfterSendRef = useRef(false);
	const handledPointerSendRef = useRef(false);
	const messageScrollSnapshotRef = useRef<{ element: HTMLElement; scrollTop: number } | null>(null);
	const messageScrollRestoreTimersRef = useRef<ReturnType<typeof window.setTimeout>[]>([]);

	const focusTextInput = useCallback(() => {
		textInputRef.current?.focus({ preventScroll: true });
	}, []);

	const getMessageScrollContainer = useCallback(() => {
		if (typeof document === "undefined") return null;
		const containers = Array.from(document.querySelectorAll<HTMLElement>("[data-chat-scroll-container]"));
		return containers.find((element) => element.dataset.chatScrollContainer === selectedConvo._id) ?? null;
	}, [selectedConvo._id]);

	const captureMessageScrollPosition = useCallback(() => {
		const element = getMessageScrollContainer();
		if (!element) return;
		messageScrollSnapshotRef.current = {
			element,
			scrollTop: element.scrollTop,
		};
	}, [getMessageScrollContainer]);

	const clearPendingMessageScrollRestore = useCallback(() => {
		messageScrollRestoreTimersRef.current.forEach((timer) => window.clearTimeout(timer));
		messageScrollRestoreTimersRef.current = [];
		messageScrollSnapshotRef.current = null;
	}, []);

	const restoreMessageScrollPosition = useCallback(() => {
		const snapshot = messageScrollSnapshotRef.current;
		if (!snapshot) return;
		messageScrollRestoreTimersRef.current.forEach((timer) => window.clearTimeout(timer));
		messageScrollRestoreTimersRef.current = [];

		window.dispatchEvent(new CustomEvent("nexcon:message-input-focus", {
			detail: { conversationId: selectedConvo._id },
		}));

		const restore = () => {
			if (!snapshot.element.isConnected) return;
			snapshot.element.scrollTop = snapshot.scrollTop;
		};

		restore();
		requestAnimationFrame(restore);
		messageScrollRestoreTimersRef.current.push(window.setTimeout(restore, 80));
		const finalTimer = window.setTimeout(() => {
			restore();
			if (messageScrollSnapshotRef.current?.element === snapshot.element) {
				messageScrollSnapshotRef.current = null;
			}
			messageScrollRestoreTimersRef.current = messageScrollRestoreTimersRef.current.filter((timer) => timer !== finalTimer);
		}, 180);
		messageScrollRestoreTimersRef.current.push(finalTimer);
	}, [selectedConvo._id]);

	const shouldRestoreTextInputAfterSend = useCallback(() => {
		const inputFocused = typeof document !== "undefined" && document.activeElement === textInputRef.current;
		const shouldRestore = !isMobile || inputFocused || restoreInputFocusAfterSendRef.current;
		restoreInputFocusAfterSendRef.current = false;
		return shouldRestore;
	}, [isMobile]);

	const showModerationBlockToast = useCallback((error: any) => {
		const payload = getModerationPayload(error);
		const notice = buildModerationNotice(payload);
		const targetPath = payload?.restriction?.type === "account_lock"
			? payload?.restriction?.appealUrl || "/signin"
			: payload?.restriction?.detailsUrl || "/moderation";

		toast.error(notice.title, {
			description: notice.description,
			duration: 12000,
			action: {
				label: "Xem chi tiết",
				onClick: () => navigate(targetPath),
			},
		});
	}, [navigate]);

	useEffect(() => {
		if (isMobile) return;

		const focusTimer = window.setTimeout(() => {
			focusTextInput();
		}, 0);

		return () => window.clearTimeout(focusTimer);
	}, [focusTextInput, isMobile, selectedConvo._id]);

	const participants = selectedConvo.participants;
	const attachment = attachments[0] ?? null;
	const replyingToImageBatch = useMemo(() => {
		if (!replyingTo || replyingTo.type !== "image") return [];

		const canPreview = (message: Message) =>
			message.type === "image"
			&& message.isRecalled !== true
			&& message.reportStatus !== true
			&& Boolean(message.filePublicId || message.fileUrl);
		const fallback = canPreview(replyingTo) ? [replyingTo] : [];
		const batchId = replyingTo.metadata?.clientBatchId?.trim();
		if (!batchId) return fallback;

		const batchItems = (messages[selectedConvo._id]?.items ?? [])
			.filter((message) =>
				message.metadata?.clientBatchId === batchId
				&& canPreview(message)
			)
			.sort((a, b) =>
				Number(a.metadata?.clientBatchIndex ?? 0) - Number(b.metadata?.clientBatchIndex ?? 0)
			);

		return batchItems.length > 0 ? batchItems : fallback;
	}, [messages, replyingTo, selectedConvo._id]);
	const visibleReplyingToImages = replyingToImageBatch.slice(0, 4);
	const hiddenReplyingToImageCount = Math.max(0, replyingToImageBatch.length - visibleReplyingToImages.length);
	const hasReplyingToImageThumbnail = visibleReplyingToImages.length > 0;
	const replyingToPreview = useMemo(() => {
		if (!replyingTo) return "";
		if (replyingTo.reportStatus) return "Tin nhắn vi phạm tiêu chuẩn cộng đồng";
		if (replyingTo.isRecalled) return "Tin nhắn đã thu hồi";
		if (replyingTo.type === "image") return "Hình ảnh";
		if (replyingTo.type === "sticker") return "Nhãn dán";
		if (replyingTo.type === "audio") return "Tin nhắn thoại";
		if (replyingTo.type === "file") return replyingTo.fileName ?? "Tệp đính kèm";

		const decoded = decodeMentionTokens(replyingTo.content ?? "", selectedConvo, replyingTo.mentions);
		return decoded.length > 50 ? `${decoded.slice(0, 50)}...` : decoded;
	}, [replyingTo, selectedConvo]);
	const mentionCandidates = useMemo(() => {
		const keyword = normalizeMentionSearch(mentionQuery);

		return participants
			.filter((participant) => participant.userId?._id?.toString() !== currentUserId)
			.filter((participant) => !participant.userId?.isLocked && !participant.userId?.lock?.isLocked)
			.map((participant) => ({
				userId: participant.userId._id,
				displayName: participant.userId.nickname?.trim() || participant.userId.displayName,
				canonicalDisplayName: participant.userId.displayName,
				avatarUrl: participant.userId.avatarUrl,
			}))
			.filter((participant) => {
				if (!keyword) return true;
				return (
					normalizeMentionSearch(participant.displayName).includes(keyword) ||
					normalizeMentionSearch(participant.canonicalDisplayName).includes(keyword)
				);
			});
	}, [currentUserId, mentionQuery, participants]);

	useEffect(() => {
		if (selectedConvo.type !== "direct") return;
		if (!user) return;
		void fetchBlockedList();
	}, [fetchBlockedList, selectedConvo.type, user]);

	const otherUser = participants.find((p) => p.userId?._id?.toString() !== currentUserId);
	const otherUserId = otherUser?.userId?._id;
	const isOtherUserLocked = Boolean(otherUser?.userId?.isLocked || otherUser?.userId?.lock?.isLocked);
	const conversationInputName = selectedConvo.type === "direct"
		? otherUser?.userId?.nickname?.trim() || otherUser?.userId?.displayName || "ng\u01b0\u1eddi d\u00f9ng"
		: selectedConvo.group?.name || "nh\u00f3m";
	const messageInputPlaceholder = `Nh\u1eadp tin nh\u1eafn t\u1edbi ${conversationInputName}`;
	const visibleMessageInputPlaceholder = isMobile ? "" : messageInputPlaceholder;

	const isBlockedByMe = blockedUsers.some((u) => u._id === otherUserId);
	const isBlockedByOther = otherUserId && blockedBy.includes(otherUserId);

	const resolveType = (text: string): MessageType => {
		if (attachments.length > 0) return attachments[0].type;
		if (text && isUrl(text)) return "link";
		return "text";
	};

	const shouldRestoreFailedPayload = () => valueRef.current.length === 0 && attachmentsRef.current.length === 0;

	const handleSend = async () => {
		const trimmed = value.trim();
		const type = resolveType(trimmed);
		const currentAttachments = attachments;

		if (type === "text" && !trimmed && currentAttachments.length === 0) {
			restoreInputFocusAfterSendRef.current = false;
			return;
		}
		if ((type === "image" || type === "file" || type === "audio") && currentAttachments.length === 0) {
			restoreInputFocusAfterSendRef.current = false;
			return;
		}
		clearPendingMessageScrollRestore();
		window.dispatchEvent(new CustomEvent("nexcon:message-send", {
			detail: { conversationId: selectedConvo._id },
		}));

		const currValue = value;
		const prevAttachments = currentAttachments;
		const prevMentions = selectedMentions;
		const shouldRestoreFocus = shouldRestoreTextInputAfterSend();
		const tokenized = buildMentionMessagePayload(currValue, prevMentions);
		const textChunks = splitMentionMessagePayload(
			tokenized.content,
			tokenized.mentions,
			MAX_TEXT_MESSAGE_LENGTH,
		);
		const withTarget = (payload: Parameters<typeof sendMessage>[0]) => {
			if (selectedConvo.type === "direct") {
				payload.recipientId = otherUserId as string;
			} else {
				payload.conversationId = selectedConvo._id;
			}
			return payload;
		};
		valueRef.current = "";
		setValue("");
		if (textInputRef.current) {
			textInputRef.current.style.height = "auto";
		}
		attachmentsRef.current = [];
		setAttachments([]);
		setIsRecording(false);
		setSelectedMentions([]);
		setMentionOpen(false);
		setMentionQuery("");
		setMentionRange(null);
		emitStopTyping(selectedConvo._id);
		if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
		if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
		clearDraft(selectedConvo._id);
		draftStorage.delete(selectedConvo._id);

		let nextTextChunkIndex = 0;
		let attachmentsSent = false;

		const applyTextChunk = (
			payload: Parameters<typeof sendMessage>[0],
			chunk?: (typeof textChunks)[number],
		) => {
			if (!chunk) return payload;
			payload.content = chunk.content;
			if (chunk.mentions.length > 0) payload.mentions = chunk.mentions;
			return payload;
		};

		const sendTextChunks = async (startIndex: number) => {
			for (let index = startIndex; index < textChunks.length; index += 1) {
				const chunk = textChunks[index];
				const chunkType = type === "link" && textChunks.length === 1 ? "link" : "text";
				await sendMessage(applyTextChunk(withTarget({ type: chunkType }), chunk));
				nextTextChunkIndex = index + 1;
			}
		};

		const getRestoredTextDraft = (skipFailedChunk: boolean) => {
			const restoreStartIndex = Math.min(
				textChunks.length,
				nextTextChunkIndex + (skipFailedChunk ? 1 : 0),
			);

			if (restoreStartIndex === 0) {
				return { value: currValue, mentions: prevMentions };
			}

			return {
				value: textChunks
					.slice(restoreStartIndex)
					.map((chunk) => decodeMentionTokens(chunk.content, selectedConvo, chunk.mentions))
					.join("\n"),
				mentions: [],
			};
		};

		try {
			if (prevAttachments.length > 0) {
				const imageBatchId = prevAttachments.length > 1 && prevAttachments.every((item) => item.type === "image")
					? createClientBatchId()
					: null;
				const isImageBatch = Boolean(imageBatchId);

				const sendTasks = prevAttachments.map((item, index) => {
					const payload = withTarget({ type: item.type, file: item.file });

					if (index === 0 || isImageBatch) {
						applyTextChunk(payload, textChunks[0]);
					}
					if (replyingTo?._id && isImageBatch) {
						payload.replyToMessageId = replyingTo._id;
					}
					if (imageBatchId) {
						payload.metadata = {
							clientBatchId: imageBatchId,
							clientBatchIndex: index,
							clientBatchSize: prevAttachments.length,
						};
					}

					return sendMessage(payload);
				});

				const results = await Promise.allSettled(sendTasks);
				const isFilteredError = (reason: any) => isModerationBlockError(reason);
				const fulfilledCount = results.filter((result) => result.status === "fulfilled").length;
				const filteredCount = results.filter((result) =>
					result.status === "rejected" && isFilteredError(result.reason)
				).length;
				const firstUploadError = results.find((result) =>
					result.status === "rejected" && !isFilteredError(result.reason)
				);

				if (filteredCount > 0) {
					toast.warning(`Đã lọc ra ${filteredCount} ảnh không hợp lệ.`);
				}
				if (firstUploadError?.status === "rejected") {
					throw firstUploadError.reason;
				}

				attachmentsSent = true;
				if (textChunks[0] && fulfilledCount > 0) {
					nextTextChunkIndex = 1;
				}
				await sendTextChunks(nextTextChunkIndex);
			} else {
				await sendTextChunks(0);
			}

			revokeAttachmentPreviews(prevAttachments);
		} catch (error: any) {
			if (
				!attachmentsSent
				&& prevAttachments.length > 1
				&& prevAttachments.every((item) => item.type === "image")
			) {
				revokeAttachmentPreviews(prevAttachments);
				if (shouldRestoreFailedPayload()) {
					valueRef.current = "";
					attachmentsRef.current = [];
					setValue("");
					setAttachments([]);
					setSelectedMentions([]);
				}
				toast.error(
					error?.message ?? "Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại!"
				);
				return;
			}

			const isModerationError = isModerationBlockError(error);
			const restoredTextDraft = getRestoredTextDraft(isModerationError);
			const restoredAttachments = attachmentsSent || isModerationError ? [] : prevAttachments;

			if (attachmentsSent || isModerationError) {
				revokeAttachmentPreviews(prevAttachments);
			}

			if (isModerationError) {
				if (shouldRestoreFailedPayload()) {
					valueRef.current = restoredTextDraft.value;
					attachmentsRef.current = restoredAttachments;
					setValue(restoredTextDraft.value);
					setAttachments(restoredAttachments);
					setSelectedMentions(restoredTextDraft.mentions);
				}

				showModerationBlockToast(error);
			} else {
				if (shouldRestoreFailedPayload()) {
					valueRef.current = restoredTextDraft.value;
					attachmentsRef.current = restoredAttachments;
					setValue(restoredTextDraft.value);
					setAttachments(restoredAttachments);
					setSelectedMentions(restoredTextDraft.mentions);
				}

				toast.error(
					error?.message ?? "Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại!"
				);
			}
		} finally {
			if (shouldRestoreFocus) {
				setTimeout(focusTextInput, 0);
			}
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
		const nextDraft = insertMentionIntoText({
			text: value,
			range,
			candidate,
			mentions: selectedMentions,
		});

		valueRef.current = nextDraft.text;
		setValue(nextDraft.text);
		setSelectedMentions(nextDraft.mentions);
		setMentionOpen(false);
		setMentionQuery("");
		setMentionRange(null);
		setActiveMentionIndex(0);

		requestAnimationFrame(() => {
			const textarea = textInputRef.current;
			if (!textarea) return;
			textarea.focus();
			textarea.setSelectionRange(nextDraft.cursor, nextDraft.cursor);
		});
	}, [mentionRange, selectedMentions, value]);

	const handleMentionSelect = (candidate: MentionCandidate) => {
		insertMention(candidate);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		captureMessageScrollPosition();
		const previousValue = valueRef.current;
		const nextValue = e.target.value;
		valueRef.current = nextValue;
		setValue(nextValue);
		setSelectedMentions((current) => reconcileDraftMentions(previousValue, nextValue, current));
		e.target.style.height = "auto";
		e.target.style.height = `${e.target.scrollHeight}px`;

		const cursor = e.target.selectionStart ?? nextValue.length;
		const activeToken = getActiveMentionToken(nextValue, cursor);
		if (activeToken) {
			setMentionOpen(true);
			setMentionQuery(activeToken.query);
			setMentionRange(activeToken);
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

		restoreMessageScrollPosition();
	};

	useEffect(() => {
		return () => {
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
				typingTimeoutRef.current = null;
			}
			emitStopTyping(selectedConvo._id);
		};
	}, [emitStopTyping, selectedConvo._id]);

	useEffect(() => {
		if (!user) return;
		if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);

		draftTimeoutRef.current = setTimeout(() => {
			const persistedAttachment = attachments.length === 1 ? attachments[0] : null;

			if (value.trim() || attachments.length > 0) {
				setDraft(selectedConvo._id, {
					content: value,
					type: attachments.length > 0 ? attachments[0].type : (isUrl(value) ? "link" : "text"),
					attachment: persistedAttachment ? {
						type: persistedAttachment.type,
						file: persistedAttachment.file,
						preview: persistedAttachment.preview
					} : null,
					mentions: selectedMentions.filter((mention) => isDraftMentionIntact(value, mention)),
				});
				if (persistedAttachment) {
					draftStorage.save(selectedConvo._id, persistedAttachment.file, persistedAttachment.type);
				} else {
					draftStorage.delete(selectedConvo._id);
				}
			} else {
				clearDraft(selectedConvo._id);
				draftStorage.delete(selectedConvo._id);
			}
		}, 300);

		return () => {
			if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
		};
	}, [value, attachments, selectedMentions, selectedConvo._id, setDraft, clearDraft, user]);

	useEffect(() => {
		valueRef.current = value;
	}, [value]);

	useEffect(() => {
		attachmentsRef.current = attachments;
	}, [attachments]);

	useEffect(() => () => {
		clearPendingMessageScrollRestore();
		revokeAttachmentPreviews(attachmentsRef.current);
	}, [clearPendingMessageScrollRestore]);

	useEffect(() => {
		if (!user) return;
		const rawDraft = useChatStore.getState().drafts[selectedConvo._id];
		const existingDraft = typeof rawDraft === "string" ? rawDraft : (rawDraft?.content || "");
		const draftAttachment = (rawDraft && typeof rawDraft === 'object') ? rawDraft.attachment : null;
		const draftMentions = (rawDraft && typeof rawDraft === 'object')
			? sanitizeDraftMentions(rawDraft.mentions, existingDraft)
			: [];

		setAttachments((current) => {
			revokeAttachmentPreviews(current);
			return [];
		});
		attachmentsRef.current = [];
		valueRef.current = existingDraft;
		setValue(existingDraft);

		if (draftAttachment && draftAttachment.file) {
			const preview = draftAttachment.type === 'image'
				? URL.createObjectURL(draftAttachment.file)
				: undefined;

			const nextAttachments = [{
				id: createAttachmentId(),
				type: draftAttachment.type,
				file: draftAttachment.file,
				preview: preview,
				isLoading: false
			}];
			attachmentsRef.current = nextAttachments;
			setAttachments(nextAttachments);
		} else {
			draftStorage.get(selectedConvo._id).then((stored) => {
				if (stored) {
					const preview = stored.type === 'image'
						? URL.createObjectURL(stored.file)
						: undefined;
					const nextAttachments = [{
						id: createAttachmentId(),
						type: stored.type,
						file: stored.file,
						preview,
						isLoading: false
					}];
					attachmentsRef.current = nextAttachments;
					setAttachments(nextAttachments);
				} else {
					attachmentsRef.current = [];
					setAttachments([]);
				}
			});
		}

		setSelectedMentions(draftMentions);
		setMentionOpen(false);
		setMentionQuery("");
		setMentionRange(null);

		if (existingDraft && textInputRef.current) {
			setTimeout(() => {
				if (textInputRef.current) {
					textInputRef.current.style.height = "auto";
					textInputRef.current.style.height = `${textInputRef.current.scrollHeight}px`;
					if (!isMobile) {
						focusTextInput();
					}
				}
			}, 0);
		}
	}, [focusTextInput, isMobile, selectedConvo._id, user]);

	useEffect(() => {
		if (!user) return;
		if (replyingTo && textInputRef.current) {
			const timer = setTimeout(() => {
				focusTextInput();
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [focusTextInput, replyingTo, user]);

	const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const items = Array.from(e.clipboardData?.items || []);

		const imageItems = items.filter((item) => item.type.startsWith("image/"));
		if (imageItems.length === 0) {
			return;
		}

		e.preventDefault();

		const pastedImages = imageItems
			.map((item, index) => {
				const file = item.getAsFile();
				if (!file) return null;
				const extension = file.type.split("/")[1] || "png";
				return new File(
					[file],
					`pasted-image-${Date.now()}-${index + 1}.${extension}`,
					{ type: file.type, lastModified: Date.now() }
				);
			})
			.filter((file): file is File => Boolean(file));

		if (pastedImages.length === 0) {
			toast.error("Không đọc được ảnh từ clipboard.");
			return;
		}

		attachImages(pastedImages);
	};

	const buildImageAttachment = (file: File, isLoading = false): Attachment => ({
		id: createAttachmentId(),
		type: "image",
		file,
		preview: URL.createObjectURL(file),
		isLoading,
	});

	const markAttachmentsReady = (attachmentIds: string[]) => {
		const readyIds = new Set(attachmentIds);

		setAttachments((current) => {
			const nextAttachments = current.map((item) =>
				readyIds.has(item.id) ? { ...item, isLoading: false } : item
			);
			attachmentsRef.current = nextAttachments;
			return nextAttachments;
		});
	};

	const attachImages = (files: File[]) => {
		const validFiles: File[] = [];
		for (const file of files) {
			const error = validateImageFile(file, { maxBytes: MAX_IMAGE_SIZE });
			if (error) {
				toast.error(error);
				continue;
			}
			validFiles.push(file);
		}

		if (validFiles.length === 0) return;

		const startsNewImageBatch = attachments.some((item) => item.type !== "image");
		const currentImageCount = startsNewImageBatch ? 0 : attachments.length;
		const availableSlots = MAX_IMAGE_ATTACHMENTS - currentImageCount;

		if (availableSlots <= 0) {
			toast.error(`Chỉ có thể gửi tối đa ${MAX_IMAGE_ATTACHMENTS} ảnh một lần.`);
			return;
		}

		const nextFiles = validFiles.slice(0, availableSlots);
		const nextImageAttachments = nextFiles.map((file) => buildImageAttachment(file, true));
		const loadingAttachmentIds = nextImageAttachments.map((item) => item.id);
		if (validFiles.length > availableSlots) {
			toast.warning(`Chỉ thêm ${availableSlots} ảnh đầu tiên.`);
		}

		setAttachments((current) => {
			const shouldReplace = current.some((item) => item.type !== "image");
			if (shouldReplace) {
				revokeAttachmentPreviews(current);
			}
			const base = shouldReplace ? [] : current;
			const nextAttachments = [...base, ...nextImageAttachments];
			attachmentsRef.current = nextAttachments;
			return nextAttachments;
		});
		setTimeout(() => {
			markAttachmentsReady(loadingAttachmentIds);
		}, 200);
	};

	const attachImage = (file: File) => {
		attachImages([file]);
	};

	const attachFile = (file: File) => {
		if (file.type.startsWith("image/")) {
			return attachImage(file);
		}

		if (file.size > MAX_FILE_SIZE) {
			toast.error(`File quá lớn! Tối đa ${formatBytes(MAX_FILE_SIZE)}, file của bạn: ${formatBytes(file.size)}`);
			return;
		}

		const nextFileAttachment: Attachment = {
			id: createAttachmentId(),
			type: "file",
			file,
			isLoading: true,
		};

		setAttachments((current) => {
			revokeAttachmentPreviews(current);
			const nextAttachments = [nextFileAttachment];
			attachmentsRef.current = nextAttachments;
			return nextAttachments;
		});
		setTimeout(() => {
			markAttachmentsReady([nextFileAttachment.id]);
		}, 400);
	};

	const hasFileDragData = (event: React.DragEvent<HTMLElement>) =>
		Array.from(event.dataTransfer.types).includes("Files");

	const handleAttachmentDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
		if (!hasFileDragData(event)) return;
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "copy";
		dragDepthRef.current += 1;
		setIsDraggingFiles(true);
	};

	const handleAttachmentDragOver = (event: React.DragEvent<HTMLDivElement>) => {
		if (!hasFileDragData(event)) return;
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "copy";
	};

	const handleAttachmentDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
		if (!hasFileDragData(event)) return;
		event.preventDefault();
		event.stopPropagation();
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
		if (dragDepthRef.current === 0) {
			setIsDraggingFiles(false);
		}
	};

	const handleAttachmentDrop = (event: React.DragEvent<HTMLDivElement>) => {
		if (!hasFileDragData(event)) return;
		event.preventDefault();
		event.stopPropagation();
		dragDepthRef.current = 0;
		setIsDraggingFiles(false);

		const droppedFiles = Array.from(event.dataTransfer.files ?? []);
		if (droppedFiles.length === 0) return;

		if (droppedFiles.every((file) => file.type.startsWith("image/"))) {
			attachImages(droppedFiles);
			return;
		}

		if (droppedFiles.length > 1) {
			toast.warning("Chỉ có thể thả nhiều ảnh cùng lúc. Đã chọn file đầu tiên.");
		}
		attachFile(droppedFiles[0]);
	};

	/** Gửi trực tiếp một audio file (từ VoiceRecorder) */
	const sendAudio = useCallback(async (file: File) => {
		setIsRecording(false);

		const currValue = value;
		const prevAttachments = attachments;
		const prevMentions = selectedMentions;
		const shouldRestoreFocus = shouldRestoreTextInputAfterSend();

		const payload: Parameters<typeof sendMessage>[0] = { type: "audio", file };

		if (selectedConvo.type === "direct") {
			payload.recipientId = otherUserId as string;
		} else {
			payload.conversationId = selectedConvo._id;
		}

		try {
			await sendMessage(payload);
		} catch (error: any) {
			const isModerationError = isModerationBlockError(error);

			if (isModerationError) {
				if (shouldRestoreFailedPayload()) {
					valueRef.current = "";
					attachmentsRef.current = [];
					setValue("");
					setAttachments([]);
				}

				showModerationBlockToast(error);
			} else {
				if (shouldRestoreFailedPayload()) {
					valueRef.current = currValue;
					attachmentsRef.current = prevAttachments;
					setValue(currValue);
					setAttachments(prevAttachments);
					setSelectedMentions(prevMentions);
				}

				toast.error(
					error?.message ?? "Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại!"
				);
			}
		} finally {
			if (shouldRestoreFocus) {
				setTimeout(focusTextInput, 0);
			}
		}
	}, [selectedConvo, otherUserId, sendMessage, value, attachments, selectedMentions, shouldRestoreTextInputAfterSend, focusTextInput, showModerationBlockToast]);

	const handleStickerSelect = async (url: string) => {
		const shouldRestoreFocus = shouldRestoreTextInputAfterSend();
		const payload: Parameters<typeof sendMessage>[0] = {
			type: "sticker",
			content: url
		};

		if (selectedConvo.type === "direct") {
			payload.recipientId = otherUserId as string;
		} else {
			payload.conversationId = selectedConvo._id;
		}

		try {
			await sendMessage(payload);
		} catch {
			toast.error("Gửi sticker thất bại. Vui lòng thử lại!");
		} finally {
			if (shouldRestoreFocus) {
				setTimeout(focusTextInput, 0);
			}
		}
	};

	const removeAttachment = (index: number) => {
		setAttachments((current) => {
			const removed = current[index];
			revokeAttachmentPreview(removed);
			const nextAttachments = current.filter((_, itemIndex) => itemIndex !== index);
			attachmentsRef.current = nextAttachments;
			return nextAttachments;
		});
	};

	const openAttachmentPreview = (item: Attachment) => {
		if (item.type !== "image" || !item.preview) return;
		useImageViewerStore.getState().openViewer({
			src: item.preview,
			downloadUrl: item.preview,
			alt: item.file.name || "image-preview",
		});
	};

	if (!user) return null;

	if (selectedConvo.type === "direct") {
		if (isOtherUserLocked) {
			return (
				<div className="flex items-center justify-center p-4 bg-muted/30 border-t border-border/80">
					<p className="text-sm text-muted-foreground italic">Không thể gửi tin nhắn tới tài khoản đã bị khóa.</p>
				</div>
			);
		}
		if (isBlockedByMe) {
			return (
				<div className="flex items-center justify-center p-4 bg-muted/30 border-t border-border/80">
					<p className="text-sm text-muted-foreground italic">Bạn đã chặn người dùng này.</p>
				</div>
			);
		}
		if (isBlockedByOther) {
			return (
				<div className="flex items-center justify-center p-4 bg-muted/30 border-t border-border/80">
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

	const canSend = attachments.length > 0 || value.trim().length > 0;
	const handleSendButtonPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		if (!isMobile || event.pointerType === "mouse" || !canSend) return;
		if (typeof document !== "undefined" && document.activeElement === textInputRef.current) {
			event.preventDefault();
			restoreInputFocusAfterSendRef.current = true;
			handledPointerSendRef.current = true;
			window.setTimeout(() => {
				handledPointerSendRef.current = false;
			}, 500);
			void handleSend();
		}
	};
	const handleSendButtonClick = () => {
		if (handledPointerSendRef.current) {
			handledPointerSendRef.current = false;
			return;
		}
		void handleSend();
	};

	return (
		<div
			className={`relative flex min-w-0 flex-col bg-background border-t border-border/80 pb-[env(safe-area-inset-bottom)] transition-colors md:pb-0 ${isDraggingFiles ? "bg-primary/5" : ""}`}
			onDragEnter={handleAttachmentDragEnter}
			onDragLeave={handleAttachmentDragLeave}
			onDragOver={handleAttachmentDragOver}
			onDrop={handleAttachmentDrop}
		>
			{isDraggingFiles && (
				<div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-background/90 shadow-sm backdrop-blur-sm">
					<div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
						<UploadCloud className="size-4 shrink-0" />
						<span>Thả file để đính kèm</span>
					</div>
				</div>
			)}

			{replyingTo && (
				<div className="flex items-center gap-2 px-3 pt-2.5 pb-1 animate-in slide-in-from-bottom-2 duration-200">
					<div className="flex-1 min-w-0 flex items-center gap-2.5 border-l-[3px] border-blue-500 bg-blue-500/8 dark:bg-blue-400/10 rounded-r-lg px-3 py-2">
						<Reply className="size-4 text-blue-500 dark:text-blue-400 shrink-0 rotate-180" />
						<div className="flex flex-col min-w-0">
							<span className="text-[12px] font-bold text-blue-600 dark:text-blue-400 truncate">
								Đang trả lời
							</span>
							<div className="flex items-center gap-2">
								{hasReplyingToImageThumbnail && (
									<div className="flex min-w-0 items-center gap-1">
										{visibleReplyingToImages.map((image) => (
											image.filePublicId ? (
												<SecureImage
													key={image._id}
													messageId={image._id}
													alt="reply-thumbnail"
													className="size-8 shrink-0 rounded-md border border-blue-200 object-cover dark:border-blue-400"
													fallbackMinSize={32}
													showFallbackText={false}
												/>
											) : (
												<img
													key={image._id}
													src={image.fileUrl!}
													alt="reply-thumbnail"
													className="size-8 shrink-0 rounded-md border border-blue-200 object-cover dark:border-blue-400"
												/>
											)
										))}
										{hiddenReplyingToImageCount > 0 && (
											<span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-600 dark:border-blue-400/70 dark:bg-blue-950/50 dark:text-blue-300">
												+{hiddenReplyingToImageCount}
											</span>
										)}
									</div>
								)}
								{replyingTo.type === "sticker" && replyingTo.content && (
									<CachedStickerImage
										src={replyingTo.content}
										alt="sticker-reply"
										className="size-8 rounded-md object-contain bg-white/10"
									/>
								)}
								{!hasReplyingToImageThumbnail && (
									<span className="text-[11px] text-muted-foreground truncate leading-snug mt-px">
										{replyingToPreview}
									</span>
								)}
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

			<div className="relative z-10 bg-background">

				<input
					ref={imageInputRef}
					type="file"
					accept="image/*"
					multiple
					className="hidden"
					onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) attachImages(files); e.target.value = ""; }}
				/>
				<input
					ref={fileInputRef}
					type="file"
					className="hidden"
					onChange={(e) => { const f = e.target.files?.[0]; if (f) attachFile(f); e.target.value = ""; }}
				/>

				<div className="flex h-9 min-w-0 items-center gap-0.5 px-2 md:gap-1.5 md:px-3">
				<Button
					variant="ghost" size="icon"
					className="size-9 shrink-0 hover:bg-primary/10 transition-colors"
					title="Gửi ảnh"
					onClick={() => imageInputRef.current?.click()}
				>
					<ImagePlus className="size-4" />
				</Button>

				<Button
					variant="ghost" size="icon"
					className="size-9 shrink-0 hover:bg-primary/10 transition-colors"
					title="Gửi file"
					onClick={() => fileInputRef.current?.click()}
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
					>
						<Mic className="size-4" />
					</Button>
				)}

				{!isRecording && (
					<StickerPickerPopover onSelect={handleStickerSelect} />
				)}
				</div>

				<div className="flex min-h-[48px] min-w-0 items-end gap-1.5 border-t border-border/60 px-2 py-1 md:min-h-[52px] md:gap-2 md:px-3 md:py-1.5">
				{isRecording ? (
					<VoiceRecorder
						onSend={sendAudio}
						onCancel={() => setIsRecording(false)}
					/>
				) : (
					<>
					<div className="relative flex min-w-0 flex-1 items-center rounded-2xl bg-muted/25 px-2.5 dark:bg-muted/20 md:px-3">
						<textarea
							ref={textInputRef}
							onPointerDown={captureMessageScrollPosition}
							onKeyDown={handleKeyDown}
							value={value}
							onChange={handleInputChange}
							onPaste={handlePaste}
							onFocus={() => {
								restoreMessageScrollPosition();
								markAsSeen();
							}}
							enterKeyHint="send"
							rows={1}
							aria-label={messageInputPlaceholder}
							placeholder={visibleMessageInputPlaceholder}
							className="beautiful-scrollbar min-h-10 max-h-32 w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-2 text-sm shadow-none outline-none transition-colors placeholder:text-[15px] placeholder:italic dark:bg-transparent md:min-h-11 md:py-2.5"
						/>
						{mentionOpen && (
							<div className="absolute bottom-full left-0 z-40 mb-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/70 bg-popover shadow-xl">
								{mentionCandidates.length > 0 ? (
									<ul className="beautiful-scrollbar max-h-64 overflow-y-auto p-1.5">
										{mentionCandidates.map((candidate, index) => {
											const isActive = index === activeMentionIndex;
											const hasNickname = candidate.displayName !== candidate.canonicalDisplayName;
											return (
												<li key={candidate.userId}>
													<button
														type="button"
														onMouseDown={(event) => event.preventDefault()}
														onClick={() => handleMentionSelect(candidate)}
														className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${isActive ? "bg-primary/10 text-primary" : "hover:bg-muted/70"}`}
													>
														<span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-1 ring-border/70">
															<img src={getAvatarSrc(candidate.avatarUrl)} alt={candidate.displayName} className="h-full w-full object-cover" />
														</span>
														<div className="min-w-0 flex-1">
															<span className="block truncate text-sm font-semibold text-foreground">{candidate.displayName}</span>
															{hasNickname && (
																<span className="block truncate text-xs text-muted-foreground">{candidate.canonicalDisplayName}</span>
															)}
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

					</div>
					<div className="flex shrink-0 items-end gap-1 pb-0.5 md:pb-1">
						<Button asChild variant="ghost" size="icon" className="size-8 rounded-full hover:bg-primary/10">
							<div>
								<EmojiPicker onChange={(emoji: string) => {
									const nextValue = `${value}${emoji}`;
									valueRef.current = nextValue;
									setValue(nextValue);
								}} />
							</div>
						</Button>
						<Button
							onPointerDown={handleSendButtonPointerDown}
							onClick={handleSendButtonClick}
							className="size-9 shrink-0 rounded-full bg-gradient-chat transition-all hover:scale-105 hover:shadow-glow"
							disabled={!canSend}
							size="icon"
							title="Gửi"
						>
							<Send className="size-4 text-white" />
						</Button>
					</div>
					</>
				)}
				</div>

				{attachments.length > 0 && (
					<div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
						{attachments.every((item) => item.type === "image") ? (
							<div className="flex max-w-full items-center gap-2 overflow-x-auto beautiful-scrollbar">
								{attachments.map((item, index) => (
									<div key={item.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border/80">
										<button
											type="button"
											onClick={() => openAttachmentPreview(item)}
											className="block h-full w-full cursor-zoom-in overflow-hidden bg-muted/40"
											title="Xem ảnh"
										>
											{item.preview && <img src={item.preview} alt={item.file.name || "preview"} className="h-full w-full object-cover" />}
											{item.isLoading && <AttachmentLoadingOverlay />}
										</button>
										<button
											type="button"
											onClick={() => removeAttachment(index)}
											className="absolute top-0.5 right-0.5 z-20 rounded-full bg-black/60 p-0.5 transition-colors hover:bg-black/80"
										>
											<X className="size-3 text-white" />
										</button>
									</div>
								))}
								{attachments.length > 1 && (
									<span className="shrink-0 text-xs text-muted-foreground">
										{attachments.length}/{MAX_IMAGE_ATTACHMENTS}
									</span>
								)}
							</div>
						) : attachment.type === "audio" && attachment.preview ? (
							<div className="flex w-full max-w-xs items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
								<audio controls src={attachment.preview} className="h-8 w-48" />
								<button onClick={() => removeAttachment(0)} className="ml-1 shrink-0 transition-colors hover:text-destructive">
									<X className="size-4" />
								</button>
							</div>
						) : (
							<div className="relative flex max-w-xs items-center gap-2 overflow-hidden rounded-md bg-muted/60 px-3 py-2 text-sm">
								<FileText className="size-4 shrink-0 text-primary" />
								<div className="flex min-w-0 flex-col">
									<span className="truncate font-medium text-foreground">{attachment.file.name}</span>
									<span className="text-xs text-muted-foreground">{formatBytes(attachment.file.size)}</span>
								</div>
								{attachment.isLoading && <AttachmentLoadingOverlay />}
								<button onClick={() => removeAttachment(0)} className="relative z-20 ml-1 shrink-0 transition-colors hover:text-destructive">
									<X className="size-4" />
								</button>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default MessageInput;
