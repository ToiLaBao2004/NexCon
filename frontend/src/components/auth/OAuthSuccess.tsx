import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/stores/useAuthStore';

export default function OAuthSuccess() {
  const navigate = useNavigate();
  const handleGoogleCallback = useAuthStore(s => s.handleGoogleCallback);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    handleGoogleCallback()
      .then(() => {
        const role = useAuthStore.getState().user?.role;
        navigate(role === 'admin' ? '/admin/overview' : '/');
      })
      .catch(() => navigate('/signin'));
  }, []);

  return <div>Signing you in...</div>;
}
