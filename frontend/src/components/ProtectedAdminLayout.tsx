import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { AdminLayout } from '@/components/AdminLayout';

export function ProtectedAdminLayout() {
  const { isAuthenticated, role } = useAuth();
  const queryClient = useQueryClient();

  // Token present but role unrecognised (corrupted/tampered JWT) — hard purge
  const hasValidRole = role === 'admin' || role === 'dispatcher';

  useEffect(() => {
    if (isAuthenticated && !hasValidRole) {
      sessionStorage.removeItem('mpwik_token');
      sessionStorage.removeItem('mpwik_refresh_token');
    }
  }, [isAuthenticated, hasValidRole]);

  useEffect(() => {
    if (!isAuthenticated || !hasValidRole) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/v1/ws`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { entity?: string };
        if (msg.entity === 'events') {
          queryClient.invalidateQueries({ queryKey: ['events'] });
          window.dispatchEvent(new CustomEvent('mpwik:events:invalidate'));
        }
      } catch {
        // ignoruj niepoprawne wiadomości
      }
    };

    return () => {
      ws.close();
    };
  }, [isAuthenticated, hasValidRole, queryClient]);

  if (!isAuthenticated || !hasValidRole) {
    return <Navigate to="/sys-panel/login" replace />;
  }

  return <AdminLayout />;
}
