import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Send, UserPlus } from "lucide-react";
import { UserProfileDialog } from "../shared/UserProfileDialog";

type RequestsTabProps = {
    sentRequests: any[];
    incomingRequests: any[];
    processingId: string | null;
    onCancel: (id: string) => Promise<void>;
    onAccept: (id: string) => Promise<void>;
    onReject: (id: string) => Promise<void>;
    onOpenChat: (user: any) => void;
};

const panelClass = "flex min-h-0 flex-1 flex-col overflow-hidden";
const panelBodyClass = "beautiful-scrollbar min-h-0 flex-1 overflow-y-auto pr-1";
const requestItemClass =
    "group flex min-h-[84px] items-center gap-4 rounded-xl border border-transparent bg-transparent px-4 py-3.5 transition-colors hover:bg-muted/60";

const getInitial = (name?: string) => name?.trim()?.charAt(0)?.toUpperCase() || "?";

export default function RequestsTab({
    sentRequests,
    incomingRequests,
    processingId,
    onCancel,
    onAccept,
    onReject,
    onOpenChat,
}: RequestsTabProps) {
    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [activeView, setActiveView] = useState<"incoming" | "sent">("incoming");

    const handleOpenProfile = (user: any) => {
        setSelectedUser(user);
        setIsProfileOpen(true);
    };

    return (
        <div className="relative flex h-full min-h-0 flex-col gap-4">
            <div className="grid shrink-0 grid-cols-2 gap-2 rounded-2xl bg-muted/40 p-1.5">
                <button
                    type="button"
                    onClick={() => setActiveView("incoming")}
                    className={`rounded-xl px-4 py-2.5 text-[15px] font-semibold transition-all duration-200 ${activeView === "incoming" ? "bg-card text-foreground shadow-sm" : "text-foreground hover:bg-card/60"}`}
                >
                    Lời mời đến
                    <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {incomingRequests.length}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveView("sent")}
                    className={`rounded-xl px-4 py-2.5 text-[15px] font-semibold transition-all duration-200 ${activeView === "sent" ? "bg-card text-foreground shadow-sm" : "text-foreground hover:bg-card/60"}`}
                >
                    Lời mời đã gửi
                    <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {sentRequests.length}
                    </span>
                </button>
            </div>

            <section className={`${panelClass} ${activeView === "sent" ? "flex" : "hidden"}`}>
                <div className={panelBodyClass}>
                    {sentRequests.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            {sentRequests.map((request) => (
                                <div key={request._id} className={requestItemClass}>
                                    <Avatar className="h-14 w-14 shrink-0 cursor-pointer" onClick={() => handleOpenProfile(request.to)}>
                                        <AvatarImage src={request.to.avatarUrl} />
                                        <AvatarFallback>{getInitial(request.to.displayName)}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleOpenProfile(request.to)}>
                                        <p className="truncate text-base font-semibold text-foreground">
                                            {request.to.displayName}
                                        </p>
                                        <p className="mt-1 truncate text-sm text-muted-foreground">
                                            {request.message || request.to.email}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onCancel(request._id)}
                                        className="h-9 shrink-0 rounded-full px-5 text-sm font-semibold shadow-sm transition-all active:scale-95"
                                    >
                                        Hủy
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-64 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/40 bg-muted/20 p-8 text-center text-muted-foreground">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                                <Send className="-ml-1 h-8 w-8 text-muted-foreground opacity-50" />
                            </div>
                            <h3 className="mb-1 text-lg font-semibold text-foreground">Chưa gửi lời mời nào</h3>
                            <p className="max-w-xs text-sm">Những lời mời bạn đã gửi sẽ hiển thị tại đây.</p>
                        </div>
                    )}
                </div>
            </section>

            <section className={`${panelClass} ${activeView === "incoming" ? "flex" : "hidden"}`}>
                <div className={panelBodyClass}>
                    {incomingRequests.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            {incomingRequests.map((request) => {
                                const isProcessing = processingId === request._id;

                                return (
                                    <div key={request._id} className={requestItemClass}>
                                        <Avatar className="h-14 w-14 shrink-0 cursor-pointer" onClick={() => handleOpenProfile(request.from)}>
                                            <AvatarImage src={request.from.avatarUrl} />
                                            <AvatarFallback>{getInitial(request.from.displayName)}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleOpenProfile(request.from)}>
                                            <p className="truncate text-base font-semibold text-foreground">
                                                {request.from.displayName}
                                            </p>
                                            <p className="mt-1 truncate text-sm text-muted-foreground">
                                                {request.message || request.from.email}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
                                            <Button
                                                size="sm"
                                                disabled={isProcessing}
                                                onClick={() => onAccept(request._id)}
                                                className="h-9 rounded-full px-4 text-sm font-semibold shadow-sm transition-all active:scale-95 md:px-5"
                                            >
                                                {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                                Đồng ý
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={isProcessing}
                                                onClick={() => onReject(request._id)}
                                                className="h-9 rounded-full px-4 text-sm font-semibold shadow-sm transition-all active:scale-95 md:px-5"
                                            >
                                                Từ chối
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex h-64 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/40 bg-muted/20 p-8 text-center text-muted-foreground">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                                <UserPlus className="h-8 w-8 text-muted-foreground opacity-50" />
                            </div>
                            <h3 className="mb-1 text-lg font-semibold text-foreground">Chưa có lời mời đến</h3>
                            <p className="max-w-xs text-sm">Các yêu cầu kết bạn gửi đến bạn sẽ xuất hiện ở đây.</p>
                        </div>
                    )}
                </div>
            </section>

            <UserProfileDialog
                open={isProfileOpen}
                onOpenChange={setIsProfileOpen}
                user={
                    selectedUser
                        ? {
                            _id: selectedUser._id,
                            displayName: selectedUser.displayName,
                            email: selectedUser.email || "",
                            avatarUrl: selectedUser.avatarUrl,
                            bio: selectedUser.bio,
                            phone: selectedUser.phone,
                        }
                        : null
                }
                onOpenChat={(user) => {
                    setIsProfileOpen(false);
                    onOpenChat(user);
                }}
            />
        </div>
    );
}
