import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Shield, KeyRound, ChevronRight, ArrowLeft, Monitor, Trash2, LogOut, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/useAuthStore";
import type { SessionInfo } from "@/types/authState";
import { cn } from "@/lib/utils";

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z.string().min(8, "Mật khẩu mới phải từ 8 ký tự trở lên"),
    confirmNewPassword: z.string().min(8, "Xác nhận mật khẩu mới phải từ 8 ký tự trở lên"),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmNewPassword"],
});

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

interface SecurityTabProps {
    onForgotPassword: () => void;
}

export function SecurityTab({ onForgotPassword }: SecurityTabProps) {
    const [view, setView] = useState<"overview" | "change-password" | "sessions">("overview");
    const { changePassword, getSessions, signOutBySession, signOutAll, sessions, sessionsLoading, user } = useAuthStore();
    const isGoogleUser = !!user?.googleId;
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleSignOutBySession = async (sessionId: string) => {
        setDeletingId(sessionId);
        try {
            await signOutBySession(sessionId);
        } finally {
            setDeletingId(null);
        }
    };

    useEffect(() => {
        if (view === "sessions") {
            getSessions();
        }
    }, [view]);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        setError,
        reset
    } = useForm<ChangePasswordFormValues>({
        resolver: zodResolver(changePasswordSchema),
    });

    const onSubmitPassword = async (data: ChangePasswordFormValues) => {
        try {
            await changePassword(data.currentPassword, data.newPassword);
            reset();
            setView("overview");
        } catch (error: any) {
            const backendMsg = error.response?.data?.message || "Đổi mật khẩu thất bại.";
            if (backendMsg.toLowerCase().includes("hiện tại")) {
                setError("currentPassword", { type: "server", message: backendMsg });
            } else {
                setError("root", { type: "server", message: backendMsg });
            }
        }
    };

    if (view === "sessions") {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-2 -ml-2">
                    <Button variant="ghost" size="icon" onClick={() => setView("overview")}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h3 className="text-lg font-semibold">Thiết bị đăng nhập</h3>
                        <p className="text-sm text-muted-foreground">Quản lý các phiên đang hoạt động</p>
                    </div>
                </div>

                {sessionsLoading ? (
                    <p className="text-sm text-muted-foreground">Đang tải...</p>
                ) : (
                    <div className="space-y-3">
                        {sessions.map((session: SessionInfo) => (
                            <div
                                key={session.sessionId}
                                className="flex items-center justify-between p-4 border border-border/50 rounded-lg"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-muted rounded-full">
                                        <Monitor className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">{session.deviceName}</p>
                                            {session.isCurrent && (
                                                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                                    Thiết bị này
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{session.ip}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Đăng nhập lúc {new Date(session.loginAt).toLocaleString('vi-VN')}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    disabled={deletingId === session.sessionId}
                                    onClick={() => handleSignOutBySession(session.sessionId)}
                                >
                                    {deletingId === session.sessionId
                                        ? <span className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
                                        : <Trash2 className="w-4 h-4" />
                                    }
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                <Button
                    variant="destructive"
                    className="w-full"
                    onClick={signOutAll}
                >
                    <LogOut className="w-4 h-4 mr-2" />
                    Đăng xuất tất cả thiết bị
                </Button>
            </div>
        );
    }

    if (view === "change-password") {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-2 -ml-2">
                    <Button variant="ghost" size="icon" onClick={() => {
                        setView("overview");
                        reset();
                        setShowCurrentPassword(false);
                        setShowNewPassword(false);
                        setShowConfirmPassword(false);
                    }}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h3 className="text-lg font-semibold">Đổi mật khẩu</h3>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onSubmitPassword)} className="space-y-4 max-w-sm ml-2 mt-4">
                    {/* Mật khẩu hiện tại */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
                            <button
                                type="button"
                                onClick={onForgotPassword}
                                className="text-xs underline-offset-4 hover:underline cursor-pointer text-muted-foreground hover:text-primary bg-none border-none p-0"
                            >
                                Quên mật khẩu?
                            </button>
                        </div>
                        <div className="relative">
                            <Input
                                id="currentPassword"
                                type={showCurrentPassword ? "text" : "password"}
                                {...register("currentPassword")}
                                placeholder="••••••••"
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword(prev => !prev)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {errors.currentPassword && (
                            <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
                        )}
                    </div>

                    {/* Mật khẩu mới */}
                    <div className="space-y-2">
                        <Label htmlFor="newPassword">Mật khẩu mới</Label>
                        <div className="relative">
                            <Input
                                id="newPassword"
                                type={showNewPassword ? "text" : "password"}
                                {...register("newPassword")}
                                placeholder="••••••••"
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword(prev => !prev)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {errors.newPassword && (
                            <p className="text-sm text-destructive">{errors.newPassword.message}</p>
                        )}
                    </div>

                    {/* Xác nhận mật khẩu mới */}
                    <div className="space-y-2">
                        <Label htmlFor="confirmNewPassword">Xác nhận mật khẩu mới</Label>
                        <div className="relative">
                            <Input
                                id="confirmNewPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                {...register("confirmNewPassword")}
                                placeholder="••••••••"
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(prev => !prev)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {errors.confirmNewPassword && (
                            <p className="text-sm text-destructive">{errors.confirmNewPassword.message}</p>
                        )}
                    </div>

                    {errors.root && (
                        <p className="text-sm text-destructive mt-2">{errors.root.message}</p>
                    )}

                    <Button type="submit" disabled={isSubmitting} className="w-full mt-4">
                        Xác nhận đổi mật khẩu
                    </Button>
                </form>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold">Bảo mật</h3>
                </div>
                <p className="text-sm text-muted-foreground">Bảo vệ thông tin và tài khoản của bạn</p>
            </div>
            <div className="space-y-4">
                <div
                    className={cn(
                        "flex items-center justify-between p-4 border border-border/50 rounded-lg transition-colors group",
                        isGoogleUser
                            ? "opacity-50 cursor-not-allowed"
                            : "cursor-pointer hover:bg-muted/50"
                    )}
                    onClick={() => !isGoogleUser && setView("change-password")}
                >
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "p-2.5 rounded-full transition-colors",
                            isGoogleUser
                                ? "bg-muted text-muted-foreground"
                                : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                        )}>
                            <KeyRound className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-medium">Đổi mật khẩu</p>
                            {isGoogleUser && (
                                <p className="text-xs text-muted-foreground">Tài khoản Google không dùng mật khẩu</p>
                            )}
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>

                <div
                    className="flex items-center justify-between p-4 border border-border/50 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors group"
                    onClick={() => setView("sessions")}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-primary/10 rounded-full text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <Monitor className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-medium">Thiết bị đăng nhập</p>
                            <p className="text-sm text-muted-foreground">Quản lý các phiên đang hoạt động</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
            </div>
        </div>
    );
}