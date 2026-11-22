import { Incident } from '../../api/incidents';
import { parseIncidentDraft } from '../../api/team';

interface IncidentQueueProps {
  incidents: Incident[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
}

export default function IncidentQueue({
  incidents,
  selectedIncidentId,
  onSelectIncident,
}: IncidentQueueProps) {
  if (incidents.length === 0) {
    return (
      <section style={{ marginBottom: '2rem' }} aria-labelledby="team-incidents-heading">
        <h2 id="team-incidents-heading" style={{ fontSize: '18px', color: '#1f2937', marginBottom: '12px' }}>
          Team Incidents (0)
        </h2>
        <div
          style={{
            background: '#ffffff',
            border: '1px dashed #d1d5db',
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
            color: '#6b7280',
          }}
        >
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>🛡️</div>
          <div style={{ fontWeight: 600, color: '#374151' }}>No incidents found</div>
          <div style={{ fontSize: '13px' }}>Your team services are running nominally with no firing alerts.</div>
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: '2rem' }} aria-labelledby="team-incidents-heading">
      <h2 id="team-incidents-heading" style={{ fontSize: '18px', color: '#1f2937', marginBottom: '12px' }}>
        Team Incidents ({incidents.length})
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
        {incidents.map((inc) => {
          const draft = parseIncidentDraft(inc);
          const isSelected = inc.id === selectedIncidentId;
          return (
            <div
              key={inc.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectIncident(inc.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectIncident(inc.id);
              }}
              data-testid={`incident-item-${inc.id}`}
              style={{
                background: isSelected ? '#f8fafc' : '#ffffff',
                border: isSelected ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '14px 18px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px', color: '#111827', marginBottom: '4px' }}>
                  {inc.title}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <span>Service: <strong>{inc.service_name || inc.alert_service_id || 'Unknown'}</strong></span>
                  <span>Status: <strong>{inc.status}</strong></span>
                  <span>Created: {new Date(inc.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div>
                {draft.status === 'ok' && (
                  <span
                    data-testid="draft-status-badge"
                    style={{
                      background: '#dcfce7',
                      color: '#166534',
                      border: '1px solid #bbf7d0',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    ✓ DRAFT OK
                  </span>
                )}
                {draft.status === 'flagged' && (
                  <span
                    data-testid="draft-status-badge"
                    style={{
                      background: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    ⚠️ DRAFT FLAGGED
                  </span>
                )}
                {draft.status === 'none' && (
                  <span
                    data-testid="draft-status-badge"
                    style={{
                      background: '#f3f4f6',
                      color: '#4b5563',
                      border: '1px solid #e5e7eb',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    DRAFT NONE
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
