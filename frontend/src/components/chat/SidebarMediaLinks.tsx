import { CheckCircle2, Link2, FileText, ChevronDown, ChevronUp, MoreHorizontal, Download, Forward, Undo2, Copy } from "lucide-react";
import { useState, useEffect } from "react";
import type { ReactNode, UIEvent } from "react";
import type { Conversation, Message } from "@/types/chat";
import { useChatStore } from "@/stores/useChatStore";
import { formatBytes, formatMessageTime } from "@/lib/utils";
import type { MediaKind } from "@/types/store";
import { SidebarMediaViewerModal } from "./SidebarMediaViewerModal";
import SecureImage from "../SecureImage";
import { useImageViewerStore } from "@/stores/useImageViewerStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ForwardMessageModal from "./ForwardMessageModal";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { useAuthStore } from "@/stores/useAuthStore";
import { chatService } from "@/services/chatService";
import useMediaCacheStore from "@/stores/useMediaCacheStore";
import { toast } from "sonner";

const VIEW_ALL_LIMIT: Record<MediaKind, number> = {
  image: 24,
  file: 20,
  link: 20,
};
const PREVIEW_LIMIT: Record<MediaKind, number> = {
  image: 8,
  file: 3,
  link: 3,
};

function ThickDivider() {
  return <div className="h-2 w-full shrink-0 bg-muted/40 pointer-events-none" />;
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="w-full bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted/60"
      >
        {title}
        {open ? (
          <ChevronUp className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.65} />
        ) : (
          <ChevronDown className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.65} />
        )}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

