import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, Send, X, Check, Forward,
  FileText, Link2, ImageIcon, MessageSquare, AlertCircle,
} from "lucide-react";
import { StickerIcon } from "@/components/shared/StickerIcon";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Message, Conversation } from "@/types/chat";
import SecureImage from "@/components/SecureImage";
import UserAvatar from "./UserAvatar";
import GroupChatAvatar from "./GroupChatAvatar";
import { toast } from "sonner";

const createClientBatchId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

interface ForwardMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message;
  messages?: Message[];
}

// ─── Preview helpers ───────────────────────────────────────────────────────────
function getMessagePreview(message: Message): { text: string; Icon: React.ElementType } {
  if (message.isRecalled) return { text: "Tin nhắn đã được thu hồi", Icon: AlertCircle };
  switch (message.type) {
    case "image":
      return { text: message.fileName ?? "Hình ảnh", Icon: ImageIcon };
    case "file":
      return { text: message.fileName ?? "Tệp đính kèm", Icon: FileText };
    case "link":
      return { text: message.content ?? "Liên kết", Icon: Link2 };
    case "sticker":
      return { text: "Nhãn dán", Icon: StickerIcon };
    default:
      return { text: message.content ?? "(tin nhắn trống)", Icon: MessageSquare };
  }
}

// ─── Single conversation row ───────────────────────────────────────────────────
function ConversationRow({
  convo,
  currentUserId,
  selected,
  onToggle,
}: {
  convo: Conversation;
  currentUserId: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const isGroup = convo.type === "group";
  const otherUser = !isGroup
    ? convo.participants.find((p) => p.userId?._id?.toString() !== currentUserId)
    : null;
  const displayName = isGroup
    ? convo.group?.name ?? "Nhóm"
    : otherUser?.userId?.nickname?.trim()
    ? otherUser.userId.nickname!
    : otherUser?.userId?.displayName ?? "Người dùng";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group",
        selected
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted/50 border border-transparent"
      )}
    >
      {/* avatar */}
      <div className="relative shrink-0">
        {isGroup ? (
          <GroupChatAvatar
            participants={convo.participants}
            type="sidebar"
            groupAvatarUrl={convo.group?.avatarUrl}
          />
        ) : (
          <UserAvatar
            type="sidebar"
            name={displayName}
            avatarUrl={otherUser?.userId?.avatarUrl ?? undefined}
          />
        )}
      </div>

      {/* name + subtitle */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium truncate text-foreground">{displayName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {isGroup ? `${convo.participants.length} thành viên` : "Tin nhắn trực tiếp"}
        </p>
      </div>

      {/* checkbox circle */}
      <div
        className={cn(
          "shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-150",
          selected ? "bg-primary border-primary" : "border-border/70 bg-background group-hover:border-primary/40"
        )}
      >
        {selected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
      </div>
    </button>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
const ForwardMessageModal = ({ open, onOpenChange, message, messages }: ForwardMessageModalProps) => {
  const { conversations, forwardMessage } = useChatStore();
  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  const batchMessages = messages?.length ? messages : [message];
  const isImageBatch = batchMessages.length > 1 && batchMessages.every((item) => item.type === "image");
  const isSingleImage = batchMessages.length === 1 && message.type === "image" && (message.filePublicId || message.fileUrl);
  const { text: previewText, Icon: PreviewIcon } = getMessagePreview(message);
  const resolvedPreviewText = isImageBatch
    ? `${batchMessages.length} hình ảnh`
    : (isSingleImage ? "Hình ảnh" : previewText);

  // Filter: exclude disbanded groups, show only accessible conversations
  const filteredConversations = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      if (c.disbanded) return false;
      const isGroup = c.type === "group";
      const otherUser = !isGroup
        ? c.participants.find((p) => p.userId?._id?.toString() !== user?._id)
        : null;
      const name = isGroup
        ? c.group?.name ?? ""
        : otherUser?.userId?.nickname?.trim() || otherUser?.userId?.displayName || "";
      return !keyword || name.toLowerCase().includes(keyword);
    });
  }, [conversations, searchQuery, user?._id]);

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= 10) {
          toast.warning("Tối đa 10 cuộc trò chuyện mỗi lần chuyển tiếp");
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleClose = () => {
    setSearchQuery("");
    setSelectedIds(new Set());
    onOpenChange(false);
  };

  const handleSend = async () => {
    if (selectedIds.size === 0 || isSending) return;
    setIsSending(true);
    try {
      const targets = Array.from(selectedIds);
      const isImageBatch = batchMessages.length > 1 && batchMessages.every((item) => item.type === "image");
      const forwardBatchId = isImageBatch ? createClientBatchId() : null;
      const forwardBatchSize = isImageBatch ? batchMessages.length : 0;

      const results = await Promise.all(
        batchMessages.map((item, index) =>
          forwardMessage(
            item._id,
            targets,
            isImageBatch
              ? {
                clientBatchId: forwardBatchId,
                clientBatchIndex: index,
                clientBatchSize: forwardBatchSize,
              }
              : undefined
          )
        )
      );
      const result = {
        forwarded: Math.max(...results.map((item) => item.forwarded), 0),
        errors: results.flatMap((item) => item.errors),
      };

      if (result.forwarded > 0) {
        toast.success(
          result.forwarded === 1
            ? "Đã chuyển tiếp tin nhắn"
            : `Đã chuyển tiếp đến ${result.forwarded} cuộc trò chuyện`
        );
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} cuộc trò chuyện gửi thất bại`);
      }
      handleClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Chuyển tiếp thất bại");
    } finally {
      setIsSending(false);
    }
  };

  // Selected conversation pills
  const selectedConvos = useMemo(
    () => conversations.filter((c) => selectedIds.has(c._id)),
    [conversations, selectedIds]
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogPortal>
        <DialogOverlay className="z-[100000]" />
        <DialogPrimitive.Content className="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[100001] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 duration-200 outline-none sm:max-w-lg max-w-md p-0 overflow-hidden rounded-2xl border border-border/60 shadow-2xl">
        {/* ── Header ── */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Forward className="h-4 w-4 text-primary" strokeWidth={2} />
            </div>
            <div>
              <DialogTitle className="text-[15px] font-semibold leading-none">
                Chuyển tiếp tin nhắn
              </DialogTitle>
              <p className="text-[12px] text-muted-foreground mt-1">
                Chọn tối đa 10 cuộc trò chuyện
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* ── Original message preview ── */}
        <div className="mx-5 mt-3.5 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-muted/40 border border-border/40">
          <div className="h-7 w-7 rounded-md bg-background border border-border/50 flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
            {isSingleImage ? (
              message.filePublicId ? (
                <SecureImage
                  messageId={message._id}
                  alt={message.fileName ?? "image"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={message.fileUrl ?? ""}
                  alt={message.fileName ?? "image"}
                  className="h-full w-full object-cover"
                />
              )
            ) : (
              <PreviewIcon className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Tin nhắn gốc</p>
            {message.type === 'sticker' && message.content ? (
              <div className="mt-1">
                <img 
                  src={message.content} 
                  alt="sticker-preview" 
                  className="size-16 object-contain rounded-lg bg-background/50 p-1 border border-border/40" 
                />
              </div>
            ) : isSingleImage ? (
              <div className="mt-1">
                {message.filePublicId ? (
                  <SecureImage
                    messageId={message._id}
                    alt={message.fileName ?? "image"}
                    className="size-16 object-cover rounded-lg border border-border/40"
                  />
                ) : (
                  <img
                    src={message.fileUrl ?? ""}
                    alt={message.fileName ?? "image"}
                    className="size-16 object-cover rounded-lg border border-border/40"
                  />
                )}
              </div>
            ) : (
              <p className="text-[13px] text-foreground/85 line-clamp-2 leading-relaxed break-all">
                {resolvedPreviewText}
              </p>
            )}
          </div>
        </div>

        {/* ── Selected pills ── */}
        {selectedIds.size > 0 && (
          <div className="px-5 pt-2.5 flex flex-wrap gap-1.5">
            {selectedConvos.map((c) => {
              const isGroup = c.type === "group";
              const otherUser = !isGroup
                ? c.participants.find((p) => p.userId?._id?.toString() !== user?._id)
                : null;
              const name = isGroup
                ? c.group?.name ?? "Nhóm"
                : otherUser?.userId?.nickname?.trim() || otherUser?.userId?.displayName || "Người dùng";
              return (
                <span
                  key={c._id}
                  className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[12px] font-medium px-2 py-1 rounded-full border border-primary/20 transition-all"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => handleToggle(c._id)}
                    className="hover:opacity-60 transition-opacity ml-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* ── Search ── */}
        <div className={cn("px-5", selectedIds.size > 0 ? "pt-2 pb-1.5" : "pt-3.5 pb-1.5")}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              autoComplete="off"
              placeholder="Tìm cuộc trò chuyện..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-9 text-[13px] rounded-xl bg-muted/30 border-border/50 focus-visible:ring-1 focus-visible:ring-primary/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Conversation list ── */}
        <div className="px-5 pb-1 max-h-[264px] overflow-y-auto beautiful-scrollbar space-y-0.5">
          {filteredConversations.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
              <Search className="h-7 w-7 opacity-25" />
              <p className="text-[13px]">
                {searchQuery
                  ? `Không tìm thấy "${searchQuery}"`
                  : "Không có cuộc trò chuyện nào"}
              </p>
            </div>
          ) : (
            filteredConversations.map((c) => (
              <ConversationRow
                key={c._id}
                convo={c}
                currentUserId={user?._id ?? ""}
                selected={selectedIds.has(c._id)}
                onToggle={() => handleToggle(c._id)}
              />
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3.5 border-t border-border/50 mt-1 bg-muted/10 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[12px] text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size}/10 đã chọn`
              : "Chưa chọn cuộc trò chuyện nào"}
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="rounded-xl h-8 px-3 text-[12px]"
            >
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={selectedIds.size === 0 || isSending}
              className="rounded-xl h-8 px-4 text-[12px] gap-1.5"
            >
              {isSending ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Gửi {selectedIds.size > 1 ? `(${selectedIds.size})` : ""}
                </>
              )}
            </Button>
          </div>
        </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};

export default ForwardMessageModal;
