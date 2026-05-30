import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { NotificationTab } from "./NotificationTab";
import { SecurityTab } from "./SecurityTab";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { useOTPStore } from "@/stores/useOtpStore";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Bell, Flag, Shield, Eye, EyeOff } from "lucide-react";
import { ReportHistoryContent } from "@/pages/ReportHistoryPage";
import { getApiErrorField, getApiErrorMessage } from "@/lib/apiMessage";

const resetPassSchema = z.object({
    newPassword: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
    confirmNewPassword: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự")
}).refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Mật khẩu không khớp",
    path: ["confirmNewPassword"],
});

type ResetPassFormValues = z.infer<typeof resetPassSchema>;

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type TabType = "notifications" | "security" | "reports";

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const [activeTab, setActiveTab] = useState<TabType>("notifications");
    const [forgotPassStep, setForgotPassStep] = useState<"none" | "otp" | "reset">("none");
    const [otp, setOtp] = useState("");
    const [otpError, setOtpError] = useState<string | null>(null);
    const [otpLoading, setOtpLoading] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const { user, resetNewPassword } = useAuthStore();
    const { sendOtpResetPassword, verifyOtpResetPassword } = useOTPStore();

    const [resetToken, setResetToken] = useState<string>("");

    useEffect(() => {
        if (forgotPassStep !== "otp" || countdown <= 0) return;
        const timer = setInterval(() => {
            setCountdown((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [countdown, forgotPassStep]);

    const { register: registerReset, handleSubmit: handleSubmitReset, formState: { errors: errorsReset, isSubmitting: isSubmittingReset }, setError: setErrorReset, reset: resetResetForm } = useForm<ResetPassFormValues>({
        resolver: zodResolver(resetPassSchema),
    });

    const handleForgotPassword = async () => {
        if (!user?.email) {
            toast.error("Không tìm thấy email người dùng");
            return;
        }
        try {
            await sendOtpResetPassword(user.email);
            setForgotPassStep("otp");
            setCountdown(60);
            setOtp("");
            setOtpError(null);
            resetResetForm();
        } catch (error: any) {
            console.error("Lỗi gửi OTP:", error);
            toast.error(getApiErrorMessage(error, "Gửi mã OTP thất bại."));
        }
    };

    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (otp.length < 6) return;
        setOtpError(null);
        setOtpLoading(true);
        try {
            const resetToken = await verifyOtpResetPassword(user!.email, otp);
            setResetToken(resetToken);
            setForgotPassStep("reset");
        } catch (err: any) {
            setOtpError(getApiErrorMessage(err, "Mã OTP không hợp lệ."));
        } finally {
            setOtpLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (countdown > 0) return;
        try {
            await sendOtpResetPassword(user!.email);
            setCountdown(60);
            setOtpError(null);
        } catch (err: any) {
            setOtpError(getApiErrorMessage(err, "Gửi lại mã OTP thất bại."));
        }
    };

    const onResetSubmit = async (data: ResetPassFormValues) => {
        try {
            await resetNewPassword(resetToken, data.newPassword, data.confirmNewPassword);
            onOpenChange(false);
        } catch (error: any) {
            const message = getApiErrorMessage(error, "Cập nhật mật khẩu thất bại.");
            const field = getApiErrorField(error);
            if (field === "newPassword" || field === "password") {
                setErrorReset("newPassword", { type: "server", message });
            } else if (field === "confirmPassword") {
                setErrorReset("confirmNewPassword", { type: "server", message });
            } else {
                setErrorReset("root", { type: "server", message });
            }
        }
    };

    useEffect(() => {
        if (!open) {
            const timer = setTimeout(() => {
                setActiveTab("notifications");
                setForgotPassStep("none");
                setOtpError(null);
                setOtp("");
                resetResetForm();
                setShowNewPassword(false);
                setShowConfirmPassword(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [open, resetResetForm]);

    const handleOpenChange = (isOpen: boolean) => {
        onOpenChange(isOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className={cn(
                "gap-0 w-screen h-[100dvh] max-w-none rounded-none border-0 bg-background top-0 left-0 translate-x-0 translate-y-0 sm:h-auto sm:rounded-2xl sm:border sm:border-border/50 sm:shadow-xl sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]",
                forgotPassStep === "none"
                    ? "p-0 sm:max-w-[860px] overflow-hidden mobile-safe-area-y"
                    : "p-4 sm:max-w-md sm:p-6 overflow-hidden mobile-safe-area-y-padded"
            )}>
                <DialogHeader className="sr-only">
                    <DialogTitle>Cai dat</DialogTitle>
                    <DialogDescription>Tuy chinh thong bao, bao mat va tai khoan.</DialogDescription>
                </DialogHeader>
                {forgotPassStep === "none" ? (
                    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card sm:h-[560px] sm:flex-row">
                        {/* Sidebar */}
                        <div className="w-full sm:w-[240px] bg-muted/30 border-b sm:border-b-0 sm:border-r border-border/50 flex flex-col p-4 sm:p-5 overflow-hidden">
                            <h2 className="mb-3 px-1 text-[22px] font-bold tracking-tight text-foreground sm:mb-6">Cài đặt</h2>
                            <div className="beautiful-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-1 sm:overflow-visible sm:px-0 sm:pb-0">
                                <button
                                    onClick={() => setActiveTab("notifications")}
                                    className={cn(
                                        "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-[15px] font-semibold text-foreground transition-colors sm:w-full sm:shrink",
                                        (activeTab === "notifications") ? "bg-primary/15" : "hover:bg-muted/60"
                                    )}
                                >
                                    <Bell className="w-4 h-4 shrink-0" />
                                    Thông báo
                                </button>
                                <button
                                    onClick={() => setActiveTab("security")}
                                    className={cn(
                                        "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-[15px] font-semibold text-foreground transition-colors sm:w-full sm:shrink",
                                        (activeTab === "security") ? "bg-primary/15" : "hover:bg-muted/60"
                                    )}
                                >
                                    <Shield className="w-4 h-4 shrink-0" />
                                    Bảo mật
                                </button>
                                <button
                                    onClick={() => setActiveTab("reports")}
                                    className={cn(
                                        "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-[15px] font-semibold text-foreground transition-colors sm:w-full sm:shrink",
                                        (activeTab === "reports") ? "bg-primary/15" : "hover:bg-muted/60"
                                    )}
                                >
                                    <Flag className="w-4 h-4 shrink-0" />
                                    Báo cáo
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="beautiful-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
                            <div className="p-5 sm:p-6 h-full min-w-0 overflow-x-hidden relative">
                                {activeTab === "notifications" && <NotificationTab />}
                                {activeTab === "security" && <SecurityTab onForgotPassword={handleForgotPassword} />}
                                {activeTab === "reports" && <ReportHistoryContent embedded />}
                            </div>
                        </div>
                    </div>
                ) : forgotPassStep === "otp" ? (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                        <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
                            <div className="flex flex-col items-center gap-2 mb-4">
                                <h2 className="text-[18px] font-semibold tracking-tight">Nhập mã OTP</h2>
                                <p className="text-sm text-muted-foreground text-center">
                                    Mã đã được gửi đến <span className="font-medium">{user?.email}</span>
                                </p>
                            </div>
                            <form onSubmit={handleOtpSubmit} className="space-y-4">
                                <InputOTP value={otp} onChange={setOtp} maxLength={6}>
                                    <InputOTPGroup className="gap-2 mx-auto mt-2">
                                        {[0, 1, 2, 3, 4, 5].map((i) => (
                                            <InputOTPSlot key={i} index={i} />
                                        ))}
                                    </InputOTPGroup>
                                </InputOTP>
                                {otpError && <p className="text-destructive text-sm text-center">{otpError}</p>}
                                <Button type="submit" disabled={otpLoading || otp.length < 6} className="w-full rounded-xl text-sm font-semibold">
                                    {otpLoading ? "Đang xác thực..." : "Xác thực"}
                                </Button>
                                <p className="text-xs text-center text-muted-foreground mt-2">
                                    Bạn không nhận được mã?{" "}
                                    {countdown > 0 ? (
                                        <span className="text-muted-foreground">Gửi lại sau {countdown}s</span>
                                    ) : (
                                        <span className="text-primary cursor-pointer hover:underline underline-offset-2" onClick={handleResendOtp}>
                                            Gửi lại
                                        </span>
                                    )}
                                </p>
                            </form>
                        </div>
                    </div>
                ) : (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                        <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
                            <div className="flex flex-col items-center gap-2 mb-4">
                                <h2 className="text-[18px] font-semibold tracking-tight">Mật khẩu mới</h2>
                                <p className="text-sm text-muted-foreground text-center">
                                    Nhập mật khẩu mới cho tài khoản của bạn.
                                </p>
                            </div>
                            <form onSubmit={handleSubmitReset(onResetSubmit)} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="resetNewPassword">Mật khẩu mới</Label>
                                    <div className="relative">
                                        <Input
                                            id="resetNewPassword"
                                            type={showNewPassword ? "text" : "password"}
                                            {...registerReset("newPassword")}
                                            placeholder="••••••••"
                                            className="pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword((prev) => !prev)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                            tabIndex={-1}
                                        >
                                            {showNewPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {errorsReset.newPassword && (
                                        <p className="text-sm text-destructive">{errorsReset.newPassword.message}</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="resetConfirmNewPassword">Xác nhận mật khẩu mới</Label>
                                    <div className="relative">
                                        <Input
                                            id="resetConfirmNewPassword"
                                            type={showConfirmPassword ? "text" : "password"}
                                            {...registerReset("confirmNewPassword")}
                                            placeholder="••••••••"
                                            className="pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword((prev) => !prev)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                            tabIndex={-1}
                                        >
                                            {showConfirmPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {errorsReset.confirmNewPassword && (
                                        <p className="text-sm text-destructive">{errorsReset.confirmNewPassword.message}</p>
                                    )}
                                </div>
                                {errorsReset.root && (
                                    <p className="text-sm text-destructive mt-2">{errorsReset.root.message}</p>
                                )}
                                <Button type="submit" disabled={isSubmittingReset} className="w-full mt-4 rounded-xl text-sm font-semibold">
                                    Lưu mật khẩu mới
                                </Button>
                            </form>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
