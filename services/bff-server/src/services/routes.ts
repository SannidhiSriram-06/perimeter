import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { wrap } from '../http';

export interface ServiceRecord {
  id: string;
  name: string;
  owning_team_id: string;
  tier: string;
}

export function servicesRouter(pool: Pool): Router {
  const router = Router();

  // GET /api/v1/services:
  // Admin sees all services.
  // Team members see only services owned by their team.
  router.get(
    '/services',
    wrap(async (req: Request, res: Response) => {
      const user = req.user!;

      const result =
        user.role === 'admin'
          ? await pool.query<ServiceRecord>(
              `SELECT id, name, owning_team_id, tier
               FROM services
               ORDER BY id`
            )
          : await pool.query<ServiceRecord>(
              `SELECT id, name, owning_team_id, tier
               FROM services
               WHERE owning_team_id = $1
               ORDER BY id`,
              [user.teamId]
            );

      return res.json({ services: result.rows });
    })
  );

  return router;
}
