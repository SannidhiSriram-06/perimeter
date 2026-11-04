import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { Role } from '../api/client';

export const homeFor = (role: Role): string => (role === 'admin' ? '/admin' : '/team');

/**
 * Route guard. Not signed in -> /login. Signed in with the wrong role -> that role's own home.
 * This is a UX convenience only; the BFF enforces authorization on every request.
 */
export function RequireRole({ role }: { role: Role }) {
  const auth = useAuth();
  if (!auth.isAuthenticated || !auth.role) return <Navigate to="/login" replace />;
  if (auth.role !== role) return <Navigate to={homeFor(auth.role)} replace />;
  return <Outlet />;
}
