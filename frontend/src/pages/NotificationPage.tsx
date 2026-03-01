import { useFriendStore } from "@/stores/useFriendStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, UserPlus, Check, X, Inbox, Loader2 } from "lucide-react";
import { useState } from "react";

const NotificationPage = () => {
    const { incomingRequests, acceptFriendRequest, rejectFriendRequest } = useFriendStore();
    const [processingId, setProcessingId] = useState<string | null>(null);

    const handleAccept = async (requestId: string) => {
        try {
            setProcessingId(requestId);
            await acceptFriendRequest(requestId);
        } catch {
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (requestId: string) => {
        try {
            setProcessingId(requestId);
            await rejectFriendRequest(requestId);
        } catch {
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="flex-1 h-full flex flex-col bg-card/20 rounded-2xl shadow-soft border border-border/40 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-sm">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-foreground">Thông báo</h1>
                    <p className="text-xs text-muted-foreground">
                        {incomingRequests.length > 0
                            ? `Bạn có ${incomingRequests.length} thông báo mới`
                            : "Không có thông báo mới"}
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {incomingRequests.length > 0 && (
                    <div className="px-4 pt-4 pb-2">
                        <div className="flex items-center gap-2 px-2 mb-3">
                            <UserPlus className="h-4 w-4 text-primary" />
                            <h2 className="text-sm font-semibold text-foreground">Lời mời kết bạn</h2>
                            <span className="ml-auto text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                {incomingRequests.length}
                            </span>
                        </div>
                        <div className="space-y-2">
                            {incomingRequests.map((request) => {
                                const isProcessing = processingId === request._id;
                                return (
                                    <div
                                        key={request._id}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40 hover:border-primary/20 hover:shadow-soft transition-all duration-200 animate-in fade-in slide-in-from-top-2"
                                    >
                                        <Avatar className="h-11 w-11 shrink-0 ring-2 ring-primary/10">
                                            <AvatarImage src={request.from.avatarUrl} />
                                            <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                                                {request.from.displayName.charAt(0)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-foreground truncate">
                                                {request.from.displayName}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {request.message
                                                    ? request.message
                                                    : `${request.from.email} muốn kết bạn với bạn`}
                                            </p>
                                            {request.createdAt && (
                                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                                    {new Date(request.createdAt).toLocaleString("vi-VN", {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                        year: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Button
                                                size="sm"
                                                disabled={isProcessing}
                                                onClick={() => handleAccept(request._id)}
                                                className="h-8 px-3 rounded-lg gap-1.5 text-xs font-semibold shadow-sm hover:shadow-primary/20 transition-all active:scale-95"
                                            >
                                                {isProcessing ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Check className="h-3.5 w-3.5" />
                                                )}
                                                Đồng ý
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={isProcessing}
                                                onClick={() => handleReject(request._id)}
                                                className="h-8 px-3 rounded-lg gap-1.5 text-xs font-semibold border-border/60 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all active:scale-95"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                                Từ chối
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {incomingRequests.length === 0 && (
                    <div className="flex-1 h-full flex flex-col items-center justify-center py-20 px-6">
                        <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                            <Inbox className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                        <h3 className="text-base font-semibold text-muted-foreground/70 mb-1">Không có thông báo</h3>
                        <p className="text-sm text-muted-foreground/50 text-center max-w-xs">
                            Khi có người gửi lời mời kết bạn cho bạn, thông báo sẽ xuất hiện ở đây.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationPage;
