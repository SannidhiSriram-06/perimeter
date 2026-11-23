import { Incident } from '../../api/incidents';
import { ParsedIncidentDraft, ValidatedClaim } from '../../api/team';

interface IncidentDetailPanelProps {
  readonly incident: Incident;
  readonly draft: ParsedIncidentDraft | null;
}

function getConfidenceStyle(confidence?: string): { background: string; color: string } {
  if (confidence === 'high') {
    return { background: '#dcfce7', color: '#166534' };
  }
  if (confidence === 'medium') {
    return { background: '#fef3c7', color: '#92400e' };
  }
  return { background: '#f3f4f6', color: '#374151' };
}

function BlastRadiusSection({ blastRadius }: { readonly blastRadius?: string[] }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
        Blast Radius ({blastRadius?.length || 0} services)
      </div>
      {blastRadius && blastRadius.length > 0 ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {blastRadius.map((svcName) => (
            <span
              key={svcName}
              style={{
                background: '#e0f2fe',
                color: '#0369a1',
                border: '1px solid #bae6fd',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {svcName}
            </span>
          ))}
        </div>
      ) : (
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>No blast radius recorded.</p>
      )}
    </div>
  );
}

function HypothesisSection({ hypothesis }: { readonly hypothesis?: ParsedIncidentDraft['hypothesis'] }) {
  if (!hypothesis) {
    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
          Root Cause Hypothesis
        </div>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>No hypothesis available for this incident.</p>
      </div>
    );
  }

  const confStyle = getConfidenceStyle(hypothesis.confidence);

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
        Root Cause Hypothesis
      </div>
      <div
        style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          padding: '16px',
        }}
      >
        <div style={{ marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>Root Cause Service: </span>
          <strong style={{ color: '#111827' }}>
            {hypothesis.root_cause_service || 'Not specified'}
          </strong>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>Cascade Path: </span>
          {hypothesis.cascade_path && hypothesis.cascade_path.length > 0 ? (
            <span style={{ fontWeight: 600, color: '#4f46e5' }}>
              {hypothesis.cascade_path.join(' ➔ ')}
            </span>
          ) : (
            <span style={{ color: '#6b7280' }}>None</span>
          )}
        </div>

        <div style={{ marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>Confidence: </span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              background: confStyle.background,
              color: confStyle.color,
            }}
          >
            {hypothesis.confidence || 'unknown'}
          </span>
        </div>

        <div>
          <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
            Summary:
          </span>
          <p style={{ margin: 0, color: '#1f2937', fontSize: '14px', lineHeight: 1.5 }}>
            {hypothesis.summary || 'No summary drafted.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function PostmortemSection({ postmortem }: { readonly postmortem?: ParsedIncidentDraft['postmortem'] }) {
  if (!postmortem) {
    return null;
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
        Postmortem Details
      </div>
      <div
        style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          padding: '16px',
        }}
      >
        {postmortem.summary && (
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Summary:</span>
            <p style={{ margin: 0, fontSize: '14px', color: '#1f2937' }}>{postmortem.summary}</p>
          </div>
        )}
        {postmortem.impact && (
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Impact:</span>
            <p style={{ margin: 0, fontSize: '14px', color: '#1f2937' }}>{postmortem.impact}</p>
          </div>
        )}
        {postmortem.contributing_factors && postmortem.contributing_factors.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>
              Contributing Factors:
            </span>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#1f2937' }}>
              {postmortem.contributing_factors.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {postmortem.next_steps && postmortem.next_steps.length > 0 && (
          <div>
            <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Next Steps:</span>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#1f2937' }}>
              {postmortem.next_steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimsSection({ claims }: { readonly claims: readonly ValidatedClaim[] }) {
  if (claims.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>No validator claims available.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {claims.map((claim) => (
        <div
          key={claim.id}
          data-testid={`claim-${claim.id}`}
          style={{
            background: claim.supported ? '#f8fafc' : '#fef2f2',
            border: claim.supported ? '1px solid #e2e8f0' : '1px solid #f87171',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>
                [{claim.id}]
              </span>
              <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>
                {claim.type}
              </span>
              {claim.evidence_ids && claim.evidence_ids.length > 0 && (
                <span style={{ fontSize: '11px', color: '#475569' }}>
                  (cites: {claim.evidence_ids.join(', ')})
                </span>
              )}
            </div>
            {/* Show rendered_text from validation result per audit N-04 */}
            <div style={{ fontSize: '14px', color: '#1e293b' }}>{claim.rendered_text}</div>
            {!claim.supported && claim.reasons.length > 0 && (
              <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', fontWeight: 500 }}>
                ⚠️ {claim.reasons.join(', ')}
              </div>
            )}
          </div>

          <div>
            {claim.supported ? (
              <span
                style={{
                  background: '#dcfce7',
                  color: '#166534',
                  border: '1px solid #bbf7d0',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                ✓ SUPPORTED
              </span>
            ) : (
              <span
                data-testid="unsupported-claim-badge"
                style={{
                  background: '#fee2e2',
                  color: '#991b1b',
                  border: '1px solid #fecaca',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                ✗ UNSUPPORTED
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function IncidentDetailPanel({ incident, draft }: Readonly<IncidentDetailPanelProps>) {
  return (
    <section
      aria-labelledby="incident-detail-heading"
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        marginBottom: '2rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 id="incident-detail-heading" style={{ fontSize: '20px', margin: 0, color: '#111827' }}>
          Incident Detail: {incident.title}
        </h2>
        <span
          style={{
            background: '#f3f4f6',
            color: '#4b5563',
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          🔒 Read-Only
        </span>
      </div>

      <BlastRadiusSection blastRadius={incident.blast_radius} />
      <HypothesisSection hypothesis={draft?.hypothesis} />
      <PostmortemSection postmortem={draft?.postmortem} />

      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
          Validator Claims ({draft?.claims.length || 0})
        </div>
        <ClaimsSection claims={draft?.claims || []} />
      </div>
    </section>
  );
}
