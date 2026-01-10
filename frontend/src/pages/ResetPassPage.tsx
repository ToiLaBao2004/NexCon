import { ResetPassForm } from "../components/auth/resetpass-form";

const ResetPassPage = () => {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10 bg-gradient-purple">
      <div className="w-full max-w-sm md:max-w-4xl">
        <ResetPassForm />
      </div>
    </div>
  )
}

export default ResetPassPage;