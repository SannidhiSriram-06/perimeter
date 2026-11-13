import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { wrap } from '../http';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateDraftPatch(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }

  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length === 0) {
    return 'Request body cannot be empty';
  }

  const allowedTopKeys = new Set(['hypothesis', 'postmortem', 'finalize']);
  for (const key of keys) {
    if (!allowedTopKeys.has(key)) {
      return `Unknown key: ${key}`;
    }
  }

  const b = body as Record<string, unknown>;

  if ('finalize' in b) {
    if (typeof b.finalize !== 'boolean') {
      return `'finalize' must be a boolean`;
    }
  }

  if ('hypothesis' in b) {
    const hyp = b.hypothesis;
    if (!hyp || typeof hyp !== 'object' || Array.isArray(hyp)) {
      return `'hypothesis' must be a non-null object`;
    }
    const hypKeys = Object.keys(hyp as Record<string, unknown>);
    if (hypKeys.length === 0) {
      return `'hypothesis' cannot be empty`;
    }
    const allowedHypKeys = new Set(['summary', 'root_cause_service', 'cascade_path', 'confidence']);
    for (const key of hypKeys) {
      if (!allowedHypKeys.has(key)) {
        return `Unknown key in hypothesis: ${key}`;
      }
    }
    const h = hyp as Record<string, unknown>;
    if ('summary' in h) {
      if (typeof h.summary !== 'string') return `'hypothesis.summary' must be a string`;
      if (h.summary.length > 500) return `'hypothesis.summary' exceeds maximum 500 characters`;
    }
    if ('root_cause_service' in h) {
      if (typeof h.root_cause_service !== 'string') return `'hypothesis.root_cause_service' must be a string`;
    }
    if ('cascade_path' in h) {
      if (!Array.isArray(h.cascade_path) || h.cascade_path.length === 0) {
        return `'hypothesis.cascade_path' must be an array containing at least one string`;
      }
      for (const item of h.cascade_path) {
        if (typeof item !== 'string') {
          return `'hypothesis.cascade_path' items must be strings`;
        }
      }
    }
    if ('confidence' in h) {
      if (typeof h.confidence !== 'string' || !['low', 'medium', 'high'].includes(h.confidence)) {
        return `'hypothesis.confidence' must be one of 'low', 'medium', 'high'`;
      }
    }
  }

  if ('postmortem' in b) {
    const pm = b.postmortem;
    if (!pm || typeof pm !== 'object' || Array.isArray(pm)) {
      return `'postmortem' must be a non-null object`;
    }
    const pmKeys = Object.keys(pm as Record<string, unknown>);
    if (pmKeys.length === 0) {
      return `'postmortem' cannot be empty`;
    }
    const allowedPmKeys = new Set(['summary', 'impact', 'contributing_factors', 'next_steps']);
    for (const key of pmKeys) {
      if (!allowedPmKeys.has(key)) {
        return `Unknown key in postmortem: ${key}`;
      }
    }
    const p = pm as Record<string, unknown>;
    if ('summary' in p) {
      if (typeof p.summary !== 'string') return `'postmortem.summary' must be a string`;
      if (p.summary.length > 800) return `'postmortem.summary' exceeds maximum 800 characters`;
    }
    if ('impact' in p) {
      if (typeof p.impact !== 'string') return `'postmortem.impact' must be a string`;
      if (p.impact.length > 500) return `'postmortem.impact' exceeds maximum 500 characters`;
    }
    if ('contributing_factors' in p) {
      if (!Array.isArray(p.contributing_factors)) {
        return `'postmortem.contributing_factors' must be an array of strings`;
      }
      for (const item of p.contributing_factors) {
        if (typeof item !== 'string') {
          return `'postmortem.contributing_factors' items must be strings`;
        }
        if (item.length > 300) {
          return `'postmortem.contributing_factors' item exceeds maximum 300 characters`;
        }
      }
    }
    if ('next_steps' in p) {
      if (!Array.isArray(p.next_steps)) {
        return `'postmortem.next_steps' must be an array of strings`;
      }
      for (const item of p.next_steps) {
        if (typeof item !== 'string') {
          return `'postmortem.next_steps' items must be strings`;
        }
        if (item.length > 300) {
          return `'postmortem.next_steps' item exceeds maximum 300 characters`;
        }
      }
    }
  }

  return null;
}

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
                i.reviewed_draft,
                i.reviewed_by,
                i.reviewed_at,
                i.finalized_at,
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
                i.reviewed_draft,
                i.reviewed_by,
                i.reviewed_at,
                i.finalized_at,
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

  // PATCH /api/v1/incidents/:id/draft: Edit and finalize an incident draft.
  // Admins can edit any incident and can edit even finalized incidents.
  // Team members can only edit unfinalized incidents belonging to their own team.
  router.patch(
    '/incidents/:id/draft',
    wrap(async (req: Request, res: Response) => {
      const user = req.user!;
      const { id } = req.params;

      if (!UUID_REGEX.test(id)) {
        return res.status(404).json({ error: 'Not Found', message: 'Incident not found' });
      }

      const validationError = validateDraftPatch(req.body);
      if (validationError) {
        return res.status(400).json({ error: 'Bad Request', message: validationError });
      }

      // Check incident existence and ownership
      const { rows } = await pool.query<{
        id: string;
        title: string;
        status: string;
        alert_service_id: string | null;
        blast_radius: unknown;
        root_cause_draft: string | null;
        reviewed_draft: unknown;
        reviewed_by: string | null;
        reviewed_at: Date | null;
        finalized_at: Date | null;
        service_name: string | null;
        owning_team_id: string | null;
      }>(
        `SELECT
          i.id,
          i.title,
          i.status,
          i.alert_service_id,
          i.blast_radius,
          i.root_cause_draft,
          i.reviewed_draft,
          i.reviewed_by,
          i.reviewed_at,
          i.finalized_at,
          i.created_at,
          s.name AS service_name,
          s.owning_team_id
        FROM incidents i
        LEFT JOIN services s ON s.id = i.alert_service_id
        WHERE i.id = $1`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'Incident not found' });
      }

      const incident = rows[0];

      // Authorization checks
      if (user.role === 'team_member') {
        if (!incident.owning_team_id || incident.owning_team_id !== user.teamId) {
          return res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to edit this incident' });
        }
        if (incident.status === 'final' || incident.finalized_at !== null) {
          return res.status(409).json({ error: 'Conflict', message: 'Incident has already been finalized' });
        }
      }

      // Preserve original root_cause_draft; merge user edits into reviewed_draft
      let baseDraft: Record<string, unknown> = {};
      if (incident.reviewed_draft) {
        baseDraft =
          typeof incident.reviewed_draft === 'string'
            ? (JSON.parse(incident.reviewed_draft) as Record<string, unknown>)
            : (incident.reviewed_draft as Record<string, unknown>);
      } else if (incident.root_cause_draft) {
        try {
          const parsed = JSON.parse(incident.root_cause_draft) as Record<string, unknown>;
          if (parsed.draft && typeof parsed.draft === 'object') {
            baseDraft = parsed.draft as Record<string, unknown>;
          } else {
            baseDraft = parsed;
          }
        } catch {
          baseDraft = {};
        }
      }

      const body = req.body as {
        hypothesis?: Record<string, unknown>;
        postmortem?: Record<string, unknown>;
        finalize?: boolean;
      };

      const updatedReviewedDraft: Record<string, unknown> = { ...baseDraft };

      if (body.hypothesis !== undefined) {
        updatedReviewedDraft.hypothesis = {
          ...((baseDraft.hypothesis as Record<string, unknown> | undefined) ?? {}),
          ...body.hypothesis,
        };
      }

      if (body.postmortem !== undefined) {
        updatedReviewedDraft.postmortem = {
          ...((baseDraft.postmortem as Record<string, unknown> | undefined) ?? {}),
          ...body.postmortem,
        };
      }

      const now = new Date();
      const isFinalize = body.finalize === true;
      const nextStatus = isFinalize ? 'final' : incident.status;
      const nextFinalizedAt = isFinalize ? now : incident.finalized_at;

      const updateResult = await pool.query(
        `WITH updated AS (
          UPDATE incidents
          SET
            reviewed_draft = $1::jsonb,
            reviewed_by = $2,
            reviewed_at = $3,
            status = $4,
            finalized_at = $5
          WHERE id = $6
          RETURNING *
        )
        SELECT
          u.id,
          u.title,
          u.status,
          u.alert_service_id,
          u.blast_radius,
          u.root_cause_draft,
          u.reviewed_draft,
          u.reviewed_by,
          u.reviewed_at,
          u.finalized_at,
          u.created_at,
          s.name AS service_name,
          s.owning_team_id
        FROM updated u
        LEFT JOIN services s ON s.id = u.alert_service_id`,
        [JSON.stringify(updatedReviewedDraft), user.id, now, nextStatus, nextFinalizedAt, id]
      );

      return res.json({ incident: updateResult.rows[0] });
    })
  );

  return router;
}
