import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { issueToken } from './token';
import { unauthorized, wrap } from '../http';

const ID_PATTERN = /^(\d{5}|\d{6})$/;

/**
 * POST /api/v1/auth/login  { "id": "10001" }
 * Unknown IDs and malformed IDs get the same response as wrong credentials, so IDs cannot be enumerated.
 */
export function authRouter(pool: Pool, secret: string): Router {
  const router = Router();

  router.post('/login', wrap(async (req: Request, res: Response) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    if (!ID_PATTERN.test(id)) return unauthorized(res);

    const { rows } = await pool.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [id]);
    if (rows.length === 0) return unauthorized(res);

    return res.json({ token: issueToken(id, secret), role: rows[0].role });
  }));

  return router;
}
