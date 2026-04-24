import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { StickerIcon } from "@/components/shared/StickerIcon";
import { cn } from "@/lib/utils";

const STICKER_SETS = [
  {
    id: "bu-mat-ngao",
    name: "Bư Mặt Ngáo",
    iconUrl: "https://res.cloudinary.com/df1iezypb/image/upload/v1777003934/icon_e56jol.png",
    stickers: [
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003897/bu1_lz84qm.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003901/bu2_xnypab.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003905/bu3_l80qom.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003909/bu4_fipqmi.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003913/bu5_fgfnzc.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003917/bu6_mrjnsf.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003922/bu7_lcdgpz.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003926/bu8_rmabg2.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003930/bu9_sr0gjp.png"
    ]
  },
  {
    id: "zapy-do-tri",
    name: "Zapy Dô Tri",
    iconUrl: "https://res.cloudinary.com/df1iezypb/image/upload/v1777003621/icon_oniljk.png",
    stickers: [
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003624/zapy1_yxn521.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003628/zapy2_zfqkef.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003632/zapy3_jofbj0.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003636/zapy4_ppyyul.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003640/zapy5_iizy7r.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003644/zapy6_aznnup.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003648/zapy7_ezygkx.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003652/zapy8_a1sjej.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777003656/zapy9_ydgstc.png"
    ]
  },
  {
    id: "tonton",
    name: "Tonton",
    iconUrl: "https://res.cloudinary.com/df1iezypb/image/upload/v1777001926/icon_smyotr.png",
    stickers: [
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777001929/tonton1_v74rei.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777001936/tonton2_xgt3en.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777001940/tonton3_xwn8t1.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777001945/tonton4_qfbpbx.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777001949/tonton5_uc4jmy.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777001956/tonton6_mjhslb.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777001958/tonton7_t3jngs.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777001961/tonton8_s0y3bj.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777001965/tonton9_vlvuvf.png"
    ]
  },
  {
    id: "meo-meo",
    name: "Mèo Mèo",
    iconUrl: "https://res.cloudinary.com/df1iezypb/image/upload/v1777004779/icon_bbemow.png",
    stickers: [
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777004782/meomeo1_im6ntl.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777004786/meomeo2_pk6mty.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777004791/meomeo3_agzobv.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777004795/meomeo4_vx3znt.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777004799/meomeo5_fp3bgg.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777004803/meomeo6_sigx00.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777004808/meomeo7_f7ewje.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777004813/meomeo8_opgue5.png",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1777004816/meomeo9_rsrubu.png"
    ]
  }
];

interface StickerPickerPopoverProps {
  onSelect: (url: string) => void;
}

export default function StickerPickerPopover({ onSelect }: StickerPickerPopoverProps) {
  const [activeTab, setActiveTab] = useState(STICKER_SETS[0].id);
  const [isOpen, setIsOpen] = useState(false);

  const currentSet = STICKER_SETS.find(set => set.id === activeTab);

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
          {/* Sticker Grid */}
          <div className="flex-1 overflow-hidden bg-background/50">
            <div className="h-full overflow-y-auto beautiful-scrollbar">
              <div className="grid grid-cols-3 gap-3 p-4">
                {currentSet?.stickers.map((url, idx) => (
                  <button
                    key={idx}
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

          {/* Footer / Tabs with Images */}
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
