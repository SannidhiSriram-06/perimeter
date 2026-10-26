import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { requireAdmin } from '../auth/middleware';
import { wrap } from '../http';

const SENIORITY = ['junior', 'mid', 'senior', 'lead'] as const;
const SKILL_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_SKILLS = 20;

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ error: 'Bad Request', message });

/** Validates an optional PATCH body. Returns an error message, or null when the body is acceptable. */
export function validateStatusPatch(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const b = body as Record<string, unknown>;

  for (const key of ['is_on_leave', 'on_call_status']) {
    if (key in b && typeof b[key] !== 'boolean') return `${key} must be a boolean`;
  }
  if ('seniority' in b && !SENIORITY.includes(b.seniority as (typeof SENIORITY)[number])) {
    return `seniority must be one of ${SENIORITY.join(', ')}`;
  }
  if ('skills' in b) {
    const skills = b.skills;
    if (!Array.isArray(skills) || skills.length > MAX_SKILLS) {
      return `skills must be an array of at most ${MAX_SKILLS} entries`;
    }
    if (!skills.every((s) => typeof s === 'string' && SKILL_PATTERN.test(s))) {
      return 'each skill must be lowercase letters, digits or hyphens, up to 40 characters';
    }
  }
  return null;
}

/**
 * Team Directory read access (any signed-in user, scoped to their own team unless admin)
 * and admin-only updates to leave, on-call status, seniority and skills.
 */
export function teamsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/teams', wrap(async (req: Request, res: Response) => {
    const user = req.user!;
    const { rows } = user.role === 'admin'
      ? await pool.query('SELECT id, name, description FROM teams ORDER BY id')
      : await pool.query('SELECT id, name, description FROM teams WHERE id = $1', [user.teamId]);
    return res.json({ teams: rows });
  }));

  router.get('/teams/:teamId/members', wrap(async (req: Request, res: Response) => {
    const user = req.user!;
    const teamId = req.params.teamId;
    if (user.role !== 'admin' && user.teamId !== teamId) {
      return res.status(403).json({ error: 'Forbidden', message: 'not a member of this team' });
    }
    const { rows } = await pool.query(
      `SELECT tm.user_id, u.name, tm.seniority, tm.skills, tm.on_call_status, tm.is_on_leave
         FROM team_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = $1 ORDER BY tm.user_id`,
      [teamId]
    );
    return res.json({ members: rows });
  }));

  router.get('/members/:userId', wrap(async (req: Request, res: Response) => {
    const user = req.user!;
    const { rows } = await pool.query(
      `SELECT tm.user_id, tm.team_id, u.name, tm.seniority, tm.skills,
              tm.on_call_status, tm.is_on_leave
         FROM team_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.user_id = $1`,
      [req.params.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'member not found' });
    if (user.role !== 'admin' && !rows.some((r) => r.team_id === user.teamId)) {
      return res.status(403).json({ error: 'Forbidden', message: 'not a member of your team' });
    }
    return res.json({ member: rows });
  }));

  router.patch('/members/:userId/status', requireAdmin, wrap(async (req: Request, res: Response) => {
    const error = validateStatusPatch(req.body);
    if (error) return badRequest(res, error);

    const b = req.body as Record<string, unknown>;
    const { rows } = await pool.query(
      `UPDATE team_members SET
         is_on_leave    = COALESCE($2, is_on_leave),
         on_call_status = COALESCE($3, on_call_status),
         seniority      = COALESCE($4, seniority),
         skills         = COALESCE($5, skills)
       WHERE user_id = $1
       RETURNING user_id, team_id, seniority, skills, on_call_status, is_on_leave`,
      [
        req.params.userId,
        b.is_on_leave ?? null,
        b.on_call_status ?? null,
        b.seniority ?? null,
        b.skills ?? null,
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'member not found' });
    return res.json({ member: rows });
  }));

  return router;
}
