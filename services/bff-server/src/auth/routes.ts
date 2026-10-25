import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { issueToken } from './token';
import { wrap } from '../http';

const ID_PATTERN = /^(\d{5}|\d{6})$/;

/**
 * POST /api/v1/auth/login  { "id": "10001" }
 * Unknown IDs and malformed IDs get the same response as wrong credentials, so IDs cannot be enumerated.
 */
export function authRouter(pool: Pool, secret: string): Router {
  const router = Router();

  router.post('/login', wrap(async (req: Request, res: Response) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    const invalid = () => res.status(401).json({ error: 'Unauthorized', message: 'invalid credentials' });

    if (!ID_PATTERN.test(id)) return invalid();

    const { rows } = await pool.query<{ id: string; role: 'admin' | 'team_member' }>(
      'SELECT id, role FROM users WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return invalid();

    return res.status(200).json({ token: issueToken(rows[0].id, rows[0].role, secret), role: rows[0].role });
  }));

  return router;
}
