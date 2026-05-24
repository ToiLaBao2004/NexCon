import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet } from "react-router";

export default function PublicAuthRoute() {
  const { accessToken, loading, refreshToken, fetchMe } = useAuthStore();
  const [checkingSession, setCheckingSession] = useState(!accessToken);
  const ranRef = useRef(false);

  useEffect(() => {
    if (accessToken) {
      setCheckingSession(false);
      return;
    }

    if (ranRef.current) return;
    ranRef.current = true;

    const restoreExistingSession = async () => {
      try {
        await refreshToken();

        const latest = useAuthStore.getState();
        if (latest.accessToken && !latest.user) {
          await fetchMe(true);
        }
      } catch {
        // No valid session cookie/mobile refresh token, keep the auth page visible.
      } finally {
        setCheckingSession(false);
      }
    };

    void restoreExistingSession();
  }, [accessToken, fetchMe, refreshToken]);

  if (checkingSession || (loading && !accessToken)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground">Đang kiểm tra phiên đăng nhập...</p>
      </div>
    );
  }

  const current = useAuthStore.getState();
  if (current.accessToken) {
    return <Navigate to={current.user?.role === "admin" ? "/admin" : "/chat"} replace />;
  }

  return <Outlet />;
}
