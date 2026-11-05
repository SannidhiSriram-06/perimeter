import { Outlet } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';

export default function Layout() {
  const auth = useAuth();
  return (
    <>
      <header className="bar">
        <strong>Perimeter</strong>
        {auth.isAuthenticated && (
          <span>
            {auth.role === 'admin' ? 'Admin' : 'Team'} <button onClick={auth.logout}>Sign out</button>
          </span>
        )}
      </header>
      <div className="content"><Outlet /></div>
    </>
  );
}
