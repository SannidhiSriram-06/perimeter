import { type ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchIncidents, parseIncidentDetails, type Incident } from '../../api/incidents';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: '24px' }}>
      <h2 style={{ fontSize: '18px' }}>{title}</h2>
      {children}
    </section>
  );
}

function IncidentContent({ incident }: { incident: Incident }) {
  const details = parseIncidentDetails(incident);

  return (
    <>
      <h1>{incident.title}</h1>
      {details.status === 'flagged' && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: '8px' }}>
          This draft is flagged. Review its unsupported claims and validator warnings before relying on it.
        </div>
      )}

      <Section title={`Blast radius (${incident.blast_radius.length} services)`}>
        {incident.blast_radius.length > 0 ? (
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', listStyle: 'none', padding: 0 }}>
            {incident.blast_radius.map((service) => (
              <li key={service} style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '999px', padding: '4px 10px' }}>
                {service}
              </li>
            ))}
          </ul>
        ) : <p>No blast radius recorded.</p>}
      </Section>

      {details.status === 'none' ? (
        <p>No draft is available for this incident.</p>
      ) : (
        <>
          <Section title="Hypothesis">
            {details.hypothesis ? (
              <div>
                {details.hypothesis.summary && <p>{details.hypothesis.summary}</p>}
                <p>Root cause service: {details.hypothesis.root_cause_service ?? 'Not specified'}</p>
                <p>Cascade path: {details.hypothesis.cascade_path?.join(' → ') || 'Not specified'}</p>
                <p>Confidence: {details.hypothesis.confidence ?? 'Not specified'}</p>
              </div>
            ) : <p>No hypothesis is available.</p>}
          </Section>

          <Section title="Claims">
            {details.claims.length > 0 ? (
              <ul>
                {details.claims.map((claim) => (
                  <li key={claim.id} style={{ marginBottom: '12px' }}>
                    <strong>{claim.type} ({claim.id})</strong>
                    <p>{claim.rendered_text}</p>
                    <p>Evidence: {claim.evidence_ids.length > 0 ? claim.evidence_ids.join(', ') : 'None cited'}</p>
                    {!claim.supported && (
                      <p style={{ color: '#991b1b' }}>Unsupported: {claim.reasons.join('; ') || 'No reason provided.'}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p>No validated claims are available.</p>}
          </Section>

          {details.issues.length > 0 && (
            <Section title="Validator warnings">
              <ul>
                {details.issues.map((issue, index) => <li key={`${issue.rule}-${index}`}>{issue.message}</li>)}
              </ul>
            </Section>
          )}

          <Section title="Postmortem">
            {details.postmortem ? (
              <div>
                {details.postmortem.summary && <p>{details.postmortem.summary}</p>}
                {details.postmortem.impact && <p>Impact: {details.postmortem.impact}</p>}
                {details.postmortem.contributing_factors && details.postmortem.contributing_factors.length > 0 && (
                  <>
                    <h3>Contributing factors</h3>
                    <ul>{details.postmortem.contributing_factors.map((factor) => <li key={factor}>{factor}</li>)}</ul>
                  </>
                )}
                {details.postmortem.next_steps && details.postmortem.next_steps.length > 0 && (
                  <>
                    <h3>Next steps</h3>
                    <ul>{details.postmortem.next_steps.map((step) => <li key={step}>{step}</li>)}</ul>
                  </>
                )}
              </div>
            ) : <p>No postmortem is available.</p>}
          </Section>
        </>
      )}

      <div aria-label="Incident actions" data-testid="incident-actions-slot" />
    </>
  );
}

export default function IncidentDetail() {
  const { id } = useParams();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    fetchIncidents()
      .then(({ incidents }) => {
        if (!active) return;
        const found = incidents.find((item) => item.id === id) ?? null;
        setIncident(found);
        setState(found ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!active) return;
        setState('error');
      });

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <section>
      <p><Link to="/admin/incidents">← Back to incidents</Link></p>
      {state === 'loading' && <p role="status">Loading incident…</p>}
      {state === 'error' && <p className="error" role="alert">Could not load the incident.</p>}
      {state === 'missing' && <p>Incident not found.</p>}
      {state === 'ready' && incident && <IncidentContent incident={incident} />}
    </section>
  );
}
