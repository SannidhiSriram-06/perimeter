import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchIncidents, parseIncidentDetails, type Incident, type ParsedIncidentDetails } from '../../api/incidents';
import { TowerRow } from '../../components/art';
import { isFinal, reportState } from '../../components/reportState';
import { PostmortemList, Status, teamName, useTeams } from '../../components/ui';

function BlastRadius({ services, details }: Readonly<{ services: string[]; details: ParsedIncidentDetails }>) {
  const path = details.hypothesis?.cascade_path ?? [];
  const root = details.hypothesis?.root_cause_service;
  // Services on the suggested cascade come first so the arrows read left to right.
  const ordered = [...new Set([...path.filter((s) => services.includes(s)), ...services])];
  return (
    <section className="card">
      <div className="card-head">
        <h2>{`Blast radius (${services.length} services)`}</h2>
        <p>Everything connected to the alert</p>
      </div>
      {ordered.length > 0 ? (
        <TowerRow
          towers={ordered.map((name) => ({ name, note: name === root ? 'suspected root cause' : undefined }))}
          path={path}
          flame={root}
          label={`Services in the blast radius: ${ordered.join(', ')}`}
        />
      ) : <p>No blast radius recorded.</p>}
    </section>
  );
}

function Hypothesis({ details }: Readonly<{ details: ParsedIncidentDetails }>) {
  const { hypothesis } = details;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Hypothesis</h2>
        <p>Drafted by Perimeter</p>
      </div>
      {hypothesis ? (
        <>
          {hypothesis.summary && <p className="lead" style={{ margin: '0 0 18px' }}>{hypothesis.summary}</p>}
          <p className="mono">Root cause service: {hypothesis.root_cause_service ?? 'Not specified'}</p>
          <p className="mono">Cascade path: {hypothesis.cascade_path?.join(' → ') || 'Not specified'}</p>
          <p className="mono">Confidence: {hypothesis.confidence ?? 'Not specified'}</p>
        </>
      ) : <p>No hypothesis is available.</p>}
    </section>
  );
}

function Findings({ details }: Readonly<{ details: ParsedIncidentDetails }>) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Findings and evidence</h2>
        <p>Each claim is checked against the evidence</p>
      </div>
      {details.claims.length > 0 ? (
        <div className="scroll">
          <table style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th scope="col">Finding</th>
                <th scope="col">Checked against</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {details.claims.map((claim) => (
                <tr key={claim.id} className={claim.supported ? undefined : 'flagged'}>
                  <td>
                    <span>{claim.rendered_text}</span>
                    <span className="sub mono">{claim.type} ({claim.id})</span>
                    {!claim.supported && (
                      <span className="reason">Unsupported: {claim.reasons.join('; ') || 'No reason provided.'}</span>
                    )}
                  </td>
                  <td className="mono">Evidence: {claim.evidence_ids.length > 0 ? claim.evidence_ids.join(', ') : 'None cited'}</td>
                  <td>
                    <Status tone={claim.supported ? 'ok' : 'warn'}>{claim.supported ? 'Confirmed' : 'Not confirmed'}</Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>No validated claims are available.</p>}
      {details.issues.length > 0 && (
        <>
          <h3 style={{ marginTop: 22 }}>Validator warnings</h3>
          <ul className="flags">
            {details.issues.map((issue, index) => <li key={`${issue.rule}-${index}`}>{issue.message}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

function Postmortem({ details }: Readonly<{ details: ParsedIncidentDetails }>) {
  const { postmortem } = details;
  return (
    <section className="card">
      <div className="card-head"><h2>Postmortem draft</h2></div>
      {postmortem ? (
        <div className="stack tight">
          {postmortem.summary && <p>{postmortem.summary}</p>}
          {postmortem.impact && <p>Impact: {postmortem.impact}</p>}
          <PostmortemList title="Contributing factors" items={postmortem.contributing_factors} />
          <PostmortemList title="Next steps" items={postmortem.next_steps} />
        </div>
      ) : <p>No postmortem is available.</p>}
    </section>
  );
}

function Rail({ incident }: Readonly<{ incident: Incident }>) {
  const teams = useTeams();
  const when = (value: string) => new Date(value).toLocaleString();
  return (
    <aside className="side stack">
      <section className="card">
        <h2 className="eyebrow">Details</h2>
        <dl>
          <div><dt>Owning team</dt><dd>{teamName(teams, incident.owning_team_id)}</dd></div>
          <div><dt>Affected services</dt><dd>{incident.blast_radius.length}</dd></div>
          <div><dt>Reviewer</dt><dd>{incident.reviewed_by ?? 'Not yet reviewed'}</dd></div>
        </dl>
      </section>
      <section className="card">
        <h2 className="eyebrow">Trail</h2>
        <dl>
          <div><dt>Incident created</dt><dd>{when(incident.created_at)}</dd></div>
          {incident.reviewed_at && <div><dt>Last edited</dt><dd>{when(incident.reviewed_at)}</dd></div>}
          {incident.finalized_at && <div><dt>Finalized</dt><dd>{when(incident.finalized_at)}</dd></div>}
        </dl>
      </section>
    </aside>
  );
}

function IncidentContent({ incident }: Readonly<{ incident: Incident }>) {
  const details = parseIncidentDetails(incident);
  const state = reportState(incident);
  const unconfirmed = details.claims.filter((claim) => !claim.supported).length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{incident.title}</h1>
          <p className="meta">
            <Status tone={state.tone}>{state.label}</Status>
            <span>Created {new Date(incident.created_at).toLocaleString()}</span>
            <span>Origin: {incident.service_name ?? incident.alert_service_id ?? 'unknown'}</span>
          </p>
        </div>
        <div aria-label="Incident actions" data-testid="incident-actions-slot">
          <Link className="button primary" to={`/admin/incidents/${encodeURIComponent(incident.id)}/review`}>
            {isFinal(incident) ? 'Open review' : 'Edit and finalize'}
          </Link>
        </div>
      </header>

      {details.status === 'flagged' && (
        <div role="alert" className="banner">
          <strong>This draft is flagged.</strong>
          {unconfirmed > 0 && `${unconfirmed} of ${details.claims.length} findings could not be confirmed. `}
          Review its unsupported claims and validator warnings before relying on it.
        </div>
      )}

      <div className="columns">
        <div className="main stack">
          <BlastRadius services={incident.blast_radius} details={details} />
          {details.status === 'none' ? (
            <p className="dashed">No draft is available for this incident.</p>
          ) : (
            <>
              <Hypothesis details={details} />
              <Findings details={details} />
              <Postmortem details={details} />
            </>
          )}
        </div>
        <Rail incident={incident} />
      </div>
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
      <p className="crumb"><Link to="/admin/incidents">← Back to incidents</Link></p>
      {state === 'loading' && <p role="status">Loading incident…</p>}
      {state === 'error' && <p className="error" role="alert">Could not load the incident.</p>}
      {state === 'missing' && <p>Incident not found.</p>}
      {state === 'ready' && incident && <IncidentContent incident={incident} />}
    </section>
  );
}
