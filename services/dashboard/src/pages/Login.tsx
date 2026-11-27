import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { homeFor } from '../auth/RequireRole';
import { Brand } from '../components/art';
import { GatePlate } from '../components/plates';

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
    <main className="signin">
      <section className="drawing">
        <Link to="/" aria-label="Perimeter home"><Brand /></Link>
        <GatePlate />
        <p className="eyebrow">Plate 02 · The gate</p>
      </section>
      <section className="form">
        <div>
          <h1>Welcome back.</h1>
          <p className="lead">Sign in with the ID your workspace admin gave you.</p>
          <form onSubmit={onSubmit} aria-label="Sign in">
            <label>
              User ID
              <input id="uid" value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" autoComplete="username" placeholder="5 or 6 digits" required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Your password" required />
            </label>
            {error && <p role="alert" className="error">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="note">no ID yet, or locked out? ask an admin on your team.</p>
        </div>
      </section>
    </main>
  );
}
