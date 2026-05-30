import { useEffect, useRef, useState, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Download, RotateCcw, Forward, Undo2 } from "lucide-react";
import { useImageViewerStore } from "@/stores/useImageViewerStore";
import SecureImage from "@/components/SecureImage";
import useMediaCacheStore from "@/stores/useMediaCacheStore";
import { useChatStore } from "@/stores/useChatStore";
import ForwardMessageModal from "./ForwardMessageModal";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";
import { chatService } from "@/services/chatService";

function useResolvedUrl(messageId?: string, fallbackSrc?: string): string | null {
  const cachedUrl = useMediaCacheStore((s) => messageId ? s.getUrl(messageId) : null);
  if (cachedUrl) return cachedUrl;
  return fallbackSrc ?? null;
}
function ToolbarBtn({
  onClick,
  title,
  children,
  disabled,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title={title}
      disabled={disabled}
      className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 pointer-events-auto"
    >
      {children}
    </button>
  );
}

export default function ImageViewerModal() {
  const { isOpen, image, closeViewer } = useImageViewerStore();
  const resolvedUrl = useResolvedUrl(image?.messageId, image?.downloadUrl ?? image?.src);
  const setCachedMediaUrl = useMediaCacheStore((s) => s.setUrl);
  const { messages, conversations, recallMessage, recallMessageLocal } = useChatStore();
  const { user } = useAuthStore();

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [isRecalling, setIsRecalling] = useState(false);

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const loadedViewerMessage = image?.conversationId && image?.messageId
    ? messages[image.conversationId]?.items.find((item) => item._id === image.messageId)
    : null;
  const viewerMessage = loadedViewerMessage ?? image?.message ?? null;
  const viewerConversationId = image?.conversationId ?? viewerMessage?.conversationId;
  const viewerConversation = viewerConversationId
    ? conversations.find((item) => item._id === viewerConversationId)
    : null;
  const viewerSenderId = viewerMessage
    ? (typeof viewerMessage.senderId === "object" ? (viewerMessage.senderId as any)._id : viewerMessage.senderId)
    : null;
  const isOwnImage = Boolean(user?._id && viewerSenderId?.toString?.() === user._id.toString());
  const isDisbanded = viewerConversation?.type === "group" && viewerConversation.disbanded === true;
  const canActOnMessage = Boolean(
    viewerMessage &&
    (!viewerMessage.status || viewerMessage.status === "sent") &&
    !viewerMessage.isRecalled
  );
  const canRecallMessage = Boolean(canActOnMessage && isOwnImage && !isDisbanded);
  const shouldUseSecureImage = Boolean(image?.messageId && !image?.src);

  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setIsLoaded(false);
      setIsDragging(false);
      setShowForwardModal(false);
      setShowRecallConfirm(false);
    }
  }, [isOpen, image?.messageId, image?.src, image?.downloadUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
      else if (e.key === "+" || e.key === "=") handleZoomIn();
      else if (e.key === "-") handleZoomOut();
      else if (e.key === "0") handleReset();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  const handleZoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 4)), []);
  const handleZoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.25)), []);
  const handleReset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((s) => Math.min(Math.max(s + delta, 0.25), 4));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragStart.current) return;
    setOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStart.current = null;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) closeViewer();
  };

  const handleDownload = async () => {
    let url = resolvedUrl;
    if (!url && image?.messageId) {
      const response = await chatService.getSignedMediaUrl(image.messageId);
      url = response.url;
      setCachedMediaUrl(image.messageId, url);
    }
    if (!url) return;

    try {
      let res = await fetch(url);
      if (!res.ok && image?.messageId) {
        const response = await chatService.getSignedMediaUrl(image.messageId);
        url = response.url;
        setCachedMediaUrl(image.messageId, url);
        res = await fetch(url);
      }
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = image?.alt ?? "image";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleRecall = async () => {
    if (!viewerMessage || isRecalling) return;
    try {
      setIsRecalling(true);
      await recallMessage(viewerMessage._id);
      if (viewerMessage.conversationId) {
        recallMessageLocal(viewerMessage.conversationId, viewerMessage._id, {
          content: "Tin nhắn này đã được thu hồi",
          isRecalled: true,
        });
      }
      setShowRecallConfirm(false);
      closeViewer();
    } catch (error: any) {
      toast.error(error?.message || "Thu hồi thất bại");
    } finally {
      setIsRecalling(false);
    }
  };

  if (!isOpen || !image) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.88)" }}
      onClick={handleOverlayClick}
      ref={overlayRef}
    >
      <div
        className="absolute top-0 left-0 right-0 z-50 flex items-center justify-end px-4 py-3 pointer-events-none mobile-safe-area-top"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}
      >
        <div className="flex items-center gap-2 pointer-events-auto">
          <ToolbarBtn onClick={handleZoomOut} title="Thu nhỏ (-)">
            <ZoomOut className="w-4 h-4" />
          </ToolbarBtn>
          <span className="text-white/70 text-xs font-mono w-12 text-center select-none">
            {Math.round(scale * 100)}%
          </span>
          <ToolbarBtn onClick={handleZoomIn} title="Phóng to (+)">
            <ZoomIn className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={handleReset} title="Đặt lại (0)" disabled={scale === 1 && offset.x === 0 && offset.y === 0}>
            <RotateCcw className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => closeViewer()} title="Đóng (Esc)">
            <X className="w-4.5 h-4.5" />
          </ToolbarBtn>
        </div>
      </div>

      <div
        className="relative flex items-center justify-center w-full h-full overflow-hidden"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
      >
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-white/80 animate-spin" />
          </div>
        )}

        <div
          style={{
            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.15s ease-out",
            userSelect: "none",
            maxWidth: "90vw",
            maxHeight: "90vh",
          }}
        >
          {shouldUseSecureImage ? (
            <SecureImage
              messageId={image.messageId!}
              alt={image.alt ?? "image"}
              className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain shadow-2xl"
              onLoadCallback={() => setIsLoaded(true)}
            />
          ) : (
            <img
              ref={imgRef}
              src={resolvedUrl ?? image.src}
              alt={image.alt ?? "image"}
              draggable={false}
              onLoad={() => setIsLoaded(true)}
              className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain shadow-2xl"
              style={{ opacity: isLoaded ? 1 : 0, transition: "opacity 0.2s" }}
            />
          )}
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 flex justify-center pb-4 pointer-events-none mobile-safe-area-bottom-padded"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)" }}
      >
        {canActOnMessage && (
          <div className="flex items-center gap-2 rounded-full bg-black/45 px-2.5 py-2 backdrop-blur-md pointer-events-auto">
            <ToolbarBtn onClick={() => setShowForwardModal(true)} title="Chuyển tiếp">
              <Forward className="w-4 h-4" />
            </ToolbarBtn>
            <ToolbarBtn onClick={handleDownload} title="Tải xuống" disabled={!resolvedUrl}>
              <Download className="w-4 h-4" />
            </ToolbarBtn>
            {canRecallMessage && (
              <ToolbarBtn onClick={() => setShowRecallConfirm(true)} title="Thu hồi">
                <Undo2 className="w-4 h-4 text-red-200" />
              </ToolbarBtn>
            )}
          </div>
        )}
      </div>

      {viewerMessage && showForwardModal && (
        <ForwardMessageModal
          open={showForwardModal}
          onOpenChange={setShowForwardModal}
          message={viewerMessage}
        />
      )}

      <ConfirmationModal
        isOpen={showRecallConfirm}
        onClose={() => setShowRecallConfirm(false)}
        onConfirm={handleRecall}
        title="Thu hồi ảnh?"
        description="Ảnh này sẽ bị xóa khỏi cuộc trò chuyện của bạn và những người khác. Hành động này không thể hoàn tác."
        confirmText="Thu hồi"
        variant="destructive"
        isLoading={isRecalling}
      />

    </div>
  );
}
