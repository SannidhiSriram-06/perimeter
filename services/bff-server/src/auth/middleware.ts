import { NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';
import { verifyToken } from './token';
import { unauthorized, wrap } from '../http';

export interface CurrentUser {
  id: string;
  role: 'admin' | 'team_member';
  teamId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: CurrentUser;
    }
  }
}

/**
 * Authenticates the bearer token, then loads the user's role and team from the database.
 * The role is never trusted from the token alone, so a changed or deleted user loses access immediately.
 */
export function requireAuth(pool: Pool, secret: string) {
  return wrap(async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = token ? verifyToken(token, secret) : null;
    if (!claims) return unauthorized(res);

    const { rows } = await pool.query<{ id: string; role: CurrentUser['role']; team_id: string | null }>(
      'SELECT id, role, team_id FROM users WHERE id = $1',
      [claims.sub]
    );
    if (rows.length === 0) return unauthorized(res);

    req.user = { id: rows[0].id, role: rows[0].role, teamId: rows[0].team_id };
    return next();
  });
}

/** Must run after requireAuth. Blocks anyone who is not an admin. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'admin role required' });
  }
  return next();
}
