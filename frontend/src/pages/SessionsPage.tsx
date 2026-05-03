import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Monitor, Smartphone, Trash2, LogOut, ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/useAuthStore";
import type { SessionInfo } from "@/types/authState";
import { cn } from "@/lib/utils";

function getDeviceIcon(deviceName: string) {
    const n = deviceName.toLowerCase();
    if (n.includes("android") || n.includes("ios") || n.includes("iphone") || n.includes("ipad")) {
        return <Smartphone className="w-5 h-5" />;
    }
    return <Monitor className="w-5 h-5" />;
}

function formatTime(dateString: string) {
    const diff = Math.max(0, Date.now() - new Date(dateString).getTime());
    const m = 60_000, h = 3_600_000, d = 86_400_000;
    if (diff < m) return "Vừa xong";
    if (diff < h) return `${Math.floor(diff / m)} phút trước`;
    if (diff < d) return `${Math.floor(diff / h)} giờ trước`;
    return `${Math.floor(diff / d)} ngày trước`;
}

function isNewDevice(loginAt: string) {
    return Date.now() - new Date(loginAt).getTime() < 24 * 60 * 60 * 1000;
}

export default function SessionsPage() {
    const navigate = useNavigate();
    const { getSessions, signOutBySession, signOutAll, sessions, sessionsLoading } = useAuthStore();
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        getSessions();
    }, []);

    const handleSignOutBySession = async (sessionId: string) => {
        setDeletingId(sessionId);
        try {
            await signOutBySession(sessionId);
        } finally {
            setDeletingId(null);
        }
    };

    const currentSession = sessions.find(s => s.isCurrent);
    const otherSessions = sessions.filter(s => !s.isCurrent);
    const newDeviceCount = otherSessions.filter(s => isNewDevice(s.loginAt)).length;

    return (
        // Outer: full height, scroll toàn trang trên mobile
        <div className="
            overflow-y-auto
            relative flex-1 h-full overflow-hidden rounded-none border-0 bg-background md:rounded-3xl md:border md:border-border/60 md:shadow-soft
        ">
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 pb-24 md:pb-8">

                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-semibold">Thiết bị đăng nhập</h1>
                        <p className="text-sm text-muted-foreground">Quản lý các phiên đang hoạt động</p>
                    </div>
                </div>

                {sessionsLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
                        </div>
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:items-start">

                        {/* ── CỘT TRÁI ── */}
                        <div className="space-y-5">

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-muted/50 rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-1">Tổng phiên</p>
                                    <p className="text-2xl font-semibold">{sessions.length}</p>
                                </div>
                                <div className="bg-muted/50 rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-1">Thiết bị mới</p>
                                    <p className={cn(
                                        "text-2xl font-semibold",
                                        newDeviceCount > 0 && "text-amber-600 dark:text-amber-400"
                                    )}>
                                        {newDeviceCount}
                                    </p>
                                </div>
                                <div className="bg-muted/50 rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-1">Khác</p>
                                    <p className="text-2xl font-semibold">{otherSessions.length}</p>
                                </div>
                            </div>

                            {/* Warning banner */}
                            {newDeviceCount > 0 && (
                                <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                                    <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                            Phát hiện {newDeviceCount} thiết bị mới trong 24h qua
                                        </p>
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                            Nếu không phải bạn, hãy đăng xuất thiết bị đó ngay.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Phiên hiện tại */}
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                    Phiên hiện tại
                                </p>
                                {currentSession
                                    ? <SessionCard session={currentSession} isCurrent />
                                    : <p className="text-sm text-muted-foreground">Không tìm thấy phiên hiện tại.</p>
                                }
                            </div>
                        </div>

                        {/* ── CỘT PHẢI ── */}
                        {/*
                            Desktop: cột cao cố định, scroll bên trong, nút dính dưới
                            Mobile:  không giới hạn chiều cao, nút hiện sau list
                        */}
                        <div className="
                            flex flex-col gap-4
                            md:h-[520px]
                        ">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
                                Các thiết bị khác
                            </p>

                            {otherSessions.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-12 text-center">
                                    Không có thiết bị nào khác đang đăng nhập.
                                </p>
                            ) : (
                                <>
                                    {/* List: scroll trên desktop, tự giãn trên mobile */}
                                    <div className="
                                        space-y-2
                                        md:overflow-y-auto md:flex-1 md:pr-1
                                        beautiful-scrollbar
                                    ">
                                        {otherSessions.map(session => (
                                            <SessionCard
                                                key={session.sessionId}
                                                session={session}
                                                isNew={isNewDevice(session.loginAt)}
                                                isDeleting={deletingId === session.sessionId}
                                                onDelete={() => handleSignOutBySession(session.sessionId)}
                                            />
                                        ))}
                                    </div>

                                    {/* Nút luôn hiện, desktop dính dưới cột, mobile hiện sau list */}
                                    <Button
                                        variant="outline"
                                        className="w-full shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={signOutAll}
                                    >
                                        <LogOut className="w-4 h-4 mr-2" />
                                        Đăng xuất tất cả thiết bị khác
                                    </Button>
                                </>
                            )}
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}

interface SessionCardProps {
    session: SessionInfo;
    isCurrent?: boolean;
    isNew?: boolean;
    isDeleting?: boolean;
    onDelete?: () => void;
}

function SessionCard({ session, isCurrent, isNew, isDeleting, onDelete }: SessionCardProps) {
    return (
        <div className={cn(
            "flex items-center gap-4 p-4 rounded-xl border transition-colors",
            isCurrent
                ? "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20"
                : isNew
                    ? "border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10"
                    : "border-border/50 bg-card hover:bg-muted/30"
        )}>
            <div className={cn(
                "p-2.5 rounded-lg shrink-0",
                isCurrent
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
            )}>
                {getDeviceIcon(session.deviceName)}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{session.deviceName}</span>
                    {isCurrent && (
                        <span className="text-[11px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-full px-2 py-0.5 font-medium shrink-0">
                            Thiết bị này
                        </span>
                    )}
                    {isNew && !isCurrent && (
                        <span className="text-[11px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full px-2 py-0.5 font-medium shrink-0">
                            Mới
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{session.ip}</span>
                    <span>·</span>
                    <span>{formatTime(session.loginAt)}</span>
                </div>
            </div>

            {!isCurrent && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    disabled={isDeleting}
                    onClick={onDelete}
                >
                    {isDeleting
                        ? <span className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                    }
                </Button>
            )}
        </div>
    );
}