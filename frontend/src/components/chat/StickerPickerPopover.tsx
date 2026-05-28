import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { StickerIcon } from "@/components/shared/StickerIcon";
import { cn } from "@/lib/utils";
import { preloadStickerSet, preloadStickerUrls, STICKER_SETS } from "@/lib/stickerAssets";
import CachedStickerImage from "./CachedStickerImage";

interface StickerPickerPopoverProps {
  onSelect: (url: string) => void;
}

export default function StickerPickerPopover({ onSelect }: StickerPickerPopoverProps) {
  const [activeTab, setActiveTab] = useState(STICKER_SETS[0].id);
  const [isOpen, setIsOpen] = useState(false);
  const [isDraggingTabs, setIsDraggingTabs] = useState(false);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const didDragTabsRef = useRef(false);
  const currentSet = STICKER_SETS.find((set) => set.id === activeTab) ?? STICKER_SETS[0];

  useEffect(() => {
    if (!isOpen) return;
    preloadStickerUrls(STICKER_SETS.map((set) => set.iconUrl));
    preloadStickerSet(currentSet);
  }, [currentSet, isOpen]);

  const handleSelect = (url: string) => {
    onSelect(url);
    setIsOpen(false);
  };

  const handleTabsPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = tabsScrollRef.current;
    if (!target) return;

    setIsDraggingTabs(true);
    didDragTabsRef.current = false;
    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = target.scrollLeft;
    target.setPointerCapture(event.pointerId);
  };

  const handleTabsPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = tabsScrollRef.current;
    if (!target || !isDraggingTabs) return;

    const deltaX = event.clientX - dragStartXRef.current;
    if (Math.abs(deltaX) > 4) didDragTabsRef.current = true;
    target.scrollLeft = dragStartScrollLeftRef.current - deltaX;
  };

  const stopTabsDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = tabsScrollRef.current;
    if (target?.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    setIsDraggingTabs(false);
  };

  const handleTabsClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!didDragTabsRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    window.setTimeout(() => {
      didDragTabsRef.current = false;
    }, 0);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-9 shrink-0 transition-all duration-200",
            isOpen ? "bg-primary/15 text-primary" : "hover:bg-primary/10 hover:text-primary transition-colors"
          )}
          title="Gửi sticker"
        >
          <StickerIcon className="size-4" strokeWidth={2} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={12}
        className="w-[320px] p-0 shadow-2xl border-border/50 bg-background/95 backdrop-blur-xl overflow-hidden rounded-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex flex-col h-[360px]">
          <div className="flex-1 overflow-hidden bg-background/50">
            <div className="h-full overflow-y-auto beautiful-scrollbar">
              <div className="grid grid-cols-3 gap-3 p-4">
                {currentSet.stickers.map((url) => (
                  <button
                    key={`${currentSet.id}-${url}`}
                    onClick={() => handleSelect(url)}
                    className="relative aspect-square flex items-center justify-center p-1 rounded-xl hover:bg-primary/5 transition-all duration-200 group active:scale-90"
                  >
                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 rounded-xl transition-colors" />
                    <CachedStickerImage
                      src={url}
                      alt="sticker"
                      className="w-full h-full object-contain relative z-10 group-hover:scale-110 transition-transform duration-300"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-2 bg-muted/30 border-t border-border/40">
            <div
              ref={tabsScrollRef}
              onPointerDown={handleTabsPointerDown}
              onPointerMove={handleTabsPointerMove}
              onPointerUp={stopTabsDrag}
              onPointerCancel={stopTabsDrag}
              onClickCapture={handleTabsClickCapture}
              className={cn(
                "flex gap-2 overflow-x-auto beautiful-scrollbar py-1 px-1 select-none touch-pan-y",
                isDraggingTabs ? "cursor-grabbing" : "cursor-grab"
              )}
            >
              {STICKER_SETS.map((set) => (
                <button
                  key={set.id}
                  draggable={false}
                  onClick={() => setActiveTab(set.id)}
                  className={cn(
                    "h-10 w-10 shrink-0 rounded-xl transition-all duration-200 flex items-center justify-center border-2",
                    activeTab === set.id
                      ? "bg-background border-primary shadow-sm"
                      : "border-transparent hover:bg-background/50 grayscale opacity-60"
                  )}
                  title={set.name}
                >
                  <CachedStickerImage
                    src={set.iconUrl}
                    alt={set.name}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    className="size-7 object-contain pointer-events-none select-none"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
