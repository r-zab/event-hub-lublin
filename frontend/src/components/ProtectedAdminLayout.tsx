import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AdminLayout } from '@/components/AdminLayout';

export function ProtectedAdminLayout() {
  const { isAuthenticated, role } = useAuth();

  // Token present but role unrecognised (corrupted/tampered JWT) — hard purge
  const hasValidRole = role === 'admin' || role === 'dispatcher';

  useEffect(() => {
    if (isAuthenticated && !hasValidRole) {
      sessionStorage.removeItem('mpwik_token');
      sessionStorage.removeItem('mpwik_refresh_token');
    }
  }, [isAuthenticated, hasValidRole]);

  if (!isAuthenticated || !hasValidRole) {
    return <Navigate to="/sys-panel/login" replace />;
  }

  return <AdminLayout />;
}
