import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import { PageHead } from '../components/ui';

const AREAS = [
  ['/admin/incidents', 'Incidents'],
  ['/admin/directory', 'Team Directory & Leave'],
  ['/admin/evaluation', 'Evaluation & Benchmark'],
];

export default function AdminHome() {
  return (
    <section>
      <PageHead title="Admin" lead="Perimeter system status, incident triage, and administrative controls." />

      <nav aria-label="Admin Navigation" className="actions">
        {AREAS.map(([to, label]) => (
          <Link key={to} className="button" to={to}>{label}</Link>
        ))}
      </nav>

      <div className="plate">
        <EmptyState
          title="No Active Incidents"
          subtitle="Zero active incidents or firing alerts detected across the perimeter."
        >
          <div className="center">
            <Link className="button primary" to="/admin/incidents">View incidents</Link>
            <Link className="button" to="/admin/evaluation">View evaluation results</Link>
          </div>
        </EmptyState>
      </div>
    </section>
  );
}
