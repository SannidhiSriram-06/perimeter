import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchIncidents, parseIncidentDetails, type Incident } from '../../api/incidents';

const badgeColors = {
  ok: { background: '#dcfce7', color: '#166534', label: 'Draft OK' },
  flagged: { background: '#fee2e2', color: '#991b1b', label: 'Draft flagged' },
  none: { background: '#f3f4f6', color: '#4b5563', label: 'No draft' },
} as const;

function DraftBadge({ incident }: { incident: Incident }) {
  const badge = badgeColors[parseIncidentDetails(incident).status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: '999px',
        background: badge.background,
        color: badge.color,
        fontSize: '12px',
        fontWeight: 700,
      }}
    >
      {badge.label}
    </span>
  );
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchIncidents()
      .then(({ incidents: result }) => {
        if (!active) return;
        setIncidents(result);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <h1>Incidents</h1>
      {loading && <p role="status">Loading incidents…</p>}
      {error && <p className="error" role="alert">Could not load incidents.</p>}
      {!loading && !error && incidents.length === 0 && <p>No incidents have been recorded.</p>}
      {!loading && !error && incidents.length > 0 && (
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #dde0e4', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #dde0e4' }}>
                <th scope="col" style={{ padding: '12px 16px' }}>Incident</th>
                <th scope="col" style={{ padding: '12px 16px' }}>Service</th>
                <th scope="col" style={{ padding: '12px 16px' }}>Status</th>
                <th scope="col" style={{ padding: '12px 16px' }}>Draft</th>
                <th scope="col" style={{ padding: '12px 16px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <Link to={`/admin/incidents/${encodeURIComponent(incident.id)}`}>{incident.title}</Link>
                  </td>
                  <td style={{ padding: '12px 16px' }}>{incident.service_name ?? incident.alert_service_id ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{incident.status}</td>
                  <td style={{ padding: '12px 16px' }}><DraftBadge incident={incident} /></td>
                  <td style={{ padding: '12px 16px' }}>{new Date(incident.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
