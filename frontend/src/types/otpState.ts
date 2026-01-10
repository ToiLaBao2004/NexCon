export default interface OTPState {
  loading: boolean;

  sendOtpCreateUser: (email: string) => Promise<void>;

  sendOtpResetPassword: (email: string) => Promise<void>;

  verifyOtpResetPassword: (email: string, otp: string) => Promise<void>;
}