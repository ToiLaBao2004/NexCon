import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Shield, KeyRound, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userService } from "@/services/userService";

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
    const [view, setView] = useState<"overview" | "change-password">("overview");

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
            await userService.changePassword({
                currentPassword: data.currentPassword,
                newPassword: data.newPassword
            });
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

    if (view === "change-password") {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-2 -ml-2">
                    <Button variant="ghost" size="icon" onClick={() => {
                        setView("overview");
                        reset();
                    }}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h3 className="text-lg font-semibold">Đổi mật khẩu</h3>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onSubmitPassword)} className="space-y-4 max-w-sm ml-2 mt-4">
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
                        <Input
                            id="currentPassword"
                            type="password"
                            {...register("currentPassword")}
                            placeholder="••••••••"
                        />
                        {errors.currentPassword && (
                            <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="newPassword">Mật khẩu mới</Label>
                        <Input
                            id="newPassword"
                            type="password"
                            {...register("newPassword")}
                            placeholder="••••••••"
                        />
                        {errors.newPassword && (
                            <p className="text-sm text-destructive">{errors.newPassword.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmNewPassword">Xác nhận mật khẩu mới</Label>
                        <Input
                            id="confirmNewPassword"
                            type="password"
                            {...register("confirmNewPassword")}
                            placeholder="••••••••"
                        />
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
                    className="flex items-center justify-between p-4 border border-border/50 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors group"
                    onClick={() => setView("change-password")}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-primary/10 rounded-full text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <KeyRound className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-medium">Đổi mật khẩu</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
            </div>
        </div>
    );
}
