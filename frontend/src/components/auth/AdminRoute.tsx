import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet } from "react-router";

export default function AdminRoute() {
  const { accessToken, user, loading, refreshToken, fetchMe } = useAuthStore();
  const [starting, setStarting] = useState(true);
  const ranRef = useRef(false);

  const init = async () => {
    try {
      if (!accessToken) {
        await refreshToken();
      }

      const latest = useAuthStore.getState();
      if (latest.accessToken && !latest.user) {
        await fetchMe();
      }
    } catch (error) {
      console.log("Admin auth init failed:", error);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void init();
  }, []);

  if (starting || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  const current = useAuthStore.getState();
  if (!current.accessToken) {
    return <Navigate to="/signin" replace />;
  }

  if ((current.user || user)?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
