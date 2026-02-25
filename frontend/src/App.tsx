import { BrowserRouter, Route, Routes } from "react-router";
import ChatAppPage from "./pages/ChatAppPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import OtpPage from "./pages/OtpPage";
import OtpResetPassPage from "./pages/OtpResetPassPage";
import ResetPassPage from "./pages/ResetPassPage";
import { Toaster } from "sonner";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import OAuthSuccess from "./components/auth/OAuthSuccess";
import { useThemeStore } from "./stores/useThemeStore";
import { useEffect } from "react";
import { useAuthStore } from "./stores/useAuthStore";
import { useSocketStore } from "./stores/useSocketStore";

function App() {
  const {isDark, setTheme} = useThemeStore();
  const {accessToken} = useAuthStore();
  const {connectSocket, disconnectSocket} = useSocketStore();

  useEffect(() => {
    setTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    if (accessToken) {
      connectSocket();
    }

    return () => disconnectSocket();
  }, [accessToken]);

  return (
    <>
      <Toaster richColors />
        <BrowserRouter>
          <Routes>
            {/* public routes */}
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/otp" element={<OtpPage />} />
            <Route path="/otp-resetpass" element={<OtpResetPassPage />} />
            <Route path="/reset-password" element={<ResetPassPage />} />
            <Route path="/oauth-success" element={<OAuthSuccess />} />
            {/* private routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<ChatAppPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
    </>
  );
}

export default App;
