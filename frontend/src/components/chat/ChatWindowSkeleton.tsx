const ChatWindowSkeleton = () => {
  return (
    <div className="flex flex-col h-full flex-1 overflow-hidden bg-background/50 animate-pulse">
      {/* Header Skeleton */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted/60" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted/60 rounded" />
            <div className="h-3 w-20 bg-muted/40 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-muted/40" />
          <div className="h-8 w-8 rounded-full bg-muted/40" />
        </div>
      </div>

      {/* Messages Skeleton */}
      <div className="flex-1 p-6 space-y-6 overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-muted/60 mt-1" />
          <div className="space-y-2 max-w-[60%]">
            <div className="h-12 w-48 bg-muted/40 rounded-2xl rounded-tl-none" />
          </div>
        </div>

        <div className="flex items-start justify-end gap-3">
          <div className="space-y-2 max-w-[60%] flex flex-col items-end">
            <div className="h-10 w-32 bg-primary/20 rounded-2xl rounded-tr-none" />
            <div className="h-8 w-40 bg-primary/20 rounded-2xl mt-1" />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-muted/60 mt-1" />
          <div className="space-y-2 max-w-[60%]">
            <div className="h-10 w-56 bg-muted/40 rounded-2xl rounded-tl-none" />
            <div className="h-8 w-32 bg-muted/40 rounded-2xl mt-1" />
          </div>
        </div>

        <div className="flex items-start justify-end gap-3 pt-4">
          <div className="h-24 w-64 bg-primary/20 rounded-2xl rounded-tr-none shadow-sm shadow-primary/5" />
        </div>
      </div>

      {/* Input Skeleton */}
      <div className="p-4 border-t border-border/40 bg-background/80 backdrop-blur-md">
        <div className="h-12 w-full bg-muted/40 rounded-2xl border border-border/60" />
      </div>
    </div>
  );
};

export default ChatWindowSkeleton;