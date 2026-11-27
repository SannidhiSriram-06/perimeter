import { useEffect, useState } from 'react';
import { Incident } from '../../api/incidents';
import {
  fetchTeamServices,
  fetchTeamIncidents,
  parseIncidentDraft,
  ServiceItem,
} from '../../api/team';
import { PageHead, useTeams } from '../../components/ui';
import OwnedServicesList from './OwnedServicesList';
import IncidentQueue from './IncidentQueue';
import IncidentDetailPanel from './IncidentDetailPanel';

export default function TeamPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([fetchTeamServices(), fetchTeamIncidents()])
      .then(([servicesRes, incidentsRes]) => {
        if (!active) return;
        setServices(servicesRes.services || []);
        const incidentList = incidentsRes.incidents || [];
        setIncidents(incidentList);
        if (incidentList.length > 0) {
          setSelectedIncidentId(incidentList[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load team dashboard');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const teams = useTeams();
  const selectedIncident = incidents.find((inc) => inc.id === selectedIncidentId);
  const parsedDraft = selectedIncident ? parseIncidentDraft(selectedIncident) : null;

  return (
    <div>
      <PageHead
        kicker="what is yours right now"
        title={teams[0]?.name ?? 'Team'}
        lead="Your team's owned services, incidents and automated drafts."
      />

      {/* Team-scoping notice */}
      <section aria-label="Scope notice">
        <p className="muted" style={{ marginTop: 12 }}>This dashboard shows only the services and incidents owned by your team.</p>
      </section>

      {loading && <output style={{ display: 'block' }}>Loading team dashboard...</output>}

      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="columns">
          <IncidentQueue
            incidents={incidents}
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={setSelectedIncidentId}
          />
          {selectedIncident && (
            <IncidentDetailPanel incident={selectedIncident} draft={parsedDraft} />
          )}
          <aside className="side stack">
            <OwnedServicesList services={services} />
          </aside>
        </div>
      )}
    </div>
  );
}
