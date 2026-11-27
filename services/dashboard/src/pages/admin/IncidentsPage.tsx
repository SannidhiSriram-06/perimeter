import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchIncidents, type Incident } from '../../api/incidents';
import { Skyline } from '../../components/art';
import EmptyState from '../../components/EmptyState';
import { isFinal, reportState } from '../../components/reportState';
import { PageHead, Status, teamName, useTeams } from '../../components/ui';

const FILTERS = {
  All: () => true,
  Open: (incident: Incident) => !isFinal(incident),
  Flagged: (incident: Incident) => reportState(incident).tone === 'warn',
  Finalized: isFinal,
};
type Filter = keyof typeof FILTERS;

function Numerals({ incidents }: Readonly<{ incidents: Incident[] }>) {
  const tones = incidents.map((incident) => reportState(incident).tone);
  const counts = [
    [tones.filter((t) => t === 'warn').length, 'Needs your review', 'something to confirm'],
    [incidents.filter(FILTERS.Open).length, 'Open', 'not yet signed off'],
    [tones.filter((t) => t === 'pending').length, 'Without a draft', 'nothing to read yet'],
    [incidents.filter(isFinal).length, 'Signed off', 'closed by a human'],
  ] as const;
  return (
    <div className="numerals">
      {counts.map(([count, title, note]) => (
        <div key={title}>
          <strong>{count}</strong>
          <p>{title}</p>
          <p className="note">{note}</p>
        </div>
      ))}
    </div>
  );
}

function IncidentTable({ incidents }: Readonly<{ incidents: Incident[] }>) {
  const teams = useTeams();
  const [filter, setFilter] = useState<Filter>('All');
  const [team, setTeam] = useState('');
  const shown = incidents.filter((i) => FILTERS[filter](i) && (!team || i.owning_team_id === team));

  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Filter incidents">
          {(Object.keys(FILTERS) as Filter[]).map((name) => (
            <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>
          ))}
        </div>
        {teams.length > 0 && (
          <label>
            Team
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="card flush scroll">
        <table style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th scope="col">Incident</th>
              <th scope="col">Origin</th>
              <th scope="col">Team</th>
              <th scope="col">Affected</th>
              <th scope="col">Report</th>
              <th scope="col">Created</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((incident) => {
              const state = reportState(incident);
              return (
                <tr key={incident.id}>
                  <td>
                    <Link className="row-title" to={`/admin/incidents/${encodeURIComponent(incident.id)}`}>{incident.title}</Link>
                    <span className="sub mono">{incident.id}</span>
                  </td>
                  <td className="mono">{incident.service_name ?? incident.alert_service_id ?? '—'}</td>
                  <td className="muted">{teamName(teams, incident.owning_team_id)}</td>
                  <td className="muted">{incident.blast_radius.length} services</td>
                  <td><Status tone={state.tone}>{state.label}</Status></td>
                  <td className="muted">{new Date(incident.created_at).toLocaleString()}</td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="muted">Nothing matches this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="note">open a row to read the draft, check the claims and sign it off.</p>
    </>
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
      <PageHead kicker="what is on fire, and what is signed off" title="Incidents">
        <Skyline />
      </PageHead>
      {loading && <p role="status">Loading incidents…</p>}
      {error && <p className="error" role="alert">Could not load incidents.</p>}
      {!loading && !error && incidents.length === 0 && (
        <div className="plate">
          <EmptyState title="All quiet inside the perimeter." subtitle="No incidents have been recorded." />
        </div>
      )}
      {!loading && !error && incidents.length > 0 && (
        <>
          <Numerals incidents={incidents} />
          <IncidentTable incidents={incidents} />
        </>
      )}
    </section>
  );
}
