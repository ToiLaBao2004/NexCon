import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { StickerIcon } from "@/components/shared/StickerIcon";
import { cn } from "@/lib/utils";

const CLOUDINARY_CLOUD_NAME = "df1iezypb";
const CLOUDINARY_IMAGE_BASE_URL = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload`;

type StickerSet = {
  id: string;
  name: string;
  iconUrl: string;
  stickers: string[];
};

type StickerSetConfig = {
  id: string;
  name: string;
  folder: string;
  prefix: string;
  count: number;
};

const DEFAULT_STICKER_SET_CONFIGS: StickerSetConfig[] = [
  { id: "bu-mat-ngao", name: "Bu Mat Ngao", folder: "bu_mat_ngao", prefix: "bu", count: 9 },
  { id: "zapy-do-tri", name: "Zapy Do Tri", folder: "zapy_do_tri", prefix: "zapy", count: 9 },
  { id: "tonton", name: "Tonton", folder: "tonton", prefix: "tonton", count: 9 },
  { id: "meo-meo", name: "Meo Meo", folder: "meo_meo", prefix: "meomeo", count: 9 },
  {
    id: "hand-drawn-emotes",
    name: "Hand Drawn Emotes",
    folder: "hand-drawn-emotes-elements-collection",
    prefix: "handdrawn",
    count: 9,
  },
  { id: "sticker-1", name: "Sticker 1", folder: "sticker1", prefix: "sticker1", count: 9 },
  { id: "sticker-2", name: "Sticker 2", folder: "sticker2", prefix: "sticker2", count: 9 },
  { id: "sticker-3", name: "Sticker 3", folder: "sticker3", prefix: "sticker3", count: 9 },
  { id: "sticker-5", name: "Sticker 5", folder: "sticker5", prefix: "sticker5", count: 22 },
  { id: "sticker-6", name: "Sticker 6", folder: "sticker6", prefix: "sticker6", count: 15 },
  { id: "sticker-7", name: "Sticker 7", folder: "sticker7", prefix: "sticker7", count: 20 },
  { id: "sticker-9", name: "Sticker 9", folder: "sticker9", prefix: "sticker9", count: 40 },
  { id: "sticker-10", name: "Sticker 10", folder: "sticker10", prefix: "sticker10", count: 17 },
  { id: "sticker-12", name: "Sticker 12", folder: "sticker12", prefix: "sticker12", count: 9 },
];

function getStickerAssetUrl(folder: string, fileName: string) {
  return `${CLOUDINARY_IMAGE_BASE_URL}/stickers/${folder}/${fileName}.png`;
}

function buildStickerSet(config: StickerSetConfig): StickerSet {
  return {
    id: config.id,
    name: config.name,
    iconUrl: getStickerAssetUrl(config.folder, "icon"),
    stickers: Array.from(
      { length: config.count },
      (_, index) => getStickerAssetUrl(config.folder, `${config.prefix}${index + 1}`),
    ),
  };
}

const STICKER_SETS = DEFAULT_STICKER_SET_CONFIGS.map(buildStickerSet);

interface StickerPickerPopoverProps {
  onSelect: (url: string) => void;
}

export default function StickerPickerPopover({ onSelect }: StickerPickerPopoverProps) {
  const [activeTab, setActiveTab] = useState(STICKER_SETS[0].id);
  const [isOpen, setIsOpen] = useState(false);
  const currentSet = STICKER_SETS.find((set) => set.id === activeTab) ?? STICKER_SETS[0];

  const handleSelect = (url: string) => {
    onSelect(url);
    setIsOpen(false);
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
                    <img
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
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-1">
              {STICKER_SETS.map((set) => (
                <button
                  key={set.id}
                  onClick={() => setActiveTab(set.id)}
                  className={cn(
                    "h-10 w-10 shrink-0 rounded-xl transition-all duration-200 flex items-center justify-center border-2",
                    activeTab === set.id
                      ? "bg-background border-primary shadow-sm"
                      : "border-transparent hover:bg-background/50 grayscale opacity-60"
                  )}
                  title={set.name}
                >
                  <img
                    src={set.iconUrl}
                    alt={set.name}
                    className="size-7 object-contain"
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
