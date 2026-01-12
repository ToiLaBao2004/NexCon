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
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmNewPassword: z.string().min(8, "Password must be at least 8 characters")
})

type ResetPassFormValues = z.infer<typeof ResetPassSchema>

export function ResetPassForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { updateNewPassword } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const emailOTPResetPassData = location.state?.emailOTPResetPassData;
  const {register, handleSubmit, formState: {errors, isSubmitting}, setError} = useForm<ResetPassFormValues>({
    resolver: zodResolver(ResetPassSchema),
  });
  useEffect(() => {
    if (!emailOTPResetPassData) {
      navigate("/signin");
    }
  }, [emailOTPResetPassData, navigate]);
  const onSubmit = async (data: ResetPassFormValues) => {
    const { newPassword, confirmNewPassword } = data;
    try {
      await updateNewPassword(emailOTPResetPassData.email, newPassword, confirmNewPassword);
      navigate("/signin");
    } catch (error: any) {
      console.error("Update Password failed:", error);
      // map backend error message to form fields
      const backendMsg = error.response?.data?.message || "Update Password failed.";
      if (backendMsg.toLowerCase().includes("newPassword")) {
        setError("newPassword", { type: "server", message: backendMsg });
      } else if (backendMsg.toLowerCase().includes("confirmNewPassword")) {
        setError("confirmNewPassword", { type: "server", message: backendMsg });
      } else {
        setError("root", { type: "server", message: backendMsg });
      }
    }
  }
  return (
    <div className="items-center justify-center flex p-6 md:p-10">
      <div className={cn("flex flex-col gap-6 w-full max-w-md", className)} {...props}>
        <Card className="overflow-hidden border-border">
            <CardContent className="p-6 md:p-8">
            <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
                {/* header - logo */}
                <div className="flex flex-col items-center text-center gap-2">
                <a href="/" className="mx-auto block w-fit text-center">
                    <img src="/logo.svg" alt="logo" />
                </a>
                <h1 className="text-2xl font-bold">Moji</h1>
                <p className="text-sm text-muted-foreground text-balance">
                    Change your password.
                </p>
                </div>

                {/* new password */}
                <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="block text-sm">
                    New Password
                </Label>
                <Input
                    id="email"
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

                {/* confirm new password */}
                <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-sm">
                    Confirm New Password
                </Label>
                <Input
                    id="password"
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

                {/* submit */}
                <Button
                type="submit"
                className="w-full mt-3 cursor-pointer"
                disabled={isSubmitting}
                >
                Submit
                </Button>
            </form>
            </CardContent>
        </Card>

        <div className="text-xs text-center px-6 text-muted-foreground [a]:underline [a]:underline-offset-4 [a]:hover:text-primary text-balance">
            By clicking continue, you agree to our{" "}
            <a href="#" className="underline underline-offset-4">
            Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-4">
            Privacy Policy
            </a>.
        </div>
      </div>
    </div>
  );
}
