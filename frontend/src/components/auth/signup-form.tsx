import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuthStore } from "@/stores/useAuthStore"
import { useOTPStore } from "@/stores/useOtpStore"
import { Link, useNavigate } from "react-router"
import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { checkFieldFormat } from "@/lib/fieldFormat"
import { getApiErrorField, getApiErrorMessage } from "@/lib/apiMessage"

const signUpSchema = z.object({
  firstname: z.string().min(1, "Tên là bắt buộc"),
  lastname: z.string().min(1, "Họ là bắt buộc"),
  email: z.string().trim().email("Địa chỉ email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
  confirmPassword: z.string().min(1, "Xác nhận mật khẩu là bắt buộc"),
  termsAccepted: z.boolean().refine((value) => value, {
    message: "Vui lòng đồng ý với điều khoản và chính sách của NexCon",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Mật khẩu không khớp",
  path: ["confirmPassword"],
})

type SignUpFormValues = z.infer<typeof signUpSchema>

const legalLinkClass =
  "font-normal text-primary underline underline-offset-4 decoration-primary/40 transition-colors hover:text-primary/80 hover:decoration-primary"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { verifyValidFieldsSignUp } = useAuthStore();
  const { sendOtpCreateUser } = useOTPStore();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      termsAccepted: false,
    },
  });

  const onSubmit = async (data: SignUpFormValues) => {
    const { firstname, lastname, email, password, confirmPassword } = data;
    const displayNameError = checkFieldFormat("displayName", `${firstname} ${lastname}`);
    if (displayNameError) {
      setError("root", { type: "manual", message: displayNameError });
      return;
    }

    try {
      await verifyValidFieldsSignUp(email, password, confirmPassword);
      await sendOtpCreateUser(email);
      navigate("/otp", {
        state: {
          signupData: { firstname, lastname, email, password }
        }
      });
    } catch (error: any) {
      console.error("Sign up failed:", error);
      const message = getApiErrorMessage(error, "Đăng ký thất bại.");
      const field = getApiErrorField(error);
      if (field === "email") {
        setError("email", { type: "server", message });
      } else if (field === "password") {
        setError("password", { type: "server", message });
      } else if (field === "confirmPassword") {
        setError("confirmPassword", { type: "server", message });
      } else {
        setError("root", { type: "server", message });
      }
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
              <h1 className="text-2xl font-bold">Tạo tài khoản NexCon</h1>
              <p className="text-sm text-muted-foreground text-balance">
                Bắt đầu hành trình của bạn với NexCon ngay hôm nay!
              </p>
            </div>
            {/* name */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="space-y-2">
                <Label htmlFor="lastname" className="block text-sm">
                  Họ
                </Label>
                <Input id="lastname" type="text" placeholder="Họ" {...register("lastname")} />
                {errors.lastname && <p className="text-sm text-destructive">{errors.lastname.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstname" className="block text-sm">
                  Tên
                </Label>
                <Input id="firstname" type="text" placeholder="Tên" {...register("firstname")} />
                {errors.firstname && <p className="text-sm text-destructive">{errors.firstname.message}</p>}
              </div>
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
              <Label htmlFor="password" className="block text-sm">
                Mật khẩu
              </Label>
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
            {/* confirm password */}
            <div className="flex flex-col gap-2 mt-3">
              <Label htmlFor="confirmPassword" className="block text-sm">
                Xác nhận mật khẩu
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pr-10"
                  {...register("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showConfirmPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
            </div>
            <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
                  {...register("termsAccepted")}
                />
                <span className="text-justify">
                  Tôi đồng ý với <Link className={legalLinkClass} to="/terms">Điều khoản sử dụng</Link>,{" "}
                  <Link className={legalLinkClass} to="/community-standards">Tiêu chuẩn cộng đồng</Link> và{" "}
                  <Link className={legalLinkClass} to="/privacy">Chính sách quyền riêng tư</Link> của NexCon.
                </span>
              </label>
              {errors.termsAccepted && <p className="text-xs text-destructive">{errors.termsAccepted.message}</p>}
            </div>
            {/* submit button */}
            <Button type="submit" className="w-full mt-5" disabled={isSubmitting}>
              Đăng ký
            </Button>
            {/* global error message */}
            {errors.root && <p className="text-sm text-destructive mt-2">{errors.root.message}</p>}
            <div className="text-center text-sm mt-3">
              Bạn đã có tài khoản?{" "}<a href="/signin" className="underline underline-offset-4 hover:text-primary">Đăng nhập</a>
            </div>
          </form>
          <div className="bg-muted relative hidden md:block">
            <img
              src="/placeholderSignUp.png"
              alt="Image"
              className="absolute top-1/2 -translate-y-1/2 object-cover"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
