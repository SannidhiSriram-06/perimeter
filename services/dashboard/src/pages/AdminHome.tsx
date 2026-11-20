import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';

export default function AdminHome() {
  return (
    <section style={{ maxWidth: '960px', margin: '0 auto' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '24px', color: '#111827' }}>Admin</h1>
        <p style={{ color: '#4b5563', margin: 0, fontSize: '14px' }}>
          Perimeter system status, incident triage, and administrative controls.
        </p>
      </header>

      {/* Admin Navigation Links */}
      <nav
        aria-label="Admin Navigation"
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '2rem',
        }}
      >
        <Link
          to="/admin/incidents"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 16px',
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            color: '#111827',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          📋 Incidents
        </Link>
        <Link
          to="/admin/directory"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 16px',
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            color: '#111827',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          👥 Team Directory &amp; Leave
        </Link>
        <Link
          to="/admin/evaluation"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 16px',
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            color: '#111827',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          📊 Evaluation &amp; Benchmark
        </Link>
      </nav>

      {/* Nominal / Zero-Incident Empty State Illustration */}
      <EmptyState
        title="No Active Incidents"
        subtitle="Zero active incidents or firing alerts detected across the perimeter."
      >
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/admin/incidents"
            style={{
              padding: '10px 18px',
              background: '#0284c7',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '13px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            View incidents
          </Link>
          <Link
            to="/admin/evaluation"
            style={{
              padding: '10px 18px',
              background: '#334155',
              border: '1px solid #475569',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '13px',
            }}
          >
            View evaluation results
          </Link>
        </div>
      </EmptyState>
    </section>
  );
}
