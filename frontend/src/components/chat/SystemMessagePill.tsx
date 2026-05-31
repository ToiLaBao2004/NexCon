import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SystemMessagePillProps {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  contentClassName?: string;
}

export function SystemMessagePill({
  children,
  icon,
  onClick,
  contentClassName,
}: SystemMessagePillProps) {
  const content = (
    <span
      className={cn(
        "block break-words text-center text-[13px] font-normal leading-relaxed text-muted-foreground",
        contentClassName,
      )}
    >
      {icon}
      {children}
    </span>
  );

  return (
    <div className="my-4 flex w-full animate-in justify-center px-3 fade-in transition-all duration-300">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="max-w-[92%] rounded-2xl bg-muted/45 px-4 py-2 transition-colors hover:bg-muted/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          {content}
        </button>
      ) : (
        <div className="max-w-[92%] rounded-2xl bg-muted/45 px-4 py-2">
          {content}
        </div>
      )}
    </div>
  );
}
