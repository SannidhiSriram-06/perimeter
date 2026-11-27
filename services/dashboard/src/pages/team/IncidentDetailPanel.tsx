import { Incident } from '../../api/incidents';
import { ParsedIncidentDraft, ValidatedClaim } from '../../api/team';
import { PostmortemList, Status } from '../../components/ui';

interface IncidentDetailPanelProps {
  readonly incident: Incident;
  readonly draft: ParsedIncidentDraft | null;
}

function Chain({ services, root, label }: { readonly services: readonly string[]; readonly root?: string; readonly label: string }) {
  return (
    <ol className="chips" aria-label={label}>
      {services.map((name, i) => (
        <li key={name}>
          {i > 0 && <span className="arrow" aria-hidden="true">→</span>}
          <span className={name === root ? 'chip root' : 'chip'}>{name}</span>
        </li>
      ))}
    </ol>
  );
}

function HypothesisSection({ hypothesis }: { readonly hypothesis?: ParsedIncidentDraft['hypothesis'] }) {
  if (!hypothesis) {
    return (
      <div>
        <h3 className="eyebrow">What the draft says broke</h3>
        <p className="muted">No hypothesis available for this incident.</p>
      </div>
    );
  }

  return (
    <div className="stack tight">
      <div>
        <h3 className="eyebrow">What the draft says broke</h3>
        <p className="lead" style={{ margin: 0 }}>{hypothesis.summary || 'No summary drafted.'}</p>
      </div>
      <div className="meta" style={{ margin: 0 }}>
        <span>Root cause service: <strong>{hypothesis.root_cause_service || 'Not specified'}</strong></span>
        <span>Confidence: <strong>{hypothesis.confidence || 'unknown'}</strong></span>
      </div>
      <div>
        <h3 className="eyebrow">Cascade</h3>
        {hypothesis.cascade_path && hypothesis.cascade_path.length > 0 ? (
          <Chain services={hypothesis.cascade_path} root={hypothesis.root_cause_service} label="Cascade path" />
        ) : (
          <p className="muted">None</p>
        )}
      </div>
    </div>
  );
}

function PostmortemSection({ postmortem }: { readonly postmortem?: ParsedIncidentDraft['postmortem'] }) {
  if (!postmortem) {
    return null;
  }

  return (
    <div>
      <h3 className="eyebrow">Postmortem draft</h3>
      {postmortem.summary && <p>{postmortem.summary}</p>}
      {postmortem.impact && <p>Impact: {postmortem.impact}</p>}
      <PostmortemList title="Contributing factors" items={postmortem.contributing_factors} />
      <PostmortemList title="Next steps" items={postmortem.next_steps} />
    </div>
  );
}

function ClaimsSection({ claims }: { readonly claims: readonly ValidatedClaim[] }) {
  if (claims.length === 0) {
    return <p className="muted">No validator claims available.</p>;
  }

  return (
    <ul className="rows">
      {claims.map((claim) => (
        <li key={claim.id} data-testid={`claim-${claim.id}`} className="split">
          <div>
            {/* Show rendered_text from validation result per audit N-04 */}
            <span>{claim.rendered_text}</span>
            <span className="mono muted" style={{ display: 'block' }}>
              {claim.id} · {claim.type}
              {claim.evidence_ids && claim.evidence_ids.length > 0 && ` · cites ${claim.evidence_ids.join(', ')}`}
            </span>
            {!claim.supported && claim.reasons.length > 0 && (
              <span className="reason">{claim.reasons.join(', ')}</span>
            )}
          </div>
          {claim.supported ? (
            <Status tone="ok">Confirmed</Status>
          ) : (
            <Status tone="warn" data-testid="unsupported-claim-badge">Not confirmed</Status>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function IncidentDetailPanel({ incident, draft }: Readonly<IncidentDetailPanelProps>) {
  const radius = incident.blast_radius ?? [];
  return (
    <section aria-labelledby="incident-detail-heading" className="card main stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2 id="incident-detail-heading">{incident.title}</h2>
        <p>Read-only</p>
      </div>

      <HypothesisSection hypothesis={draft?.hypothesis} />

      <div>
        <h3 className="eyebrow">Blast Radius ({radius.length} services)</h3>
        {radius.length > 0 ? (
          <ul className="chips">
            {radius.map((name) => <li key={name}><span className="chip">{name}</span></li>)}
          </ul>
        ) : (
          <p className="muted">No blast radius recorded.</p>
        )}
      </div>

      <div>
        <h3 className="eyebrow">Findings ({draft?.claims.length || 0})</h3>
        <ClaimsSection claims={draft?.claims || []} />
      </div>

      <PostmortemSection postmortem={draft?.postmortem} />

      <p className="dashed">You can read everything, but only an admin can edit the hypothesis or finalize the report.</p>
    </section>
  );
}
