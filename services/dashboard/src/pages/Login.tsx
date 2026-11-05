import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { homeFor } from '../auth/RequireRole';

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.isAuthenticated && auth.role) return <Navigate to={homeFor(auth.role)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      navigate(homeFor(await auth.login(id.trim(), password)), { replace: true });
    } catch {
      // Same message for every failure so an ID is never confirmed or denied.
      setError('Invalid credentials');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>Sign in to Perimeter</h1>
      <form onSubmit={onSubmit}>
        <label>
          ID
          <input value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
