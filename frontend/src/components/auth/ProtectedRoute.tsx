import { useAuthStore } from '@/stores/useAuthStore';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router';

const ProtectedRoute = () => {
  const { accessToken, user, loading, refreshToken, fetchMe } = useAuthStore();
  const [starting, setStarting] = useState(true);
  const ranRef = useRef(false); // to prevent double execution in StrictMode

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
      console.log("Auth init failed:", error);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (ranRef.current) return; // to prevent double execution in StrictMode
    ranRef.current = true; // to prevent double execution in StrictMode
    init();
  }, []);

  if (starting || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-primary"></div>
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <Navigate to="/signin" replace />
    )
  }

  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <Outlet></Outlet>
  );
}

export default ProtectedRoute;
