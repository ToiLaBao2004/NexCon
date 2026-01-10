import { OTPForm } from "../components/auth/otp-form-resetpassword"

const OtpResetPassPage = () => {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10 bg-gradient-purple">
      <div className="w-full max-w-sm md:max-w-4xl">
        <OTPForm />
      </div>
    </div>
  )
}

export default OtpResetPassPage;