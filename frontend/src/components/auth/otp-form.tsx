import { useLocation, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/stores/useAuthStore";
import { useOTPStore } from "@/stores/useOtpStore";

export function OTPForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp } = useAuthStore();
  const { sendOtpCreateUser } = useOTPStore();

  const signupData = location.state?.signupData;

  const [otp, setOtp] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (!signupData) {
      navigate("/signup");
    }
  }, [signupData, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  })

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (otp.length < 6) {
      setError("Mã OTP phải có 6 chữ số");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await signUp(
        signupData.email,
        signupData.password,
        signupData.firstname,
        signupData.lastname,
        otp
      );

      navigate("/signin");
    } catch (err: any) {
      setError(err.response?.data?.message || "Mã OTP không hợp lệ.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      await sendOtpCreateUser(signupData.email);
    } catch (err: any) {
      setError(err.response?.data?.message || "Gửi lại mã OTP thất bại.");
      return;
    }
    setCountdown(60);
  }

  return (
    <div className="items-center justify-center flex p-6 md:p-10">
      <Card className="w-full max-w-sm p-0 border-border shadow-sm">
        <CardContent className="p-6 flex flex-col gap-6">

          {/* logo + header */}
          <div className="flex flex-col items-center text-center gap-2">
            <a href="/" className="mx-auto block w-fit text-center">
              <img src="/logo.svg" alt="logo" className="h-10" />
            </a>
            <h1 className="text-xl font-bold">Xác thực Email</h1>
            <p className="text-sm text-muted-foreground text-balance">
              Nhập mã 6 chữ số đã được gửi đến{" "}
              <span className="font-medium">{signupData?.email}</span>
            </p>
          </div>

          {/* form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <InputOTP value={otp} onChange={setOtp} maxLength={6}>
              <InputOTPGroup className="gap-2 mx-auto">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>

            {error && (
              <p className="text-destructive text-sm text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full"
            >
              {loading ? "Đang xác thực..." : "Xác thực"}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Bạn không nhận được mã?{" "}
              {countdown > 0 ? (
                <span className="text-muted-foreground"> Gửi lại sau {countdown}s</span>
              ) : (
                <span className="text-primary underline underline-offset-2 cursor-pointer" onClick={handleResend}>
                  Gửi lại
                </span>
              )}
            </p>
          </form>

        </CardContent>
      </Card>
    </div>
  );
}
