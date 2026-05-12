import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { UserActionDropdown } from "./UserActionDropdown";
import { FriendActionButtons } from "@/components/people/FriendActionButtons";
import { useAuthStore } from "@/stores/useAuthStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useUserStore } from "@/stores/useUserStore";
import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ConfirmationModal } from "./ConfirmationModal";
import { Flag, Loader2, UserMinus, UserPlus, Mail, Phone, Info, Check, X as CloseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { User } from "@/types/user";
import { ReportDialog } from "./ReportDialog";

interface UserProfile {
    _id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
    bio?: string;
    phone?: string;
}

interface UserProfileDialogProps {
    user: UserProfile | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenChat?: (user: any) => void;
}

export function UserProfileDialog({ user, open, onOpenChange, onOpenChat }: UserProfileDialogProps) {
    const { user: currentUser } = useAuthStore();
    const { getUserById } = useUserStore();
    const {
        friends, sentRequests, incomingRequests,
        sendFriendRequest, cancelFriendRequest, unfriendUser,
        fetchSentRequests, acceptFriendRequest, rejectFriendRequest
    } = useFriendStore();

    const [actionLoading, setActionLoading] = useState(false);
    const [requestMessage, setRequestMessage] = useState("");
    const [unfriendModalOpen, setUnfriendModalOpen] = useState(false);
    const [fullUser, setFullUser] = useState<User | null>(null);
    const [albumArt, setAlbumArt] = useState<string | null>(null);
    const [reportOpen, setReportOpen] = useState(false);

    useEffect(() => {
        if (open && user?._id) {
            setFullUser(null);
            setAlbumArt(null);
            getUserById(user._id).then((u) => {
                setFullUser(u);
                if (u?.music?.trackId) {
                    fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${u.music.trackId}`)
                        .then((r) => r.json())
                        .then((data) => setAlbumArt(data.thumbnail_url ?? null))
                        .catch(() => null);
                }
            }).catch(console.error);
        }
    }, [open, user?._id]);

    if (!user) return null;

    const isSelf = currentUser?._id === user._id;
    const isFriend = !!friends.find(f => f.friendId === user._id);
    const pendingRequest = sentRequests.find((r) => r.to._id === user._id);
    const receivedRequest = incomingRequests.find((r) => r.from._id === user._id);

    const handleAction = async (action: () => Promise<void>) => {
        try {
            setActionLoading(true);
            await action();
        } finally {
            setActionLoading(false);
        }
    };

    const onSendRequest = async () => {
        await handleAction(async () => {
            await sendFriendRequest(user.email, requestMessage);
            await fetchSentRequests();
            setRequestMessage("");
        });
    };

    const onCancelRequest = async () => {
        if (!pendingRequest) return;
        handleAction(() => cancelFriendRequest(pendingRequest._id));
    };

    const renderActions = () => {
        if (isSelf) return null;

        if (isFriend) {
            return (
                <div className="w-full flex flex-col gap-2 mt-6">
                    <FriendActionButtons
                        userId={user._id}
                        displayName={user.displayName}
                        onChat={(e) => {
                            e.stopPropagation();
                            onOpenChange(false);
                            onOpenChat?.({ friendId: user._id, ...user });
                        }}
                        onUnfriend={async (e) => {
                            e.stopPropagation();
                            setUnfriendModalOpen(true);
                        }}
                        isProcessing={actionLoading}
                        variant="full"
                    />
                </div>
            );
        }

        if (receivedRequest) {
            return (
                <div className="w-full flex flex-col gap-2 mt-6">
                    <div className="flex gap-2">
                        <Button
                            onClick={() => handleAction(() => acceptFriendRequest(receivedRequest._id))}
                            disabled={actionLoading}
                            className="flex-1 gap-2 rounded-xl h-10 font-semibold shadow-glow"
                        >
                            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Đồng ý
                        </Button>
                        <Button
                            onClick={() => handleAction(() => rejectFriendRequest(receivedRequest._id))}
                            variant="outline"
                            disabled={actionLoading}
                            className="flex-1 gap-2 rounded-xl h-10 font-semibold border-destructive/30 text-destructive hover:bg-destructive/10"
                        >
                            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloseIcon className="h-4 w-4" />}
                            Từ chối
                        </Button>
                    </div>
                    <UserActionDropdown
                        userId={user._id}
                        displayName={user.displayName}
                        variant="outline"
                        mode="button"
                    />
                </div>
            );
        }

        return (
            <div className="w-full flex flex-col gap-2 mt-6">
                {!pendingRequest && (
                    <div className="w-full mb-2">
                        <Input
                            placeholder="Lời nhắn kết bạn..."
                            value={requestMessage}
                            onChange={(e) => setRequestMessage(e.target.value)}
                            className="bg-muted/30 rounded-xl h-10 text-xs"
                        />
                    </div>
                )}
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
                    {pendingRequest ? "Hủy lời mời" : "Gửi lời mời kết bạn"}
                </Button>

                <UserActionDropdown
                    userId={user._id}
                    displayName={user.displayName}
                    variant="outline"
                    mode="button"
                />
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) { setFullUser(null); setAlbumArt(null); } }}>
            <DialogContent className="sm:max-w-md border-primary/10 shadow-2xl p-0 overflow-hidden rounded-2xl bg-background z-[210]">

                {/* Banner */}
                <div className="relative overflow-hidden" style={{ height: fullUser?.music?.trackId ? "152px" : "128px" }}>
                    {/* Background: album art blur hoặc gradient */}
                    {albumArt ? (
                        <>
                            <img src={albumArt} alt="" className="absolute inset-0 w-full h-full object-cover scale-110" />
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                        </>
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
                    )}

                    <DialogHeader className="p-4 absolute top-0 left-0">
                        <DialogTitle className="text-sm font-medium opacity-0">Thông tin cá nhân</DialogTitle>
                        <DialogDescription className="opacity-0">.</DialogDescription>
                    </DialogHeader>

                    {fullUser?.music?.trackId && (
                        <div className="absolute bottom-4 left-0 right-1 px-4 pb-0">
                            <iframe
                                src={`https://open.spotify.com/embed/track/${fullUser.music.trackId}?utm_source=generator&theme=0`}
                                width="100%"
                                height="80"
                                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                loading="lazy"
                                className="rounded-t-xl"
                            />
                        </div>
                    )}
                </div>

                <div className="px-8 pb-8 -mt-16 flex flex-col items-center">
                    <Avatar className="h-32 w-32 ring-4 ring-background border-4 border-background shadow-xl mb-4 bg-muted">
                        <AvatarImage src={user.avatarUrl} className="object-cover" />
                        <AvatarFallback className="text-4xl font-bold bg-primary/10 text-primary">
                            {user.displayName.charAt(0)}
                        </AvatarFallback>
                    </Avatar>

                    <div className="text-center w-full">
                        <h3 className="text-2xl font-bold text-foreground">
                            {user.displayName} {isSelf && <span className="text-sm font-normal text-muted-foreground ml-1">(Bạn)</span>}
                        </h3>

                        <div className="flex flex-col gap-3 mt-6 w-full text-left bg-muted/20 p-4 rounded-xl border border-border/40">
                            <div className="flex items-center gap-3 text-sm">
                                <Mail className="h-4 w-4 text-primary shrink-0" />
                                <span className="text-foreground/80 truncate" title={user.email}>{user.email}</span>
                            </div>

                            {user.phone && (
                                <div className="flex items-center gap-3 text-sm">
                                    <Phone className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-foreground/80">{user.phone}</span>
                                </div>
                            )}

                            <div className="flex gap-3 text-sm pt-2 border-t border-border/40">
                                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Tiểu sử</p>
                                    <p className="text-foreground/90 italic leading-relaxed">
                                        {user.bio || "Chưa có tiểu sử."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {renderActions()}

                    {!isSelf && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setReportOpen(true)}
                            className="mt-3 w-full gap-2 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                            <Flag className="h-4 w-4" />
                            Báo cáo người dùng
                        </Button>
                    )}
                </div>
            </DialogContent>

            <ConfirmationModal
                isOpen={unfriendModalOpen}
                onClose={() => setUnfriendModalOpen(false)}
                onConfirm={async () => {
                    await handleAction(() => unfriendUser(user._id));
                    setUnfriendModalOpen(false);
                }}
                title="Hủy kết bạn?"
                description={`Bạn có chắc chắn muốn hủy kết bạn với ${user.displayName}?`}
                confirmText="Hủy kết bạn"
                variant="destructive"
                isLoading={actionLoading}
            />

            {!isSelf && (
                <ReportDialog
                    open={reportOpen}
                    onOpenChange={setReportOpen}
                    targetType="user"
                    targetId={user._id}
                    targetName={user.displayName}
                />
            )}
        </Dialog>
    );
}
