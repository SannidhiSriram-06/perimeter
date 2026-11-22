import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import { RequireRole, homeFor } from './auth/RequireRole';
import { useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import AdminHome from './pages/AdminHome';
import DirectoryPage from './pages/admin/DirectoryPage';
import EvaluationPage from './pages/admin/EvaluationPage';
import ReviewPage from './pages/admin/ReviewPage';
import TeamPage from './pages/team/TeamPage';

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
          <Route path="/admin/directory" element={<DirectoryPage />} />
          <Route path="/admin/evaluation" element={<EvaluationPage />} />
          <Route path="/admin/incidents/:id/review" element={<ReviewPage />} />
        </Route>
        <Route element={<RequireRole role="team_member" />}>
          <Route path="/team" element={<TeamPage />} />
        </Route>
        <Route path="*" element={<Index />} />
      </Route>
    </Routes>
  );
}
