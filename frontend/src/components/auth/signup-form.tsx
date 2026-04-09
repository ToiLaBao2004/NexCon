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
import { useNavigate } from "react-router"

const signUpSchema = z.object({
  firstname: z.string().min(1, "Tên là bắt buộc"),
  lastname: z.string().min(1, "Họ là bắt buộc"),
  email: z.string().trim().email("Địa chỉ email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
})

type SignUpFormValues = z.infer<typeof signUpSchema>

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { verifyValidFieldsSignUp } = useAuthStore();
  const { sendOtpCreateUser } = useOTPStore();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
  });
  const onSubmit = async (data: SignUpFormValues) => {
    const { firstname, lastname, email, password } = data;
    try {
      await verifyValidFieldsSignUp(email, password);
      await sendOtpCreateUser(email);
      navigate("/otp", {
        state: {
          signupData: { firstname, lastname, email, password }
        }
      });
    } catch (error: any) {
      console.error("Sign up failed:", error);
      // map backend error message to form fields
      const backendMsg = error.response?.data?.message || "Đăng ký thất bại.";
      if (backendMsg.toLowerCase().includes("email")) {
        setError("email", { type: "server", message: backendMsg });
      } else if (backendMsg.toLowerCase().includes("password")) {
        setError("password", { type: "server", message: backendMsg });
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
                {/* todo: error message */}
                {errors.lastname && <p className="text-sm text-destructive">{errors.lastname.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstname" className="block text-sm">
                  Tên
                </Label>
                <Input id="firstname" type="text" placeholder="Tên" {...register("firstname")} />
                {/* todo: error message */}
                {errors.firstname && <p className="text-sm text-destructive">{errors.firstname.message}</p>}
              </div>
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
              <Label htmlFor="password" className="block text-sm">
                Mật khẩu
              </Label>
              <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
              {/* todo: error message */}
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
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
      <div className="text-xs text-center px-6 text-muted-foreground [a]:underline [a]:underline-offset-4 [a]:hover:text-primary text-balance">
        Bằng cách nhấp vào tiếp tục, bạn đồng ý với của chúng tôi <a href="#" className="underline underline-offset-4">Điều khoản dịch vụ</a>{" "}
        và <a href="#" className="underline underline-offset-4">Chính sách bảo mật</a>.
      </div>
    </div>
  )
}
