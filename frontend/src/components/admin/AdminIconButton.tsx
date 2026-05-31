import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type AdminIconButtonProps = ComponentProps<typeof Button> & {
  label: string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
};

export default function AdminIconButton({
  label,
  tooltipSide = "top",
  size = "icon",
  disabled,
  ...props
}: AdminIconButtonProps) {
  const button = <Button aria-label={label} size={size} disabled={disabled} {...props} />;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? <span className="inline-flex">{button}</span> : button}
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
