import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuthStore } from "@/stores/useAuthStore"
import { useNavigate, useLocation } from "react-router"
import { useEffect } from "react"

const ResetPassSchema = z.object({
  newPassword: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
  confirmNewPassword: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự")
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Mật khẩu không khớp",
  path: ["confirmNewPassword"],
});

type ResetPassFormValues = z.infer<typeof ResetPassSchema>

export function ResetPassForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { updateNewPassword, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const emailOTPResetPassData = location.state?.emailOTPResetPassData;
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<ResetPassFormValues>({
    resolver: zodResolver(ResetPassSchema),
  });

  useEffect(() => {
    if (!emailOTPResetPassData) {
      navigate(user ? "/" : "/signin");
    }
  }, [emailOTPResetPassData, navigate, user]);

  const onSubmit = async (data: ResetPassFormValues) => {
    const { newPassword, confirmNewPassword } = data;
    try {
      await updateNewPassword(emailOTPResetPassData.email, newPassword, confirmNewPassword);
      navigate(user ? "/" : "/signin");
    } catch (error: any) {
      console.error("Update Password failed:", error);
      // Map errors
      const backendMsg = error.response?.data?.message || "Cập nhật mật khẩu thất bại.";
      if (backendMsg.toLowerCase().includes("newpassword")) {
        setError("newPassword", { type: "server", message: backendMsg });
      } else if (backendMsg.toLowerCase().includes("confirmnewpassword")) {
        setError("confirmNewPassword", { type: "server", message: backendMsg });
      } else {
        setError("root", { type: "server", message: backendMsg });
      }
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0 border-border">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit(onSubmit)}>
            {/* Spacer */}
            <div className="flex flex-col gap-6"></div>
            {/* Header */}
            <div className="flex flex-col items-center text-center gap-2">
              <a href="/" className="mx-auto block w-fit text-center">
                <img src="/logo.svg" alt="logo" />
              </a>
              <h1 className="text-2xl font-bold">NexCon</h1>
              <p className="text-sm text-muted-foreground text-balance">
                Thay đổi mật khẩu của bạn.
              </p>
            </div>

            {/* New password */}
            <div className="flex flex-col gap-2 mt-3">
              <Label htmlFor="newPassword" className="block text-sm">
                Mật khẩu mới
              </Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                {...register("newPassword")}
              />
              {errors.newPassword && (
                <p className="text-sm text-destructive">
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            {/* Confirm password */}
            <div className="flex flex-col gap-2 mt-3">
              <Label htmlFor="confirmNewPassword" className="text-sm">
                Xác nhận mật khẩu mới
              </Label>
              <Input
                id="confirmNewPassword"
                type="password"
                placeholder="••••••••"
                {...register("confirmNewPassword")}
              />
              {errors.confirmNewPassword && (
                <p className="text-sm text-destructive">
                  {errors.confirmNewPassword.message}
                </p>
              )}
            </div>

            {/* Root error */}
            {errors.root && (
               <p className="text-sm text-destructive mt-2">
                 {errors.root.message}
               </p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full mt-5 cursor-pointer"
              disabled={isSubmitting}
            >
              Xác nhận
            </Button>
            
            <div className="text-center text-sm mt-3">
              Quay lại {" "}
              <a href={user ? "/" : "/signin"} className="underline underline-offset-4 hover:text-primary">
                {user ? "Trang chủ" : "Đăng nhập"}
              </a>
            </div>
          </form>

          <div className="bg-muted relative hidden md:block">
            <img
              src="/placeholder.png"
              alt="Image"
              className="absolute top-1/2 -translate-y-1/2 object-cover"
            />
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-center px-6 text-muted-foreground [a]:underline [a]:underline-offset-4 [a]:hover:text-primary text-balance">
        Bằng cách nhấp vào tiếp tục, bạn đồng ý với của chúng tôi{" "}
        <a href="#" className="underline underline-offset-4">
          Điều khoản dịch vụ
        </a>{" "}
        và{" "}
        <a href="#" className="underline underline-offset-4">
          Chính sách bảo mật
        </a>.
      </div>
    </div>
  );
}
