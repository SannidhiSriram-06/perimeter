import { useEffect, useState } from 'react';
import { fetchIncidents, parseIncidentDetails, type Incident } from '../api/incidents';
import { fetchTeamServices, type ServiceItem } from '../api/team';
import { TowerRow } from '../components/art';
import { isFinal } from '../components/reportState';
import { PageHead, Status, teamName, useTeams, type Tone } from '../components/ui';

const TIER_SIZE: Record<string, number> = { critical: 1, high: 0.85, medium: 0.72, low: 0.6 };

/** What the open (not yet finalized) incidents say about one service. */
function serviceState(id: string, open: Incident[]): { tone: Tone; label: string } {
  if (open.some((i) => parseIncidentDetails(i).hypothesis?.root_cause_service === id)) {
    return { tone: 'hot', label: 'Suspected root cause' };
  }
  if (open.some((i) => i.alert_service_id === id)) return { tone: 'warn', label: 'Alerted' };
  if (open.some((i) => i.blast_radius.includes(id))) return { tone: 'warn', label: 'In a blast radius' };
  return { tone: 'ok', label: 'No open incident' };
}

/** Admins get every service, team members only their own; the BFF does the scoping. */
export default function ServicesPage() {
  const teams = useTeams();
  const [data, setData] = useState<{ services: ServiceItem[]; open: Incident[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchTeamServices(), fetchIncidents()])
      .then(([{ services }, { incidents }]) => {
        if (active) setData({ services, open: incidents.filter((i) => !isFinal(i)) });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <PageHead kicker="your system, drawn by tier" title="Services" lead="Taller towers are higher tier." />
      {!data && !error && <output className="line">Loading services…</output>}
      {error && <p className="error" role="alert">Could not load services.</p>}
      {data?.services.length === 0 && <p className="dashed">No services to show.</p>}
      {data && data.services.length > 0 && (
        <>
          <div className="plate">
            <TowerRow
              towers={data.services.map((s) => ({ name: s.id, size: TIER_SIZE[s.tier] }))}
              flame={data.services.find((s) => serviceState(s.id, data.open).tone === 'hot')?.id}
              label={`Services drawn as towers: ${data.services.map((s) => s.id).join(', ')}`}
            />
            <p className="plate-caption"><span>Plate 03 · Site elevation</span><span>Height shows tier</span></p>
          </div>
          <div className="card flush scroll" style={{ marginTop: 32 }}>
            <table style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Right now</th>
                </tr>
              </thead>
              <tbody>
                {data.services.map((service) => {
                  const state = serviceState(service.id, data.open);
                  return (
                    <tr key={service.id}>
                      <td className="mono">{service.id}</td>
                      <td className="muted">{teamName(teams, service.owning_team_id)}</td>
                      <td className="muted" style={{ textTransform: 'capitalize' }}>{service.tier}</td>
                      <td><Status tone={state.tone}>{state.label}</Status></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
