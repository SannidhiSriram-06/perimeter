import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configureApi, login as apiLogin, type Role } from '../api/client';

interface Session {
  token: string;
  role: Role;
}

interface AuthValue {
  role: Role | null;
  isAuthenticated: boolean;
  login: (id: string, password: string) => Promise<Role>;
  logout: () => void;
}

const KEY = 'perimeter.session';
const AuthContext = createContext<AuthValue | null>(null);

// sessionStorage only: cleared when the tab closes. Nothing else sensitive is stored next to it.
function load(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load);

  const logout = useCallback(() => {
    sessionStorage.removeItem(KEY);
    setSession(null);
  }, []);

  useEffect(() => {
    configureApi({ getToken: () => session?.token ?? null, onUnauthorized: logout });
  }, [session, logout]);

  const login = useCallback(async (id: string, password: string) => {
    const res = await apiLogin(id, password);
    const next = { token: res.token, role: res.role };
    sessionStorage.setItem(KEY, JSON.stringify(next));
    setSession(next);
    return res.role;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ role: session?.role ?? null, isAuthenticated: session !== null, login, logout }),
    [session, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
