import { cn } from "@/lib/utils";
import { DISAPPEARED_MESSAGE_PLACEHOLDER } from "@/utils/disappearingMessages";

export function ExpiredMessagePlaceholder({ isOwn = false }: { isOwn?: boolean }) {
  return (
    <div className={cn("my-1 flex w-full px-2", isOwn ? "justify-end" : "justify-start")}>
      <div className="rounded-2xl border border-dashed border-border bg-muted/45 px-4 py-2.5 text-sm italic text-muted-foreground">
        {DISAPPEARED_MESSAGE_PLACEHOLDER}
      </div>
    </div>
  );
}
