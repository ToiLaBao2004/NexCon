import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

const formatRemaining = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;
  return `${Math.ceil(seconds / 86400)}d`;
};

export function CountdownBadge({
  expiresAt,
  className,
}: {
  expiresAt?: string | null;
  className?: string;
}) {
  const [now, setNow] = useState(Date.now());
  const expiryTime = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;

  useEffect(() => {
    if (!Number.isFinite(expiryTime)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiryTime]);

  const remaining = Math.max(0, Math.ceil((expiryTime - now) / 1000));
  const tone = useMemo(() => {
    if (remaining <= 60) return "text-muted-foreground";
    if (remaining <= 3600) return "text-amber-500";
    return "text-sky-500";
  }, [remaining]);

  if (!Number.isFinite(expiryTime) || remaining <= 0) return null;

  return (
    <span
      className={cn(
        "pointer-events-none absolute -right-2 -top-2 inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-background/95 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm",
        tone,
        className,
      )}
      title={`Tự xóa sau ${formatRemaining(remaining)}`}
    >
      <Clock3 className="h-3 w-3" />
      {formatRemaining(remaining)}
    </span>
  );
}
