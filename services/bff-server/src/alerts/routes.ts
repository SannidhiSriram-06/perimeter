import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { wrap } from '../http';

const MAX_ALERTS_PER_REQUEST = 100;
const ENGINE_TIMEOUT_MS = 5000;

interface Alert {
  status?: unknown;
  labels?: { alertname?: unknown; service?: unknown };
}

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value ? value.slice(0, 100) : fallback;

/** Asks the correlation engine for the blast radius. Returns null when the engine cannot answer. */
async function blastRadius(engineUrl: string, service: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${engineUrl}/correlate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service }),
      signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`engine answered ${res.status}`);
    return ((await res.json()) as { impacted_services: string[] }).impacted_services;
  } catch (err) {
    console.error('Correlation failed:', (err as Error).message);
    return null;
  }
}

/**
 * POST /api/v1/alerts/webhook: Alertmanager sends alerts here.
 * Each firing alert becomes an incident row holding its blast radius. If the engine is down the incident is still
 * stored (status correlation_failed) so the alert is never lost.
 */
export function alertsRouter(pool: Pool, engineUrl: string): Router {
  const router = Router();

  router.post('/webhook', wrap(async (req: Request, res: Response) => {
    const alerts: unknown = req.body?.alerts;
    if (!Array.isArray(alerts) || alerts.length > MAX_ALERTS_PER_REQUEST) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Payload must contain an 'alerts' array of at most ${MAX_ALERTS_PER_REQUEST}`,
      });
    }

    const firing = (alerts as Alert[]).filter((a) => a && a.status !== 'resolved');
    const ids = await Promise.all(firing.map(async (alert) => {
      const service = text(alert.labels?.service, 'unknown');
      const alertname = text(alert.labels?.alertname, 'alert');
      const radius = await blastRadius(engineUrl, service);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO incidents (title, status, alert_service_id, blast_radius)
         VALUES ($1, $2, (SELECT id FROM services WHERE id = $3), $4::jsonb)
         RETURNING id`,
        [`${alertname} on ${service}`, radius ? 'open' : 'correlation_failed', service, JSON.stringify(radius ?? [])]
      );
      return rows[0].id;
    }));

    console.log('[Alert Ingestion] received %d alert(s), created %d incident(s)', alerts.length, ids.length);
    return res.status(202).json({ status: 'accepted', alert_count: alerts.length, incident_ids: ids });
  }));

  return router;
}
