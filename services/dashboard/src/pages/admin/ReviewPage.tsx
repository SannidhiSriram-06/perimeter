import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchIncidents, type Incident } from '../../api/incidents';
import EditDraftPanel from './EditDraftPanel';

/**
 * /admin/incidents/:id/review. Mounted on its own until the admin incident detail page exists; there is no
 * single-incident endpoint yet, so it loads the list and picks the incident by id.
 */
export default function ReviewPage() {
  const { id } = useParams();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    fetchIncidents()
      .then(({ incidents }) => {
        if (!active) return;
        const found = incidents.find((i) => i.id === id) ?? null;
        setIncident(found);
        setState(found ? 'ready' : 'missing');
      })
      .catch(() => active && setState('error'));
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
      {state === 'ready' && incident && (
        <>
          <h1>{incident.title}</h1>
          <p className="note">your edits live beside the original draft. the original is never overwritten.</p>
          <EditDraftPanel incident={incident} onSaved={setIncident} />
        </>
      )}
    </section>
  );
}
