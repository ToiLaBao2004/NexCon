import { useEffect, useRef, useState, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Download, RotateCcw } from "lucide-react";
import { useImageViewerStore } from "@/stores/useImageViewerStore";
import SecureImage from "@/components/SecureImage";
import useMediaCacheStore from "@/stores/useMediaCacheStore";

function useResolvedUrl(messageId?: string, fallbackSrc?: string): string | null {
  const cache = useMediaCacheStore((s) => s.cache);
  if (messageId && cache[messageId]) return cache[messageId];
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
  const resolvedUrl = useResolvedUrl(image?.messageId, image?.src);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setIsLoaded(false);
      setIsDragging(false);
    }
  }, [isOpen, image?.messageId, image?.src]);

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
    const url = resolvedUrl;
    if (!url) return;
    try {
      const res = await fetch(url);
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

  if (!isOpen || !image) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.88)" }}
      onClick={handleOverlayClick}
      ref={overlayRef}
    >
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-end px-4 py-3 z-50 pointer-events-none"
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
          <ToolbarBtn onClick={handleDownload} title="Tải xuống" disabled={!resolvedUrl}>
            <Download className="w-4 h-4" />
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
          {image.messageId ? (
            <SecureImage
              messageId={image.messageId}
              alt={image.alt ?? "image"}
              className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain shadow-2xl"
              onLoadCallback={() => setIsLoaded(true)}
            />
          ) : (
            <img
              ref={imgRef}
              src={image.src}
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
        className="absolute bottom-0 left-0 right-0 flex justify-center pb-4 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)" }}
      >
      </div>
    </div>
  );
}
