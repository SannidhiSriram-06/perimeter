import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import { RequireRole, homeFor } from './auth/RequireRole';
import { useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import AdminHome from './pages/AdminHome';
import EvaluationPage from './pages/admin/EvaluationPage';
import TeamHome from './pages/TeamHome';

function Index() {
  const auth = useAuth();
  return <Navigate to={auth.role ? homeFor(auth.role) : '/login'} replace />;
}

// To add a page: create it in src/pages and add a <Route> inside the matching guard below.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireRole role="admin" />}>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/evaluation" element={<EvaluationPage />} />
        </Route>
        <Route element={<RequireRole role="team_member" />}>
          <Route path="/team" element={<TeamHome />} />
        </Route>
        <Route path="*" element={<Index />} />
      </Route>
    </Routes>
  );
}
