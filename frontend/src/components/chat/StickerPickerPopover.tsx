import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { StickerIcon } from "@/components/shared/StickerIcon";
import { cn } from "@/lib/utils";

const STICKER_SETS = [
  {
    id: "bu-mat-ngao",
    name: "Bư Mặt Ngáo",
    iconUrl: "https://res.cloudinary.com/df1iezypb/image/upload/v1776983986/icon_jwksup.jpg",
    stickers: [
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776982987/z7757266604812_294db4dc5474ed8012fd8c1aae2af9a6_rmriv9.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776982985/z7757266602382_7cd74791eb0ec6b6a41573a9a414511b_xbdfj7.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776982984/z7757266599492_1e30411fc780877b83d70e0365a05a26_ulgaij.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776982983/z7757266596374_f1f34e99376d3309e719da2b0c99cbb5_my3mz0.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776982981/z7757266594245_1968707e6da7bbc9c6f0235222f01ed1_vsoqhf.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776982980/z7757266591197_789c0fbaf1d051525e2d90ef12ec418f_bgtgsb.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776982978/z7757266587323_1c066bfd1dd51f4dc87cca445c981539_hdoyrq.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776982977/z7757266587321_deff8b9196bee431ce31b569668be944_teph0j.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776982977/z7757266586886_2a2e6e818a3acfd6578fdf5380b7f84a_qckn7l.jpg"
    ]
  },
  {
    id: "zapy-do-tri",
    name: "Zapy Dô Tri",
    iconUrl: "https://res.cloudinary.com/df1iezypb/image/upload/v1776984599/icon_e309lo.jpg",
    stickers: [
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776984618/z7757277714623_8befe9f116c4e9ce647a1362657e58fa_fpudkk.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776984616/z7757277707352_ed2243729b19fc434447cd44aa6a42e5_bhdjw3.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776984614/z7757277706055_79cbefea515802d3d49a0e3fba4ce805_l357gg.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776984611/z7757277701628_5e244174fba349129381f4b4b4500508_wafl01.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776984609/z7757277696630_887aa861d14ef6265f85d45f12819151_skmyrw.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776984607/z7757277688766_50c47a2c605c66146372712b18e0157e_v47uje.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776984605/z7757277683558_6527c6f04218efba79746c10c7d0770c_b2vqbw.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776984603/z7757277675228_e647fa69ef1c4670ab707decc0118503_up8nsc.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776984600/z7757277673950_93ad2d4ce033c82e5db754b36a363a8d_gdo5zb.jpg"
    ]
  },
  {
    id: "tonton",
    name: "Tonton",
    iconUrl: "https://res.cloudinary.com/df1iezypb/image/upload/v1776992013/icon_iqmeug.jpg",
    stickers: [
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776992032/z7757396056214_5a9c147f9232ad3707e7f76370cc00f4_sp9lo8.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776992034/z7757396069903_bafb1eedeb3b2c1d326bed232035d617_ueqfdj.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776992037/z7757396100380_3faa42b6150ef74f776e3e15e4ea0593_t10pw1.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776992039/z7757396115581_19e3b69817835db711a636fea864698f_pjdszv.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776992041/z7757396124842_d067ee96db9b1549b3c3081da104a17d_nyqpsg.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776992043/z7757396152787_3f9c1bf1cc2045f3a5398e86aebb5ee8_agwzxw.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776992045/z7757396175806_39d1675bcccbce401bdfdeb55c3bbeb9_iik0lp.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776992047/z7757396190366_5514664dbb548530dd7004bb2eb9dd97_amfwce.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776992049/z7757396216724_03a50047885233f070047858dc25342d_nmoyqr.jpg"
    ]
  },
  {
    id: "meo-meo",
    name: "Meo Meo",
    iconUrl: "https://res.cloudinary.com/df1iezypb/image/upload/v1776994607/icon_xm9p8g.jpg",
    stickers: [
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776994634/z7757577798878_bb56e7895bceda5e32074d2694c52a8e_vofqr0.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776994636/z7757577819996_2c07dd213c98c72e64869e85bb8398ad_pk9ibb.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776994639/z7757577882672_8b6e18dd5185d3caabbbcc50b0a6e67c_l36ro9.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776994645/z7757577923624_c0e45b2b0565bd4a1394ef8ec7bdc578_haglll.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776994647/z7757577962917_509e3689b14873b2bf3e39cd2b60a495_syqk9z.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776994650/z7757577963083_2ac4ce1a50339bc43d488605a5354c3f_aulqwl.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776994652/z7757578028769_804480e21f945f0a5c97d18b967716f8_telhd2.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776994655/z7757578028959_99f330e94c5e9fc293fb1c31cc6acf5a_wzwmt6.jpg",
      "https://res.cloudinary.com/df1iezypb/image/upload/v1776994657/z7757578098301_5bde539d3d1833e2147ab6d19e331168_qoiyzf.jpg"
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
