import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type UserRole = 'admin' | 'dispatcher' | null;

interface AuthContextValue {
  isAuthenticated: boolean;
  role: UserRole;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

function parseJwtRole(token: string): UserRole {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const role = payload.role;
    if (role === 'admin' || role === 'dispatcher') return role;
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!sessionStorage.getItem('mpwik_token');
  });

  const [role, setRole] = useState<UserRole>(() => {
    const token = sessionStorage.getItem('mpwik_token');
    return token ? parseJwtRole(token) : null;
  });

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
      setIsAuthenticated(true);
      setRole(parseJwtRole(token));
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('mpwik_token');
    sessionStorage.removeItem('mpwik_refresh_token');
    setIsAuthenticated(false);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
