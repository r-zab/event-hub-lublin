import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

type UserRole = 'admin' | 'dispatcher' | null;

interface AuthContextValue {
  isAuthenticated: boolean;
  username: string | null;
  role: UserRole;
  department: string | null;
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  acknowledgeSessionExpiry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

function parseJwtPayload(token: string): { username: string | null; role: UserRole; department: string | null } {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role = payload.role === 'admin' || payload.role === 'dispatcher' ? payload.role : null;
    const department = typeof payload.dept === 'string' ? payload.dept : null;
    const username = typeof payload.sub === 'string' ? payload.sub : null;
    return { username, role, department };
  } catch {
    return { username: null, role: null, department: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!sessionStorage.getItem('mpwik_token');
  });

  const [username, setUsername] = useState<string | null>(() => {
    const token = sessionStorage.getItem('mpwik_token');
    return token ? parseJwtPayload(token).username : null;
  });

  const [role, setRole] = useState<UserRole>(() => {
    const token = sessionStorage.getItem('mpwik_token');
    return token ? parseJwtPayload(token).role : null;
  });

  const [department, setDepartment] = useState<string | null>(() => {
    const token = sessionStorage.getItem('mpwik_token');
    return token ? parseJwtPayload(token).department : null;
  });

  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener('mpwik:session-expired', handler);
    return () => window.removeEventListener('mpwik:session-expired', handler);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const body = new URLSearchParams();
      body.append('username', username);
      body.append('password', password);

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      if (!res.ok) return false;
      const data: { access_token?: string; refresh_token?: string } = await res.json();
      const token = data.access_token;
      if (!token) return false;
      // Purge stale session before writing new credentials — prevents cross-account token bleed
      sessionStorage.removeItem('mpwik_token');
      sessionStorage.removeItem('mpwik_refresh_token');
      sessionStorage.setItem('mpwik_token', token);
      if (data.refresh_token) {
        sessionStorage.setItem('mpwik_refresh_token', data.refresh_token);
      }
      const parsed = parseJwtPayload(token);
      setIsAuthenticated(true);
      setUsername(parsed.username);
      setRole(parsed.role);
      setDepartment(parsed.department);
      setSessionExpired(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('mpwik_token');
    sessionStorage.removeItem('mpwik_refresh_token');
    setIsAuthenticated(false);
    setUsername(null);
    setRole(null);
    setDepartment(null);
  }, []);

  const acknowledgeSessionExpiry = useCallback(() => {
    setSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, role, department, sessionExpired, login, logout, acknowledgeSessionExpiry }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