export function SidebarMediaLinks({ conversation }: { conversation: Conversation }) {
  const mediaState = useChatStore((s) => s.media[conversation._id]);
  const fetchMedia = useChatStore((s) => s.fetchMedia);
  const fetchMediaPage = useChatStore((s) => s.fetchMediaPage);
  const resetMediaPagination = useChatStore((s) => s.resetMediaPagination);
  const recallMessage = useChatStore((s) => s.recallMessage);
  const recallMessageLocal = useChatStore((s) => s.recallMessageLocal);
  const { user } = useAuthStore();

  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeViewer, setActiveViewer] = useState<MediaKind | null>(null);
  const [viewerKey, setViewerKey] = useState(0);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [recallTarget, setRecallTarget] = useState<Message | null>(null);
  const [isRecalling, setIsRecalling] = useState(false);

  const mediaPage = useChatStore((s) =>
    activeViewer ? s.mediaPagination[conversation._id]?.[activeViewer] : undefined
  );

  useEffect(() => {
    fetchMedia(conversation._id);
  }, [conversation._id, fetchMedia]);

  // Cleanup pagination khi unmount
  useEffect(() => {
    return () => {
      resetMediaPagination(conversation._id);
    };
  }, [conversation._id, resetMediaPagination]);

  // Khi viewer mở (hoặc viewerKey thay đổi), fetch sạch từ đầu
  useEffect(() => {
    if (!isViewerOpen || !activeViewer) return;
    // force=true: tự reset state + fetch, bỏ qua mọi guard trong store
    fetchMediaPage(conversation._id, activeViewer, VIEW_ALL_LIMIT[activeViewer], true);
  }, [isViewerOpen, activeViewer, viewerKey, conversation._id, fetchMediaPage]);

  const imageMessages = mediaState?.images ?? [];
  const fileMessages = mediaState?.files ?? [];
  const linkMessages = mediaState?.links ?? [];
  const shouldShowImageViewerButton = imageMessages.length >= PREVIEW_LIMIT.image;
  const shouldShowFileViewerButton = fileMessages.length >= PREVIEW_LIMIT.file;
  const shouldShowLinkViewerButton = linkMessages.length >= PREVIEW_LIMIT.link;

  // helpers for thumbnails
  const getExt = (name: string = "") => name.split(".").pop()?.toLowerCase() || "";
  const isImageFile = (msg: any) => {
    const ext = getExt(msg.fileName || "");
    const mime = msg.mimeType || "";
    return /^(png|jpe?g|gif|webp|bmp|svg)$/.test(ext) || /^image\//.test(mime);
  };
  const isVideoFile = (msg: any) => {
    const ext = getExt(msg.fileName || "");
    const mime = msg.mimeType || "";
    return /^(mp4|webm|ogg|mov|mkv)$/.test(ext) || /^video\//.test(mime);
  };
  const getYouTubeThumbnail = (url: string) => {
    try {
      let u: URL;
      try {
        u = new URL(url);
      } catch (e) {
        u = new URL("https://" + url);
      }
      if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
        let id = "";
        if (u.hostname.includes("youtu.be")) {
          id = u.pathname.slice(1);
        } else {
          id = u.searchParams.get("v") || "";
        }
        if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      }
    } catch (e) { }
    return null;
  };

  // file type icon helper (returns JSX)
  const FileTypeIcon = ({ fileName }: { fileName?: string | null }) => {
    const ext = getExt(fileName || "");
    const baseClasses = "h-6 w-6";
    if (/^(xlsx|xls|csv)$/.test(ext)) {
      return (
        <div className="flex items-center justify-center">
          <svg className={baseClasses} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="4" fill="#217346" />
            <path d="M7 8h10v2H7zM7 11h10v2H7z" fill="#fff" />
          </svg>
        </div>
      );
    }
    if (/^(docx|doc)$/.test(ext)) {
      return (
        <svg className={baseClasses} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="4" fill="#2B579A" />
          <path d="M7 8h10v2H7zM7 11h10v2H7z" fill="#fff" />
        </svg>
      );
    }
    if (/^(pdf)$/.test(ext)) {
      return (
        <svg className={baseClasses} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="4" fill="#D43F3A" />
          <path d="M7 8h10v2H7z" fill="#fff" />
        </svg>
      );
    }
    if (/^(mp3|wav|m4a|ogg)$/.test(ext)) {
      return (
        <svg className={baseClasses} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="4" fill="#8B5CF6" />
          <path d="M9 8v8a3 3 0 006 0V8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    return <FileText className="h-5 w-5 text-[#475569]" />;
  };

  const getHostIcon = (host: string) => {
    if (!host) return null;
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      return (
        <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="4" fill="#FF0000" />
          <path d="M9 7l6 5-6 5V7z" fill="#fff" />
        </svg>
      );
    }
    return <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt={host} className="h-full w-full object-contain" />;
  };

  const normalizeUrl = (raw: string) => {
    if (!raw) return raw;
    const t = raw.trim();
    if (/^https?:\/\//i.test(t)) return t;
    return `https://${t}`;
  };

  const openViewer = (type: MediaKind) => {
    setActiveViewer(type);
    setIsViewerOpen(true);
    setViewerKey((k) => k + 1);
  };

  const closeViewer = () => {
    if (activeViewer) {
      resetMediaPagination(conversation._id, activeViewer);
    }
    setIsViewerOpen(false);
    setActiveViewer(null);
  };

  const onViewerScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!activeViewer) return;
    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom <= 180) {
      fetchMediaPage(conversation._id, activeViewer, VIEW_ALL_LIMIT[activeViewer]);
    }
  };

  const viewerItems = mediaPage?.items ?? [];
  const viewerLoading = mediaPage?.isFetching ?? false;
  const viewerHasMore = mediaPage?.hasMore ?? true;

  const getSenderId = (msg: Message) => {
    const sender = msg.senderId as any;
    return (typeof sender === "object" ? sender?._id : sender)?.toString?.() ?? "";
  };

  const getFileUrl = async (msg: Message) => {
    let url = msg.filePublicId ? useMediaCacheStore.getState().getUrl(msg._id) : msg.fileUrl;
    if (!url && msg.filePublicId) {
      const response = await chatService.getSignedMediaUrl(msg._id);
      url = response.url;
      useMediaCacheStore.getState().setUrl(msg._id, url);
    }
    return url;
  };

  const handleOpenFile = async (msg: Message) => {
    try {
      const url = await getFileUrl(msg);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      toast.error("Không thể mở file");
    }
  };

  const handleDownloadFile = async (msg: Message) => {
    try {
      const url = await getFileUrl(msg);
      if (!url) return;

      try {
        let response = await fetch(url);
        if (!response.ok && msg.filePublicId) {
          const refreshed = await chatService.getSignedMediaUrl(msg._id);
          const refreshedUrl = refreshed.url;
          useMediaCacheStore.getState().setUrl(msg._id, refreshedUrl);
          response = await fetch(refreshedUrl);
        }
        if (!response.ok) throw new Error("Download failed");

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = msg.fileName || `file-${msg._id}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      toast.error("Tải xuống thất bại");
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Đã sao chép liên kết");
    } catch {
      toast.error("Không thể sao chép liên kết");
    }
  };

  const handleRecallMedia = async () => {
    if (!recallTarget || isRecalling) return;
    try {
      setIsRecalling(true);
      await recallMessage(recallTarget._id);
      recallMessageLocal(recallTarget.conversationId || conversation._id, recallTarget._id, {
        content: "Tin nhắn này đã được thu hồi",
        isRecalled: true,
      });
      setRecallTarget(null);
    } catch (error: any) {
      toast.error(error?.message || "Thu hồi thất bại");
    } finally {
      setIsRecalling(false);
    }
  };

  const renderFileRow = (msg: Message) => {
    const name = msg.fileName ?? msg.content ?? "File";
    const size = msg.fileSize ? formatBytes(msg.fileSize) : msg.mimeType || "";
    const canActOnFile = Boolean((!msg.status || msg.status === "sent") && !msg.isRecalled);
    const canRecallFile = Boolean(
      canActOnFile &&
      !conversation.disbanded &&
      user?._id &&
      getSenderId(msg) === user._id.toString()
    );

    return (
      <div
        key={msg._id}
        className="flex items-center gap-2 py-2 rounded-lg transition-colors hover:bg-muted/10 group"
      >
        <button
          type="button"
          onClick={() => void handleOpenFile(msg)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="h-10 w-10 rounded-lg bg-muted/10 text-white flex items-center justify-center shrink-0 overflow-hidden border border-border/60">
            {(isImageFile(msg) && (msg.filePublicId || msg.fileUrl)) ? (
              msg.filePublicId ? (
                <SecureImage messageId={msg._id} alt={name} className="h-full w-full object-cover" />
              ) : (
                <img src={msg.fileUrl!} alt={name} className="h-full w-full object-cover" />
              )
            ) : (isVideoFile(msg) && msg.fileUrl) ? (
              <video src={msg.fileUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
            ) : (
              <FileTypeIcon fileName={msg.fileName} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate text-foreground">{name}</p>
            <div className="flex justify-between items-center mt-0.5">
              <p className="text-[13px] text-muted-foreground/90 flex items-center gap-1">
                {size} <CheckCircle2 className="h-[14px] w-[14px] text-green-500" strokeWidth={2.5} />
              </p>
              <p className="text-[12px] text-muted-foreground/90 whitespace-nowrap">{formatMessageTime(new Date(msg.createdAt))}</p>
            </div>
          </div>
        </button>

        {canActOnFile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Thao tác file"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setForwardTarget(msg)}>
                <Forward className="mr-2 h-4 w-4" strokeWidth={1.7} />
                Chuyển tiếp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleDownloadFile(msg)}>
                <Download className="mr-2 h-4 w-4" strokeWidth={1.7} />
                Tải xuống
              </DropdownMenuItem>
              {canRecallFile && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={() => setRecallTarget(msg)}
                >
                  <Undo2 className="mr-2 h-4 w-4" strokeWidth={1.7} />
                  Thu hồi
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  const renderLinkRow = (msg: any) => {
    const linkUrl = normalizeUrl(msg.content || "");
    const title = msg.previewTitle || msg.content || "Liên kết";
    const canActOnLink = Boolean((!msg.status || msg.status === "sent") && !msg.isRecalled);
    const canRecallLink = Boolean(
      canActOnLink &&
      !conversation.disbanded &&
      user?._id &&
      getSenderId(msg) === user._id.toString()
    );
    let host = "";
    try {
      let u: URL;
      try {
        u = new URL(msg.content);
      } catch (err) {
        u = new URL("https://" + msg.content);
      }
      host = u.hostname.replace(/^www\./, "");
    } catch (e) {
      host = msg.content;
    }

    return (
      <div
        key={msg._id}
        className="flex items-center gap-2 py-2 rounded-lg transition-colors hover:bg-muted/10 group"
      >
        <button
          type="button"
          onClick={() => window.open(linkUrl, "_blank", "noopener,noreferrer")}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="h-10 w-10 rounded-[6px] bg-muted/10 flex items-center justify-center shrink-0 overflow-hidden border border-border/60">
            {msg.previewImage || getYouTubeThumbnail(msg.content) ? (
              <img
                src={msg.previewImage || getYouTubeThumbnail(msg.content) || undefined}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              getHostIcon(host) || <Link2 className="h-5 w-5 text-muted-foreground/70" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate text-foreground group-hover:text-blue-500 transition-colors">{title}</p>
            <div className="flex justify-between items-center mt-0.5">
              <p className="text-[13px] text-blue-500 hover:underline cursor-pointer truncate mr-2">{host}</p>
              <p className="text-[12px] text-muted-foreground/90 whitespace-nowrap">{formatMessageTime(new Date(msg.createdAt))}</p>
            </div>
          </div>
        </button>

        {canActOnLink && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Thao tác liên kết"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setForwardTarget(msg)}>
                <Forward className="mr-2 h-4 w-4" strokeWidth={1.7} />
                Chuyển tiếp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleCopyLink(linkUrl)}>
                <Copy className="mr-2 h-4 w-4" strokeWidth={1.7} />
                Sao chép
              </DropdownMenuItem>
              {canRecallLink && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={() => setRecallTarget(msg)}
                >
                  <Undo2 className="mr-2 h-4 w-4" strokeWidth={1.7} />
                  Thu hồi
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-0">
      <Section title="Ảnh/Video" defaultOpen={true}>
        {imageMessages.length === 0 ? (
          <div className="text-sm text-muted-foreground/90 py-2">Không có ảnh nào</div>
        ) : (
        <div className="grid grid-cols-4 gap-[6px]">
          {imageMessages.map((msg, i) => (
            <button
              key={`img-${msg._id || i}`}
              type="button"
              className="aspect-square rounded-[6px] bg-muted/10 flex items-center justify-center overflow-hidden border border-border/30 cursor-zoom-in hover:ring-2 hover:ring-primary/30 transition-all"
              onClick={() =>
                useImageViewerStore.getState().openViewer({
                  messageId: msg._id,
                  conversationId: conversation._id,
                  message: msg,
                  src: msg.filePublicId ? undefined : msg.fileUrl ?? undefined,
                  alt: msg.fileName ?? "image",
                })
              }
            >
              {msg.filePublicId ? (
                <SecureImage messageId={msg._id} alt="media" className="h-full w-full object-cover" />
              ) : (
                <img src={msg.fileUrl!} alt="media" className="h-full w-full object-cover" />
              )}
            </button>
          ))}

        </div>
        )}
        <button
          onClick={() => openViewer("image")}
          className={`${shouldShowImageViewerButton ? "" : "hidden "}mt-4 w-full py-[10px] rounded-[6px] border border-border/60 bg-background text-[14px] font-semibold text-foreground hover:bg-muted/20 transition-colors cursor-pointer`}
        >
          Xem tất cả
        </button>
      </Section>
      <ThickDivider />

      <Section title="File" defaultOpen={true}>
        <div className="flex flex-col gap-0.5">
          {fileMessages.length === 0 && (
            <div className="text-sm text-muted-foreground/90 py-2">Không có file nào</div>
          )}
          {fileMessages.map((msg: any) => renderFileRow(msg))}
        </div>
        <button
          onClick={() => openViewer("file")}
          className={`${shouldShowFileViewerButton ? "" : "hidden "}mt-4 w-full py-[10px] rounded-[6px] border border-border/60 bg-background text-[14px] font-semibold text-foreground hover:bg-muted/20 transition-colors cursor-pointer`}
        >
          Xem tất cả
        </button>
      </Section>
      <ThickDivider />

      <Section title="Link" defaultOpen={true}>
        <div className="flex flex-col gap-0.5">
          {linkMessages.length === 0 && <div className="text-sm text-muted-foreground/90 py-2">Không có liên kết nào</div>}
          {linkMessages.map((msg: any) => renderLinkRow(msg))}
        </div>
        <button
          onClick={() => openViewer("link")}
          className={`${shouldShowLinkViewerButton ? "" : "hidden "}mt-4 w-full py-[10px] rounded-[6px] border border-border/60 bg-background text-[14px] font-semibold text-foreground hover:bg-muted/20 transition-colors cursor-pointer`}
        >
          Xem tất cả
        </button>
      </Section>

      <SidebarMediaViewerModal
        open={isViewerOpen}
        type={activeViewer}
        items={viewerItems}
        isFetching={viewerLoading}
        hasMore={viewerHasMore}
        onOpenChange={(open) => (open ? setIsViewerOpen(true) : closeViewer())}
        onScroll={onViewerScroll}
        renderFileRow={renderFileRow}
        renderLinkRow={renderLinkRow}
      />

      {forwardTarget && (
        <ForwardMessageModal
          open={Boolean(forwardTarget)}
          onOpenChange={(open) => {
            if (!open) setForwardTarget(null);
          }}
          message={forwardTarget}
        />
      )}

      <ConfirmationModal
        isOpen={Boolean(recallTarget)}
        onClose={() => setRecallTarget(null)}
        onConfirm={handleRecallMedia}
        title={recallTarget?.type === "link" ? "Thu hồi liên kết?" : "Thu hồi file?"}
        description={recallTarget?.type === "link"
          ? "Liên kết này sẽ bị xóa khỏi cuộc trò chuyện của bạn và những người khác. Hành động này không thể hoàn tác."
          : "File này sẽ bị xóa khỏi cuộc trò chuyện của bạn và những người khác. Hành động này không thể hoàn tác."}
        confirmText="Thu hồi"
        variant="destructive"
        isLoading={isRecalling}
      />
    </div>
  );
}
