import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { issueToken } from './token';
import { unauthorized, wrap } from '../http';
import { dummyHash, verifyPassword } from './password';

const ID_PATTERN = /^(\d{5}|\d{6})$/;
const MAX_PASSWORD_LENGTH = 200;

/**
 * POST /api/v1/auth/login  { "id": "10001", "password": "..." }
 * Unknown IDs, malformed IDs and wrong passwords all get the same response, so IDs cannot be enumerated.
 */
export function authRouter(pool: Pool, secret: string): Router {
  const router = Router();

  router.post('/login', wrap(async (req: Request, res: Response) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!ID_PATTERN.test(id) || !password || password.length > MAX_PASSWORD_LENGTH) return unauthorized(res);

    const { rows } = await pool.query<{ role: string; password_hash: string | null }>(
      'SELECT role, password_hash FROM users WHERE id = $1',
      [id]
    );
    // Always run one hash check, so unknown IDs and wrong passwords take the same time.
    const valid = await verifyPassword(password, rows[0]?.password_hash ?? (await dummyHash));
    if (!valid || rows.length === 0) return unauthorized(res);

    return res.json({ token: issueToken(id, secret), role: rows[0].role });
  }));

  return router;
}
