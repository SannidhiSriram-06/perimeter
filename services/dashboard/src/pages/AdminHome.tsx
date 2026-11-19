import { Link } from 'react-router-dom';

// Placeholder. Admin views (incident list, leave marking, directory) plug in here.
export default function AdminHome() {
  return (
    <section>
      <h2>Admin</h2>
      <p>Placeholder for the Admin area.</p>
      <nav style={{ marginTop: '1.5rem', display: 'flex', gap: '12px' }}>
        <Link
          to="/admin/directory"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            background: '#059669',
            color: '#ffffff',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: 500,
            fontSize: '14px',
          }}
        >
          Team Directory & Leave
        </Link>
        <Link
          to="/admin/evaluation"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            background: '#2563eb',
            color: '#ffffff',
            textDecoration: 'none',
            borderRadius: '6px',
            fontWeight: 500,
            fontSize: '14px',
          }}
        >
          View Evaluation Results & Benchmark
        </Link>
      </nav>
    </section>
  );
}
