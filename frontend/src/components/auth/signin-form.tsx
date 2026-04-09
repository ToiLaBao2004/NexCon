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
import { useNavigate } from "react-router"

const signInSchema = z.object({
  email: z.string().trim().email("Địa chỉ email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
})

type SignInFormValues = z.infer<typeof signInSchema>

export function SigninForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signIn, loginGoogle } = useAuthStore();
  const { sendOtpResetPassword } = useOTPStore();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, watch } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
  });
  const onSubmit = async (data: SignInFormValues) => {
    const { email, password } = data;
    try {
      await signIn(email, password);
      navigate("/");
    } catch (error: any) {
      console.error("Sign in failed:", error);
      // map backend error message to form fields
      const backendMsg = error.response?.data?.message || "Đăng nhập thất bại.";
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
    const emailValue = watch("email");
    console.log("Forgot Password clicked, email:", emailValue);
    if (!emailValue) {
      setError("email", {
        type: "manual",
        message: "Vui lòng nhập email của bạn để đặt lại mật khẩu",
      });
      return;
    }
    try {
      await sendOtpResetPassword(emailValue);
      navigate("/otp-resetpass", {
        state: {
          emailOTPResetPassData: { email: emailValue }
        }
      });
    } catch (error: any) {
      console.error("Send OTP failed:", error);
      // map backend error message to form fields
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
    loginGoogle();
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
              {/* todo: error message */}
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
              <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
              {/* todo: error message */}
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {/* submit button */}
            <Button type="submit" className="w-full mt-5 cursor-pointer" disabled={isSubmitting}>
              Đăng nhập
            </Button>
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
      <div className="text-xs text-center px-6 text-muted-foreground [a]:underline [a]:underline-offset-4 [a]:hover:text-primary text-balance">
        Bằng cách nhấp vào tiếp tục, bạn đồng ý với của chúng tôi <a href="#" className="underline underline-offset-4">Điều khoản dịch vụ</a>{" "}
        và <a href="#" className="underline underline-offset-4">Chính sách bảo mật</a>.
      </div>
    </div>
  )
}
