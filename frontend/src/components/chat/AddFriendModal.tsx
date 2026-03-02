import { useState, useEffect, useRef } from "react";
import { UserPlus, Search, Loader2, X, UserX, UserMinus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSocketStore } from "@/stores/useSocketStore";
import { useFriendStore } from "@/stores/useFriendStore";

interface SearchedUser {
  _id: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  phone?: string;
}

type SearchStatus = "idle" | "searching" | "found" | "not-found" | "error" | "empty";

const AddFriendModal = () => {
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<SearchedUser | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socket = useSocketStore((state) => state.socket);
  const { sendFriendRequest, cancelFriendRequest, sentRequests, fetchSentRequests } = useFriendStore();

  const pendingRequest = user
    ? sentRequests.find((r) => r.to._id === user._id)
    : null;
  const hasPendingRequest = !!pendingRequest;

  useEffect(() => {
    if (!socket) return;

    const handleResult = ({
      user,
      status,
    }: {
      user: SearchedUser | null;
      status: SearchStatus;
    }) => {
      setUser(user);
      setStatus(status);
    };

    socket.on("search-user-result", handleResult);

    return () => {
      socket.off("search-user-result", handleResult);
    };
  }, [socket]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setStatus("idle");
      setUser(null);
      return;
    }

    setStatus("searching");

    debounceRef.current = setTimeout(() => {
      socket?.emit("search-user", { query });
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, socket]);

  const handleClear = () => {
    setQuery("");
    setUser(null);
    setStatus("idle");
  };

  const handleSendRequest = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user || actionLoading) return;
    try {
      setActionLoading(true);
      await sendFriendRequest(user.email);
      await fetchSentRequests();
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!pendingRequest || actionLoading) return;
    try {
      setActionLoading(true);
      await cancelFriendRequest(pendingRequest._id);
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
  };

  const renderRequestButton = () => {
    if (actionLoading) {
      return (
        <Button disabled className="mt-6 w-full gap-2 rounded-xl h-12 font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang xử lý...
        </Button>
      );
    }

    if (hasPendingRequest) {
      return (
        <Button
          onClick={handleCancelRequest}
          variant="outline"
          className="mt-6 w-full gap-2 rounded-xl h-12 font-semibold border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-all active:scale-[0.98]"
        >
          <UserMinus className="h-4 w-4" />
          Hủy lời mời kết bạn
        </Button>
      );
    }

    return (
      <Button
        onClick={handleSendRequest}
        className="mt-6 w-full gap-2 rounded-xl h-12 shadow-glow hover:shadow-primary/20 transition-all active:scale-[0.98] font-semibold"
      >
        <UserPlus className="h-4 w-4 text-white" />
        Gửi lời mời kết bạn
      </Button>
    );
  };

  const renderSmallIcon = () => {
    if (actionLoading) {
      return <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />;
    }
    if (hasPendingRequest) {
      return (
        <button
          onClick={handleCancelRequest}
          className="p-1 rounded-full hover:bg-destructive/10 transition-colors shrink-0"
          title="Hủy lời mời"
        >
          <UserMinus className="h-4 w-4 text-destructive" />
        </button>
      );
    }
    return (
      <button
        onClick={handleSendRequest}
        className="p-1 rounded-full hover:bg-primary/10 transition-colors shrink-0"
        title="Gửi lời mời kết bạn"
      >
        <UserPlus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </button>
    );
  };

  return (
    <div className="w-full px-2 py-3 border-b border-border/40">
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          {status === "searching" ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
        <Input
          placeholder="Tìm kiếm theo email hoặc SĐT..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 pl-9 pr-8 border-border/60 bg-muted/30 focus-visible:ring-primary/20 rounded-lg text-sm"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {status === "searching" && (
        <p className="text-xs text-muted-foreground mt-2 px-1 flex items-center gap-1.5 animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          Đang tìm kiếm...
        </p>
      )}

      {status === "not-found" && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
          <UserX className="h-4 w-4 shrink-0" />
          <p className="text-xs font-medium">Không tìm thấy người dùng này.</p>
        </div>
      )}

      {status === "error" && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
          <X className="h-4 w-4 shrink-0" />
          <p className="text-xs font-medium">Đã có lỗi xảy ra khi tìm kiếm.</p>
        </div>
      )}

      {status === "found" && user && (
        <>
          <div
            onClick={() => handleDialogChange(true)}
            className="mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-card hover:bg-muted/50 hover:border-primary/30 transition-all duration-150 animate-in fade-in slide-in-from-top-1 duration-200 group text-left cursor-pointer"
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={user.avatarUrl} />
              <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                {user.displayName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{user.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            {renderSmallIcon()}
          </div>

          <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
            <DialogContent className="sm:max-w-md border-primary/10 shadow-glow">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Thêm bạn bè
                </DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <div className="flex flex-col items-center p-6 rounded-2xl bg-card border border-border/40 shadow-soft animate-in slide-in-from-bottom-4 duration-300">
                  <div className="relative">
                    <Avatar className="h-24 w-24 ring-4 ring-primary/10">
                      <AvatarImage src={user.avatarUrl} />
                      <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                        {user.displayName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary flex items-center justify-center text-white border-4 border-card">
                      <UserPlus className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="mt-4 text-center">
                    <h3 className="text-lg font-bold text-foreground">{user.displayName}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
                    {user.phone && (
                      <p className="text-xs text-muted-foreground/80 mt-0.5 font-medium">{user.phone}</p>
                    )}
                  </div>
                  {renderRequestButton()}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default AddFriendModal;