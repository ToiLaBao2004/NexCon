import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FcGoogle } from "react-icons/fc"
import { useOTPStore } from "@/stores/useOtpStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { Link, useNavigate } from "react-router"
import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { authService } from "@/services/authService"
import { Textarea } from "@/components/ui/textarea"
import { ViolationHistoryList } from "@/components/moderation/ViolationHistoryList"
import type { ModerationStatusResponse } from "@/types/moderation"
import { formatModerationDate } from "@/lib/moderationNotice"

const emailSchema = z.string().trim().email("Địa chỉ email không hợp lệ")

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
})

const APPEAL_REASON_MIN_LENGTH = 20

type SignInFormValues = z.infer<typeof signInSchema>

const legalLinkClass =
  "font-normal text-primary underline underline-offset-4 decoration-primary/40 transition-colors hover:text-primary/80 hover:decoration-primary"

export function SigninForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signIn, loginGoogle } = useAuthStore();
  const { sendOtpResetPassword } = useOTPStore();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const [lockedDetails, setLockedDetails] = useState<Partial<ModerationStatusResponse> | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [hasPendingAppeal, setHasPendingAppeal] = useState(false);
  const appealReasonLength = appealReason.trim().length;
  const isAppealReasonTooShort = appealReasonLength < APPEAL_REASON_MIN_LENGTH;

  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, clearErrors, watch } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInFormValues) => {
    const { email, password } = data;
    try {
      setLockedMessage(null);
      setLockedDetails(null);
      setHasPendingAppeal(false);
      await signIn(email, password);
      const role = useAuthStore.getState().user?.role;
      navigate(role === "admin" ? "/admin" : "/");
    } catch (error: any) {
      console.error("Sign in failed:", error);
      const backendMsg = error.response?.data?.message || "Đăng nhập thất bại.";
      if (error.response?.status === 423 || error.response?.data?.locked) {
        setLockedMessage(backendMsg);
        setLockedDetails({
          summary: error.response?.data?.violationSummary,
          restriction: error.response?.data?.restriction,
          history: error.response?.data?.violationHistory || [],
          appeal: error.response?.data?.appeal,
        });
        setHasPendingAppeal(!error.response?.data?.appeal?.canSubmit && error.response?.data?.appeal?.status === "pending");
        clearErrors("root");
        return;
      }
      if (backendMsg.toLowerCase().includes("email")) {
        setError("email", { type: "server", message: backendMsg });
      } else if (backendMsg.toLowerCase().includes("password")) {
        setError("password", { type: "server", message: backendMsg });
      } else {
        setError("root", { type: "server", message: backendMsg });
      }
    }
  }

  const handleForgotPassword = async () => {
    const emailValue = watch("email")?.trim();
    const emailResult = emailSchema.safeParse(emailValue);

    if (!emailValue) {
      setError("email", {
        type: "manual",
        message: "Vui lòng nhập email của bạn để đặt lại mật khẩu",
      });
      return;
    }

    if (!emailResult.success) {
      setError("email", {
        type: "manual",
        message: emailResult.error.issues[0]?.message || "Địa chỉ email không hợp lệ",
      });
      return;
    }

    try {
      await sendOtpResetPassword(emailResult.data);
      navigate("/otp-resetpass", {
        state: {
          emailOTPResetPassData: { email: emailResult.data }
        }
      });
    } catch (error: any) {
      console.error("Send OTP failed:", error);
      const backendMsg = error.response?.data?.message || "Gửi mã OTP thất bại.";
      if (backendMsg.toLowerCase().includes("email")) {
        setError("email", { type: "server", message: backendMsg });
      } else if (backendMsg.toLowerCase().includes("password")) {
        setError("password", { type: "server", message: backendMsg });
      } else {
        setError("root", { type: "server", message: backendMsg });
      }
    }
  }

  const handleGoogleSignIn = async () => {
    const success = await loginGoogle();
    if (success) {
      const role = useAuthStore.getState().user?.role;
      navigate(role === "admin" ? "/admin" : "/");
    }
  }

  const handleSubmitAppeal = async () => {
    const emailValue = watch("email");
    if (!emailValue) {
      setError("email", {
        type: "manual",
        message: "Vui lòng nhập email để gửi kháng cáo",
      });
      return;
    }

    try {
      setAppealSubmitting(true);
      await authService.submitLockedAppeal(emailValue, appealReason);
      setLockedMessage("Đã gửi kháng cáo. Vui lòng chờ admin xem xét.");
      setAppealReason("");
      setHasPendingAppeal(true);
    } catch (error: any) {
      setLockedMessage(error.response?.data?.message || "Không thể gửi kháng cáo.");
      if (error.response?.data?.code === "PENDING_APPEAL_EXISTS" || error.response?.status === 409) {
        setHasPendingAppeal(true);
      }
    } finally {
      setAppealSubmitting(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0 border-border">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-6"></div>
            {/* header - logo */}
            <div className="flex flex-col items-center text-center gap-2">
              <a href="/" className="mx-auto block w-fit text-center">
                <img src="/logo.svg" alt="logo" />
              </a>
              <h1 className="text-2xl font-bold">NexCon</h1>
              <p className="text-sm text-muted-foreground text-balance">
                Đăng nhập vào tài khoản NexCon của bạn để tiếp tục
              </p>
            </div>
            {/* email */}
            <div className="flex flex-col gap-2 mt-3">
              <Label htmlFor="email" className="block text-sm">
                Email
              </Label>
              <Input id="email" type="text" placeholder="nexcon@gmail.com" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            {/* password */}
            <div className="flex flex-col gap-2 mt-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm">
                  Mật khẩu
                </Label>
                <a onClick={handleForgotPassword} className="text-center text-sm underline-offset-4 hover:underline cursor-pointer">
                  Quên mật khẩu?
                </a>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pr-10"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {/* submit button */}
            <Button type="submit" className="w-full mt-5 cursor-pointer" disabled={isSubmitting}>
              Đăng nhập
            </Button>
            {/* global error message */}
            {errors.root && <p className="text-sm text-destructive mt-2">{errors.root.message}</p>}
            {lockedMessage && (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-semibold text-destructive">
                  {lockedDetails?.restriction?.locked ? "Tài khoản đang bị hạn chế" : "Không thể đăng nhập"}
                </p>
                <p className="mt-1 text-sm text-destructive/90">{lockedMessage}</p>
                {lockedDetails?.summary && (
                  <div className="mt-3 grid gap-2 rounded-md border border-destructive/20 bg-background/70 p-3 text-xs text-muted-foreground">
                    <span>
                      Số lần vi phạm còn hiệu lực: {lockedDetails.summary.count ?? 0}/{lockedDetails.summary.threshold ?? 0}
                    </span>
                    <span>
                      Lần gần nhất: {formatModerationDate(lockedDetails.summary.lastViolationAt)}
                    </span>
                    <span>
                      Thời gian block: {lockedDetails.restriction?.blockedUntil
                        ? `đến ${formatModerationDate(lockedDetails.restriction.blockedUntil)}`
                        : "không thời hạn, đến khi admin mở khóa hoặc chấp nhận khiếu nại"}
                    </span>
                  </div>
                )}
                {lockedDetails?.history && lockedDetails.history.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Lịch sử vi phạm gần đây
                    </p>
                    <ViolationHistoryList items={lockedDetails.history.slice(0, 3)} compact />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Link className="font-medium text-primary hover:underline" to="/community-standards">
                    Xem tiêu chuẩn cộng đồng
                  </Link>
                  <Link className="font-medium text-primary hover:underline" to="/privacy">
                    Chính sách quyền riêng tư
                  </Link>
                </div>
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={appealReason}
                    onChange={(event) => setAppealReason(event.target.value)}
                    placeholder="Mô tả lý do bạn muốn kháng cáo khóa tài khoản"
                    className="min-h-24 resize-none bg-background"
                    maxLength={2000}
                  />
                  <div className="flex justify-end">
                    <span
                      className={cn(
                        "text-xs",
                        isAppealReasonTooShort ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {Math.min(appealReasonLength, APPEAL_REASON_MIN_LENGTH)}/{APPEAL_REASON_MIN_LENGTH}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full cursor-pointer"
                    disabled={hasPendingAppeal || appealSubmitting || isAppealReasonTooShort}
                    onClick={handleSubmitAppeal}
                  >
                    {hasPendingAppeal ? "Đang chờ xem xét" : "Gửi kháng cáo"}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-center my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="px-2 text-xs text-muted-foreground">Hoặc tiếp tục với</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Button type="button" variant="outline" className="w-full flex items-center justify-center gap-2 cursor-pointer" onClick={handleGoogleSignIn}>
              <FcGoogle className="h-5 w-5" />Tiếp tục với Google
            </Button>
            <div className="text-center text-sm mt-3">
              Bạn chưa có tài khoản?{" "}<a href="/signup" className="underline underline-offset-4 hover:text-primary">Đăng ký</a>
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
      <div className="px-6 text-center text-xs leading-5 text-slate-600 text-balance dark:text-white/85">
        Khi tiếp tục sử dụng NexCon, bạn đồng ý với <Link className={legalLinkClass} to="/terms">Điều khoản sử dụng</Link>,{" "}
        <Link className={legalLinkClass} to="/community-standards">Tiêu chuẩn cộng đồng</Link> và{" "}
        <Link className={legalLinkClass} to="/privacy">Chính sách quyền riêng tư</Link>.
      </div>
    </div>
  )
}
