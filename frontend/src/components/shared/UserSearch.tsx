import { useState, useEffect } from "react";
import { Search, Loader2, X, UserMinus, UserPlus } from "lucide-react";
import { UserActionDropdown } from "./UserActionDropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFriendStore } from "@/stores/useFriendStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { FriendActionButtons } from "@/components/people/FriendActionButtons";
import { UserProfileDialog } from "@/components/shared/UserProfileDialog";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { userService } from "@/services/userService";

interface SearchedUser {
    _id: string;
    displayName: string;
    email?: string;
    avatarUrl: string;
    phone?: string;
    bio?: string;
}

type SearchStatus = "idle" | "searching" | "found" | "not-found" | "error" | "empty";

interface UserSearchProps {
    className?: string;
    onOpenChat?: (friend: any) => void;
}

const UserSearchItem = ({ user, onOpenChat }: { user: SearchedUser, onOpenChat?: (friend: any) => void }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [requestMessage, setRequestMessage] = useState("");
    const [unfriendModalOpen, setUnfriendModalOpen] = useState(false);

    const {
        sendFriendRequest, cancelFriendRequest, unfriendUser,
        sentRequests, friends, fetchSentRequests
    } = useFriendStore();

    const { user: currentUser } = useAuthStore();
    const isSelf = currentUser?._id === user._id;

    const pendingRequest = sentRequests.find((r) => r.to._id === user._id);
    const friendRecord = friends.find((f) => f.friendId === user._id);
    const isFriend = !!friendRecord;
    const displayAlias = friendRecord?.nickname || user.displayName;

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
        handleAction(async () => {
            await sendFriendRequest({ userId: user._id, email: user.email }, requestMessage);
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
        handleAction(async () => {
            await unfriendUser(user._id);
            setUnfriendModalOpen(false);
        });
    };

    const renderSecondaryActions = (mode: "icon" | "full") => {
        if (isSelf) return null;
        if (isFriend) {
            return (
                <FriendActionButtons
                    userId={user._id}
                    displayName={displayAlias}
                    onChat={(e) => {
                        e.stopPropagation();
                        setIsDialogOpen(false);
                        onOpenChat?.({ friendId: user._id, ...user });
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

        const blockAction = (
            <UserActionDropdown
                userId={user._id}
                displayName={displayAlias}
                variant={mode === "full" ? "outline" : "ghost"}
                mode={mode === "full" ? "button" : "dropdown"}
            />
        );

        if (mode === "full") {
            return (
                <div className="w-full flex flex-col gap-2 mt-5">
                    <Button
                        onClick={pendingRequest ? onCancelRequest : onSendRequest}
                        variant={pendingRequest ? "outline" : "default"}
                        disabled={actionLoading}
                        className={cn(
                            "w-full gap-2 rounded-xl h-10 font-semibold transition-all active:scale-[0.98]",
                            pendingRequest ? "border-destructive/30 text-destructive hover:bg-destructive/10" : "shadow-glow"
                        )}
                    >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (pendingRequest ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />)}
                        {pendingRequest ? "Hủy kết bạn" : "Gửi lời mời kết bạn"}
                    </Button>
                    {blockAction}
                </div>
            );
        }

        return (
            <div className="flex items-center gap-1">
                <button
                    onClick={pendingRequest ? onCancelRequest : onSendRequest}
                    className={cn(
                        "h-10 w-10 flex items-center justify-center rounded-xl transition-all active:scale-95 disabled:opacity-50",
                        pendingRequest ? "hover:bg-destructive/10 text-destructive" : "text-foreground hover:bg-primary/10 hover:text-primary"
                    )}
                    title={pendingRequest ? "Hủy lời mời" : "Gửi lời mời kết bạn"}
                >
                    {actionLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : pendingRequest ? (
                        <UserMinus className="h-5 w-5" strokeWidth={1.65} />
                    ) : (
                        <UserPlus className="h-5 w-5" strokeWidth={1.65} />
                    )}
                </button>
                {blockAction}
            </div>
        );
    };

    return (
        <>
            <div onClick={() => setIsDialogOpen(true)} className="mt-2 w-full flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-4 hover:bg-muted/50 transition-all cursor-pointer group">
                <div className="flex items-center gap-3.5 w-full">
                    <Avatar className="h-11 w-11 shrink-0">
                        <AvatarImage src={user.avatarUrl} />
                        <AvatarFallback className="text-base font-bold bg-primary/10 text-primary">{user.displayName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-foreground truncate">{displayAlias} {isSelf && "(Bạn)"}</p>
                        <p className="text-sm text-muted-foreground truncate">{user.email || "Thông tin liên hệ đã ẩn"}</p>
                    </div>
                    <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                        {renderSecondaryActions("icon")}
                    </div>
                </div>
                {!pendingRequest && !isFriend && !isSelf && (
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                        <Input
                            placeholder="Nhập lời nhắn..."
                            value={requestMessage}
                            onChange={(e) => setRequestMessage(e.target.value)}
                            maxLength={300}
                            className="h-9 text-sm bg-muted/20 border-border/40"
                        />
                    </div>
                )}
            </div>

            <UserProfileDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                user={{
                    _id: user._id,
                    displayName: user.displayName,
                    email: user.email || "",
                    avatarUrl: user.avatarUrl,
                    bio: user.bio,
                    phone: user.phone,
                }}
                onOpenChat={(friend) => {
                    setIsDialogOpen(false);
                    onOpenChat?.(friend);
                }}
            />

            <ConfirmationModal
                isOpen={unfriendModalOpen}
                onClose={() => setUnfriendModalOpen(false)}
                onConfirm={onUnfriend}
                title="Hủy kết bạn?"
                description={`Bạn có chắc chắn muốn hủy kết bạn với ${displayAlias}?`}
                confirmText="Hủy kết bạn"
                variant="destructive"
                isLoading={actionLoading}
            />
        </>
    );
};

const UserSearch = ({ className, onOpenChat }: UserSearchProps) => {
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebounce(query, 500);
    const [users, setUsers] = useState<SearchedUser[]>([]);
    const [status, setStatus] = useState<SearchStatus>("idle");

    useEffect(() => {
        if (!debouncedQuery.trim()) {
            setStatus("idle");
            setUsers([]);
            return;
        }

        const fetchUsers = async () => {
            try {
                setStatus("searching");
                const response = await userService.searchUsers(debouncedQuery);
                const results = response.users || [];
                if (results.length > 0) {
                    setUsers(results);
                    setStatus("found");
                } else {
                    setUsers([]);
                    setStatus("not-found");
                }
            } catch (error) {
                setUsers([]);
                setStatus("error");
            }
        };

        fetchUsers();
    }, [debouncedQuery]);

    return (
        <div className={cn("w-full pb-4", className)}>
            <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                    {status === "searching" ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Search className="h-5 w-5 text-foreground" strokeWidth={1.65} />}
                </span>
                <input
                    placeholder="Tìm người dùng theo tên hoặc email..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex h-11 w-full rounded-xl border border-border/60 bg-muted/30 px-4 py-2 text-[15px] shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-10 pr-9"
                />
                {query && <button onClick={() => { setQuery(""); setUsers([]); setStatus("idle"); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>

            {status === "searching" && (
                <p className="text-xs text-muted-foreground mt-2 px-1 flex items-center gap-1.5 animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" /> Đang tìm kiếm...
                </p>
            )}

            {status === "not-found" && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="h-4 w-4 shrink-0 flex items-center justify-center font-bold text-xs ring-1 ring-destructive rounded-full">!</span>
                    <p className="text-xs font-medium">Không tìm thấy người dùng nào phù hợp.</p>
                </div>
            )}

            {status === "error" && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                    <X className="h-4 w-4 shrink-0" />
                    <p className="text-xs font-medium">Đã có lỗi xảy ra khi tìm kiếm.</p>
                </div>
            )}

            {status === "found" && users.length > 0 && (
                <div className="mt-2 max-h-[300px] overflow-y-auto beautiful-scrollbar pr-1 flex flex-col gap-1">
                    {users.map((user) => (
                        <UserSearchItem key={user._id} user={user} onOpenChat={onOpenChat} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default UserSearch;
