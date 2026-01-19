import { useAuthStore } from '@/stores/useAuthStore';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router';

const ProtectedRoute = () => {
  const { accessToken, user, loading, refreshToken, fetchMe } = useAuthStore();
  const [ starting, setStarting ] = useState(true);
  const ranRef = useRef(false); // to prevent double execution in StrictMode

  const init = async () => {
    try {
      if (!accessToken) {
        await refreshToken();
      }

      if (accessToken && !user) {
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
    return <div className='flex h-screen items-center justify-center'>Loading...</div>;
  }

  if (!accessToken) {
    return (
      <Navigate to="/signin" replace />
    )
  }
  return (
		<Outlet></Outlet>
  );
}

export default ProtectedRoute;