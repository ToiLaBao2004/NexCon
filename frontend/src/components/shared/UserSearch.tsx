import { useState, useEffect, useRef } from "react";
import { UserPlus, Search, Loader2, X, UserMinus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSocketStore } from "@/stores/useSocketStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { FriendActionButtons } from "@/components/people/FriendActionButtons";
import { cn } from "@/lib/utils";

interface SearchedUser {
    _id: string;
    displayName: string;
    email: string;
    avatarUrl: string;
    phone?: string;
}

type SearchStatus = "idle" | "searching" | "found" | "not-found" | "error" | "empty";

interface UserSearchProps {
    className?: string;
    onOpenChat?: (friend: any) => void;
}

const UserSearch = ({ className, onOpenChat }: UserSearchProps) => {
    const [query, setQuery] = useState("");
    const [user, setUser] = useState<SearchedUser | null>(null);
    const [status, setStatus] = useState<SearchStatus>("idle");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [requestMessage, setRequestMessage] = useState("");
    const [unfriendModalOpen, setUnfriendModalOpen] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const socket = useSocketStore((state) => state.socket);
    const {
        sendFriendRequest, cancelFriendRequest, unfriendUser,
        sentRequests, friends, fetchSentRequests
    } = useFriendStore();

    const pendingRequest = user ? sentRequests.find((r) => r.to._id === user._id) : null;
    const isFriend = !!(user && friends.find(f => f.friendId === user._id));

    useEffect(() => {
        if (!socket) return;
        const handleResult = ({ user, status }: any) => {
            setUser(user);
            setStatus(status);
            setRequestMessage("");
        };
        socket.on("search-user-result", handleResult);
        return () => { socket.off("search-user-result", handleResult); };
    }, [socket]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!query.trim()) {
            setStatus("idle"); setUser(null); return;
        }
        setStatus("searching");
        debounceRef.current = setTimeout(() => {
            socket?.emit("search-user", { query });
        }, 500);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, socket]);

    const handleAction = async (action: () => Promise<void>) => {
        try {
            setActionLoading(true);
            await action();
        } finally {
            setActionLoading(false);
        }
    };

    const onSendRequest = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) return;
        handleAction(async () => {
            await sendFriendRequest(user.email, requestMessage);
            await fetchSentRequests();
            setRequestMessage("");
        });
    };

    const onCancelRequest = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!pendingRequest) return;
        handleAction(() => cancelFriendRequest(pendingRequest._id));
    };

    const onUnfriend = () => {
        if (!user) return;
        handleAction(async () => {
            await unfriendUser(user._id);
            setUnfriendModalOpen(false);
        });
    };

    const renderSecondaryActions = (mode: "icon" | "full") => {
        if (isFriend) {
            return (
                <FriendActionButtons
                    onChat={(e) => {
                        e.stopPropagation();
                        setIsDialogOpen(false);
                        onOpenChat?.({ friendId: user?._id, ...user });
                    }}
                    onUnfriend={(e) => {
                        e.stopPropagation();
                        setUnfriendModalOpen(true);
                    }}
                    isProcessing={actionLoading}
                    variant={mode}
                    className={mode === "full" ? "mt-5" : ""}
                />
            );
        }

        if (mode === "full") {
            return (
                <Button
                    onClick={pendingRequest ? onCancelRequest : onSendRequest}
                    variant={pendingRequest ? "outline" : "default"}
                    disabled={actionLoading}
                    className={cn(
                        "mt-5 w-full gap-2 rounded-xl h-10 font-semibold transition-all active:scale-[0.98]",
                        pendingRequest ? "border-destructive/30 text-destructive hover:bg-destructive/10" : "shadow-glow"
                    )}
                >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (pendingRequest ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />)}
                    {pendingRequest ? "Hủy kết bạn" : "Gửi lời mời kết bạn"}
                </Button>
            );
        }

        return (
            <button
                onClick={pendingRequest ? onCancelRequest : onSendRequest}
                className={cn("p-1.5 rounded-full transition-colors", pendingRequest ? "hover:bg-destructive/10" : "hover:bg-primary/10")}
                title={pendingRequest ? "Hủy lời mời" : "Gửi lời mời kết bạn"}
            >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : (pendingRequest ? <UserMinus className="h-4 w-4 text-destructive" /> : <UserPlus className="h-4 w-4 text-muted-foreground group-hover:text-primary" />)}
            </button>
        );
    };

    return (
        <div className={cn("w-full border-b border-border/40", className)}>
            <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                    {status === "searching" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Search className="h-4 w-4 text-muted-foreground" />}
                </span>
                <input
                    placeholder="Tìm kiếm theo email hoặc SĐT..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-9 pr-8"
                />
                {query && <button onClick={() => { setQuery(""); setUser(null); setStatus("idle"); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>

            {status === "searching" && (
                <p className="text-xs text-muted-foreground mt-2 px-1 flex items-center gap-1.5 animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" /> Đang tìm kiếm...
                </p>
            )}

            {status === "not-found" && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="h-4 w-4 shrink-0 flex items-center justify-center font-bold text-xs ring-1 ring-destructive rounded-full">!</span>
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
                    <div onClick={() => setIsDialogOpen(true)} className="mt-2 w-full flex flex-col gap-2 p-3 rounded-lg border border-border/60 bg-card hover:bg-muted/50 transition-all cursor-pointer group">
                        <div className="flex items-center gap-3 w-full">
                            <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={user.avatarUrl} />
                                <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{user.displayName.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{user.displayName}</p>
                                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                            {renderSecondaryActions("icon")}
                        </div>
                        {!pendingRequest && !isFriend && (
                            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                <Input
                                    placeholder="Nhập lời nhắn..."
                                    value={requestMessage}
                                    onChange={(e) => setRequestMessage(e.target.value)}
                                    className="h-8 text-xs bg-muted/20 border-border/40"
                                />
                            </div>
                        )}
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent className="sm:max-w-md border-primary/10 shadow-glow">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-bold">{isFriend ? "Thông tin bạn bè" : "Thêm bạn bè"}</DialogTitle>
                            </DialogHeader>
                            <div className="py-2">
                                <div className="flex flex-col items-center p-6 rounded-2xl bg-card border border-border/40 shadow-soft">
                                    <Avatar className="h-24 w-24 ring-4 ring-primary/10 mb-4">
                                        <AvatarImage src={user.avatarUrl} />
                                        <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">{user.displayName.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <h3 className="text-lg font-bold">{user.displayName}</h3>
                                    <p className="text-sm text-muted-foreground">{user.email}</p>
                                    {!pendingRequest && !isFriend && (
                                        <div className="w-full mt-4">
                                            <Input
                                                placeholder="Lời nhắn kết bạn..."
                                                value={requestMessage}
                                                onChange={(e) => setRequestMessage(e.target.value)}
                                                className="bg-muted/30"
                                            />
                                        </div>
                                    )}
                                    {renderSecondaryActions("full")}
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </>
            )}

            <ConfirmationModal
                isOpen={unfriendModalOpen}
                onClose={() => setUnfriendModalOpen(false)}
                onConfirm={onUnfriend}
                title="Hủy kết bạn?"
                description={`Bạn có chắc chắn muốn hủy kết bạn với ${user?.displayName}?`}
                confirmText="Hủy kết bạn"
                variant="destructive"
                isLoading={actionLoading}
            />
        </div>
    );
};

export default UserSearch;
