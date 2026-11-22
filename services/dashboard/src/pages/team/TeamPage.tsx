import { useEffect, useState } from 'react';
import { Incident } from '../../api/incidents';
import {
  fetchTeamServices,
  fetchTeamIncidents,
  parseIncidentDraft,
  ServiceItem,
} from '../../api/team';
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

  const selectedIncident = incidents.find((inc) => inc.id === selectedIncidentId);
  const parsedDraft = selectedIncident ? parseIncidentDraft(selectedIncident) : null;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '24px', margin: '0 0 6px 0', color: '#111827' }}>Team</h1>
        <p style={{ margin: 0, color: '#4b5563', fontSize: '14px' }}>
          Overview of your team's owned services, active incidents, and automated AI drafts.
        </p>
      </header>

      {/* Team-scoping notice banner */}
      <div
        role="region"
        aria-label="Scope notice"
        style={{
          background: '#e0e7ff',
          border: '1px solid #c7d2fe',
          color: '#3730a3',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontWeight: 'bold' }}>ℹ️ Scope:</span>
        <span>This dashboard shows only the services and incidents owned by your team.</span>
      </div>

      {loading && (
        <div role="status" style={{ padding: '24px 0', color: '#6b7280', fontSize: '15px' }}>
          Loading team dashboard...
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '14px 18px',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <div>
          <OwnedServicesList services={services} />
          <IncidentQueue
            incidents={incidents}
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={setSelectedIncidentId}
          />
          {selectedIncident && (
            <IncidentDetailPanel incident={selectedIncident} draft={parsedDraft} />
          )}
        </div>
      )}
    </div>
  );
}
