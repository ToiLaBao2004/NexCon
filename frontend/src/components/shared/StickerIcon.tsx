import React from "react";
import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StickerIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export const StickerIcon = ({ className, ...props }: StickerIconProps) => {
  return (
    <SmilePlus 
      className={cn("size-5", className)} 
      strokeWidth={1.6}
      {...props} 
    />
  );
};
