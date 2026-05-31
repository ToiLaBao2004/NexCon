import type { ReactNode, UIEvent, WheelEvent } from "react";
import { ChevronLeft } from "lucide-react";
import { Dialog, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { Message } from "@/types/chat";
import type { MediaKind } from "@/types/store";
import SecureImage from "../SecureImage";
import { useImageViewerStore } from "@/stores/useImageViewerStore";

const getLocalDateKey = (value?: string | null) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "unknown";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const formatDateGroupLabel = (value?: string | null) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Không rõ ngày";

  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return `Ngày ${date.getDate()} Tháng ${date.getMonth() + 1}${sameYear ? "" : `, ${date.getFullYear()}`}`;
};

const groupMessagesByDay = (items: Message[]) => {
  const groups: Array<{ key: string; label: string; items: Message[] }> = [];

  items.forEach((item) => {
    const key = getLocalDateKey(item.createdAt);
    const current = groups[groups.length - 1];
    if (current?.key === key) {
      current.items.push(item);
      return;
    }

    groups.push({
      key,
      label: formatDateGroupLabel(item.createdAt),
      items: [item],
    });
  });

  return groups;
};

const VIEWER_TITLES: Record<MediaKind, string> = {
  image: "Tất cả ảnh/video",
  file: "Tất cả file",
  link: "Tất cả liên kết",
};

interface SidebarMediaViewerModalProps {
  open: boolean;
  type: MediaKind | null;
  items: Message[];
  isFetching: boolean;
  hasMore: boolean;
  onOpenChange: (open: boolean) => void;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  renderFileRow: (msg: Message) => ReactNode;
  renderLinkRow: (msg: Message) => ReactNode;
  filtersNode?: ReactNode;
}

export function SidebarMediaViewerModal({
  open,
  type,
  items,
  isFetching,
  hasMore,
  onOpenChange,
  onScroll,
  renderFileRow,
  renderLinkRow,
  filtersNode,
}: SidebarMediaViewerModalProps) {
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    container.scrollTop += event.deltaY;
    event.stopPropagation();
  };

  const renderContent = () => {
    if (!type) return null;

    if (type === "image") {
      return (
        <div className="space-y-5">
          {groupMessagesByDay(items).map((group, groupIndex) => (
            <section key={group.key}>
              {groupIndex > 0 && <div className="-mx-3 mb-5 h-2 bg-muted/50" />}
              <h4 className="mb-3 text-[15px] font-semibold text-foreground">{group.label}</h4>
              <div className="grid grid-cols-3 gap-2">
                {group.items.map((msg, i) => (
                  msg.filePublicId ? (
                    <button
                      key={`all-img-${msg._id || i}`}
                      type="button"
                      className="aspect-square rounded-[6px] bg-muted/10 flex items-center justify-center overflow-hidden border border-border/30 cursor-zoom-in hover:ring-2 hover:ring-primary/30 transition-all"
                      onClick={() =>
                        useImageViewerStore.getState().openViewer({
                          messageId: msg._id,
                          conversationId: msg.conversationId,
                          message: msg,
                          alt: msg.fileName ?? "image",
                        })
                      }
                    >
                      <SecureImage messageId={msg._id} alt="media" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <button
                      key={`all-img-${msg._id || i}`}
                      type="button"
                      className="aspect-square rounded-[6px] bg-muted/10 flex items-center justify-center overflow-hidden border border-border/30 cursor-zoom-in hover:ring-2 hover:ring-primary/30 transition-all"
                      onClick={() =>
                        useImageViewerStore.getState().openViewer({
                          messageId: msg._id,
                          conversationId: msg.conversationId,
                          message: msg,
                          src: msg.fileUrl ?? undefined,
                          alt: msg.fileName ?? "image",
                        })
                      }
                    >
                      <img src={msg.fileUrl || undefined} alt="media" className="h-full w-full object-cover" />
                    </button>
                  )
                ))}
              </div>
            </section>
          ))}
        </div>
      );
    }

    if (type === "file") {
      return <div className="flex flex-col gap-1">{items.map((msg) => renderFileRow(msg))}</div>;
    }

    return <div className="flex flex-col gap-1">{items.map((msg) => renderLinkRow(msg))}</div>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[200] bg-transparent" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-[201] m-0 flex w-screen flex-col rounded-none border-l border-border/40 bg-card p-0 shadow-2xl focus:outline-none mobile-safe-area-y sm:w-[380px] sm:max-w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full duration-300">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card">
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-muted/10"
              aria-label="Đóng"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DialogHeader className="p-0">
              <DialogTitle className="text-base font-medium">
                {type ? VIEWER_TITLES[type] : "Tất cả"}
              </DialogTitle>
            </DialogHeader>
          </div>

          {filtersNode && (
            <div className="shrink-0 border-b border-border/30 bg-card px-3 py-2.5">
              {filtersNode}
            </div>
          )}

          <div
            className="p-3 overflow-y-auto overflow-x-hidden flex-1 min-h-0 bg-card beautiful-scrollbar"
            onScroll={onScroll}
            onWheel={handleWheel}
          >
            {renderContent()}

            {!isFetching && items.length === 0 && (
              <p className="text-sm text-muted-foreground/90 py-2 text-center">
                {type === "image"
                  ? "Không có ảnh/video nào"
                  : type === "file"
                    ? "Không có file nào"
                    : "Không có liên kết nào"}
              </p>
            )}

            {isFetching && (
              <p className="text-sm text-muted-foreground/90 py-3 text-center">Đang tải thêm...</p>
            )}

            {!isFetching && items.length > 0 && !hasMore && (
              <p className="text-sm text-muted-foreground/80 py-3 text-center">Đã hiển thị hết dữ liệu</p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
