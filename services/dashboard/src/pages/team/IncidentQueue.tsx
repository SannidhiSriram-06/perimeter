import { Incident } from '../../api/incidents';
import { parseIncidentDraft } from '../../api/team';
import { Status } from '../../components/ui';

interface IncidentQueueProps {
  readonly incidents: readonly Incident[];
  readonly selectedIncidentId: string | null;
  readonly onSelectIncident: (id: string) => void;
}

const DRAFT = {
  ok: { tone: 'ok', label: 'Checked' },
  flagged: { tone: 'warn', label: 'Flagged for review' },
  none: { tone: 'pending', label: 'No draft' },
} as const;

export default function IncidentQueue({
  incidents,
  selectedIncidentId,
  onSelectIncident,
}: Readonly<IncidentQueueProps>) {
  return (
    <section className="queue stack tight" aria-labelledby="team-incidents-heading">
      <h2 id="team-incidents-heading" className="eyebrow">
        Your incidents ({incidents.length})
      </h2>
      {incidents.length === 0 && (
        <div className="dashed">
          <strong>No incidents found</strong>
          <p>No incidents are recorded for your team&apos;s services.</p>
        </div>
      )}
      {incidents.map((inc) => {
        const state = DRAFT[parseIncidentDraft(inc).status];
        return (
          <button
            type="button"
            key={inc.id}
            className="queue-item"
            aria-pressed={inc.id === selectedIncidentId}
            onClick={() => onSelectIncident(inc.id)}
            data-testid={`incident-item-${inc.id}`}
          >
            <Status tone={state.tone} data-testid="draft-status-badge">{state.label}</Status>
            <span className="title">{inc.title}</span>
            <span className="sub">
              <span>{inc.service_name || inc.alert_service_id || 'Unknown'}</span>
              <span>{inc.status}</span>
              <span>{new Date(inc.created_at).toLocaleString()}</span>
            </span>
          </button>
        );
      })}
      <p className="note">only incidents on services your team owns appear here.</p>
    </section>
  );
}
