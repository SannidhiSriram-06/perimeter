import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { homeFor } from './auth/RequireRole';
import { Brand } from './components/art';
import { Avatar } from './components/ui';

const NAV = {
  admin: [
    ['/admin/incidents', 'Incidents'],
    ['/admin/services', 'Services'],
    ['/admin/on-call', 'On-call'],
    ['/admin/directory', 'Directory'],
    ['/admin/evaluation', 'Evaluation'],
  ],
  team_member: [
    ['/team', 'My incidents'],
    ['/team/services', 'My services'],
    ['/team/on-call', 'On-call'],
  ],
};

export default function Layout() {
  const auth = useAuth();
  const roleName = auth.role === 'admin' ? 'Admin' : 'Team member';
  return (
    <>
      {auth.role && (
        <header className="bar">
          <Link to={homeFor(auth.role)}><Brand /></Link>
          <nav aria-label="Primary">
            {NAV[auth.role].map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/team'}>{label}</NavLink>
            ))}
          </nav>
          <div className="bar-user">
            <Avatar name={roleName} />
            <span>{roleName}</span>
            <button className="link-button" onClick={auth.logout}>Sign out</button>
          </div>
        </header>
      )}
      <div className="content"><Outlet /></div>
    </>
  );
}
