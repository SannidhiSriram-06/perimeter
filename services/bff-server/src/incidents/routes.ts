import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { wrap } from '../http';

export function incidentsRouter(pool: Pool): Router {
  const router = Router();

  // Team members only see incidents whose alert_service_id is owned by their
  // team (via services.owning_team_id). Admins see every incident regardless
  // of owning team. Incidents with a NULL alert_service_id (unknown service)
  // are visible to admins only; they fall outside the JOIN for team members.
  router.get(
    '/incidents',
    wrap(async (req: Request, res: Response) => {
      const user = req.user!;

      const result =
        user.role === 'admin'
          ? await pool.query(
              `SELECT
                i.id,
                i.title,
                i.status,
                i.alert_service_id,
                i.blast_radius,
                i.root_cause_draft,
                i.created_at,
                s.name AS service_name,
                s.owning_team_id
              FROM incidents i
              LEFT JOIN services s ON s.id = i.alert_service_id
              ORDER BY i.created_at DESC
              LIMIT 100`
            )
          : await pool.query(
              `SELECT
                i.id,
                i.title,
                i.status,
                i.alert_service_id,
                i.blast_radius,
                i.root_cause_draft,
                i.created_at,
                s.name AS service_name,
                s.owning_team_id
              FROM incidents i
              JOIN services s ON s.id = i.alert_service_id
              WHERE s.owning_team_id = $1
              ORDER BY i.created_at DESC
              LIMIT 100`,
              [user.teamId]
            );

      return res.json({ incidents: result.rows });
    })
  );

  return router;
}
