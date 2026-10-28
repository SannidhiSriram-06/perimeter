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

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 1_000;

/**
 * Authenticates the bearer token, then loads the user's role and team from the database.
 * The role is never trusted from the token alone. Lookups are cached for 30 seconds per process, so a changed or
 * deleted user loses access within 30 seconds instead of costing a query on every request.
 */
export function requireAuth(pool: Pool, secret: string, now: () => number = Date.now) {
  const cache = new Map<string, { user: CurrentUser; expires: number }>();

  return wrap(async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = token ? verifyToken(token, secret) : null;
    if (!claims) return unauthorized(res);

    const cached = cache.get(claims.sub);
    if (cached && cached.expires > now()) {
      req.user = cached.user;
      return next();
    }

    const { rows } = await pool.query<{ id: string; role: CurrentUser['role']; team_id: string | null }>(
      'SELECT id, role, team_id FROM users WHERE id = $1',
      [claims.sub]
    );
    if (rows.length === 0) return unauthorized(res);

    req.user = { id: rows[0].id, role: rows[0].role, teamId: rows[0].team_id };
    if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    cache.set(claims.sub, { user: req.user, expires: now() + CACHE_TTL_MS });
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
