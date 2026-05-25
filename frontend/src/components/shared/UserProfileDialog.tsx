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
import { useImageViewerStore } from "@/stores/useImageViewerStore";
import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ConfirmationModal } from "./ConfirmationModal";
import { Flag, Loader2, UserMinus, UserPlus, Mail, Phone, Info, Check, X as CloseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileVisibility, User } from "@/types/user";
import { ReportDialog } from "./ReportDialog";
import { useSocketStore } from "@/stores/useSocketStore";
import StatusBadge from "@/components/chat/StatusBadge";
import { getPresenceBadgeStatus, getPresenceForUser, getPresenceText } from "@/utils/userPresence";

interface UserProfile {
    _id: string;
    displayName: string;
    email?: string;
    avatarUrl?: string;
    bio?: string;
    phone?: string;
    profileVisibility?: ProfileVisibility;
    profileVisibleToViewer?: boolean;
}

interface UserProfileDialogProps {
    user: UserProfile | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenChat?: (user: any) => void;
    previewAsOther?: boolean;
}

export function UserProfileDialog({ user, open, onOpenChange, onOpenChat, previewAsOther = false }: UserProfileDialogProps) {
    const { user: currentUser } = useAuthStore();
    const { getUserById } = useUserStore();
    const {
        friends, sentRequests, incomingRequests,
        sendFriendRequest, cancelFriendRequest, unfriendUser,
        fetchSentRequests, acceptFriendRequest, rejectFriendRequest,
        blockedUsers, blockedBy, fetchBlockedList, unblockUser
    } = useFriendStore();

    const [actionLoading, setActionLoading] = useState(false);
    const [requestMessage, setRequestMessage] = useState("");
    const [unfriendModalOpen, setUnfriendModalOpen] = useState(false);
    const [fullUser, setFullUser] = useState<User | null>(null);
    const [albumArt, setAlbumArt] = useState<string | null>(null);
    const [reportOpen, setReportOpen] = useState(false);
    const [profileAccessBlocked, setProfileAccessBlocked] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);
    const { onlineUsers, userPresences } = useSocketStore();

    useEffect(() => {
        if (open && user?._id) {
            setFullUser(null);
            setAlbumArt(null);
            setProfileAccessBlocked(false);
            if (previewAsOther) {
                setFullUser({
                    ...(user as User),
                    profileVisibleToViewer: (user.profileVisibility || "public") === "public",
                });
                setProfileLoading(false);
                return;
            }
            setProfileLoading(true);
            void fetchBlockedList();
            getUserById(user._id).then((u) => {
                setFullUser(u);
                if (u?.music?.trackId) {
                    fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${u.music.trackId}`)
                        .then((r) => r.json())
                        .then((data) => setAlbumArt(data.thumbnail_url ?? null))
                        .catch(() => null);
                }
                setProfileLoading(false);
            }).catch((error) => {
                if (error?.response?.status === 403 || error?.response?.status === 404) {
                    setProfileAccessBlocked(true);
                    setProfileLoading(false);
                    return;
                }
                setProfileLoading(false);
                console.error(error);
            });
        }
    }, [fetchBlockedList, getUserById, open, previewAsOther, user]);

    if (!user) return null;

    const isSelf = !previewAsOther && currentUser?._id === user._id;
    const isFriend = !!friends.find(f => f.friendId === user._id);
    const pendingRequest = sentRequests.find((r) => r.to._id === user._id);
    const receivedRequest = incomingRequests.find((r) => r.from._id === user._id);
    const isBlockedByMe = blockedUsers.some((blockedUser) => blockedUser._id === user._id);
    const isBlockedByOther = blockedBy.includes(user._id);
    const isBlockedRelation = !isSelf && (profileAccessBlocked || isBlockedByMe || isBlockedByOther);
    const profileDetails = fullUser ?? user;
    const profileDetailsHiddenByPrivacy = !profileLoading && !isBlockedRelation && fullUser?.profileVisibleToViewer === false;
    const shouldHideProfileDetails = profileLoading || isBlockedRelation || profileDetailsHiddenByPrivacy;
    const profileAvatarUrl = fullUser?.avatarUrl || user.avatarUrl || "";
    const canOpenAvatar = Boolean(profileAvatarUrl && !shouldHideProfileDetails);
    const profilePresence = getPresenceForUser(user._id, userPresences, fullUser?.presence ?? null, onlineUsers);
    const profileBadgeStatus = !shouldHideProfileDetails ? getPresenceBadgeStatus(profilePresence) : undefined;
    const profilePresenceText = !shouldHideProfileDetails ? getPresenceText(profilePresence) : "";
    const profileEmail = fullUser ? fullUser.email || "" : user.email || "";
    const profilePhone = profileDetails.phone || "";
    const profileBio = profileDetails.bio || "";
    const canSendFriendRequest = Boolean(user._id);

    const handleOpenAvatar = () => {
        if (!canOpenAvatar) return;

        useImageViewerStore.getState().openViewer({
            src: profileAvatarUrl,
            alt: `${user.displayName} avatar`,
        });
    };

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
            await sendFriendRequest({ userId: user._id, email: user.email }, requestMessage);
            await fetchSentRequests();
            setRequestMessage("");
        });
    };

    const onCancelRequest = async () => {
        if (!pendingRequest) return;
        handleAction(() => cancelFriendRequest(pendingRequest._id));
    };

    const onUnblock = async () => {
        await handleAction(async () => {
            await unblockUser(user._id);
            await fetchBlockedList(true);
            setProfileAccessBlocked(false);
        });
    };

    const onUnblockAndSendRequest = async () => {
        await handleAction(async () => {
            await sendFriendRequest({ userId: user._id, email: user.email }, requestMessage);
            await fetchSentRequests();
            await fetchBlockedList(true);
            setRequestMessage("");
            setProfileAccessBlocked(false);
            onOpenChange(false);
        });
    };

    const renderActions = () => {
        if (previewAsOther || isSelf) return null;

        if (isBlockedRelation) {
            if (!isBlockedByMe) {
                return (
                    <div className="mt-6 w-full rounded-xl border border-border/40 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                        Không thể xem thông tin hoặc tương tác với người dùng này.
                    </div>
                );
            }

            return (
                <div className="w-full flex flex-col gap-2 mt-6">
                    <Button
                        onClick={onUnblock}
                        variant="outline"
                        disabled={actionLoading}
                        className="w-full gap-2 rounded-xl h-10 font-semibold border-primary/20 text-primary hover:bg-primary/10"
                    >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                        Bỏ chặn
                    </Button>
                    <Button
                        onClick={onUnblockAndSendRequest}
                        disabled={actionLoading}
                        className="w-full gap-2 rounded-xl h-10 font-semibold shadow-glow"
                    >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                        Bỏ chặn và gửi lời mời kết bạn
                    </Button>
                </div>
            );
        }

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
                            maxLength={300}
                            className="bg-muted/30 rounded-xl h-10 text-xs"
                        />
                    </div>
                )}
                    <Button
                        onClick={pendingRequest ? onCancelRequest : onSendRequest}
                        variant={pendingRequest ? "outline" : "default"}
                        disabled={actionLoading || !canSendFriendRequest}
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
                <div className="relative overflow-hidden" style={{ height: !shouldHideProfileDetails && fullUser?.music?.trackId ? "152px" : "128px" }}>
                    {/* Background: album art blur hoặc gradient */}
                    {albumArt ? (
                        <>
                            <img
                                src={albumArt}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover scale-110"
                            />
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                        </>
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
                    )}

                    <DialogHeader className="p-4 absolute top-0 left-0">
                        <DialogTitle className="text-sm font-medium opacity-0">Thông tin cá nhân</DialogTitle>
                        <DialogDescription className="opacity-0">.</DialogDescription>
                    </DialogHeader>

                    {!shouldHideProfileDetails && fullUser?.music?.trackId && (
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
                    <button
                        type="button"
                        onClick={handleOpenAvatar}
                        disabled={!canOpenAvatar}
                        title={canOpenAvatar ? "Xem ảnh đại diện" : undefined}
                        className={cn(
                            "mb-4 rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            canOpenAvatar ? "cursor-zoom-in hover:scale-[1.03] active:scale-[0.99]" : "cursor-default",
                        )}
                    >
                        <span className="relative inline-flex">
                            <Avatar className="h-32 w-32 ring-4 ring-background border-4 border-background shadow-xl bg-muted">
                                <AvatarImage src={profileAvatarUrl || undefined} className="object-cover" />
                                <AvatarFallback className="text-4xl font-bold bg-primary/10 text-primary">
                                    {user.displayName.charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                            {profileBadgeStatus && <StatusBadge status={profileBadgeStatus} />}
                        </span>
                    </button>

                    <div className="text-center w-full">
                        <h3 className="text-2xl font-bold text-foreground">
                            {user.displayName} {isSelf && <span className="text-sm font-normal text-muted-foreground ml-1">(Bạn)</span>}
                        </h3>
                        {profilePresenceText && (
                            <p className="mt-1 text-sm text-muted-foreground">{profilePresenceText}</p>
                        )}

                        {!shouldHideProfileDetails && (
                            <div className="flex flex-col gap-3 mt-6 w-full text-left bg-muted/20 p-4 rounded-xl border border-border/40">
                                {profileEmail && (
                                    <div className="flex items-center gap-3 text-sm">
                                        <Mail className="h-4 w-4 text-primary shrink-0" />
                                        <span className="text-foreground/80 truncate" title={profileEmail}>{profileEmail}</span>
                                    </div>
                                )}

                                {profilePhone && (
                                    <div className="flex items-center gap-3 text-sm">
                                        <Phone className="h-4 w-4 text-primary shrink-0" />
                                        <span className="text-foreground/80">{profilePhone}</span>
                                    </div>
                                )}

                                <div className="flex gap-3 text-sm pt-2 border-t border-border/40">
                                    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Tiểu sử</p>
                                        <p className="text-foreground/90 italic leading-relaxed">
                                            {profileBio || "Chưa có tiểu sử."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {renderActions()}

                    {!previewAsOther && !isSelf && !isBlockedRelation && (
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

            {!previewAsOther && !isSelf && (
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
