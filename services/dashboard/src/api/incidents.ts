import { api } from './client';

export interface ClaimResult {
  id: string;
  supported: boolean;
  reasons: string[];
  rendered_text: string;
}

export interface DraftIssue {
  rule: string;
  message: string;
}

/** What the engine's validator returned, stored next to the model draft (docs/llm-output-schema.md). */
export interface Validation {
  claims: ClaimResult[];
  issues: DraftIssue[];
  timeline_warnings: number[];
}

export type Confidence = 'low' | 'medium' | 'high';

export interface Hypothesis {
  root_cause_service?: string;
  cascade_path?: string[];
  summary?: string;
  confidence?: Confidence;
}

export interface Postmortem {
  summary?: string;
  impact?: string;
  contributing_factors?: string[];
  next_steps?: string[];
}

/** The parts of a draft a reviewer can edit. */
export interface DraftBody {
  hypothesis?: Hypothesis;
  postmortem?: Postmortem;
}

export interface Incident {
  id: string;
  title: string;
  status: string;
  alert_service_id: string | null;
  blast_radius: string[];
  /** JSON text: {"status", "draft", "validation"}, or null when no draft exists. */
  root_cause_draft: string | null;
  /** The reviewer's merged edits; never overwrites root_cause_draft. */
  reviewed_draft: DraftBody | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  finalized_at: string | null;
  created_at: string;
  service_name: string | null;
  owning_team_id: string | null;
}

/** Body of PATCH /api/v1/incidents/:id/draft. At least one key is required by the server. */
export interface DraftPatch {
  hypothesis?: Hypothesis;
  postmortem?: Postmortem;
  finalize?: boolean;
}

export const fetchIncidents = (): Promise<{ incidents: Incident[] }> =>
  api<{ incidents: Incident[] }>('/api/v1/incidents');

export const patchDraft = (id: string, patch: DraftPatch): Promise<{ incident: Incident }> =>
  api<{ incident: Incident }>(`/api/v1/incidents/${id}/draft`, { method: 'PATCH', body: JSON.stringify(patch) });

export interface ParsedDraft {
  status: string | null;
  draft: DraftBody | null;
  validation: Validation | null;
}

/** Reads the stored model draft. A missing or malformed value gives an empty result instead of throwing. */
export function parseModelDraft(text: string | null): ParsedDraft {
  const empty: ParsedDraft = { status: null, draft: null, validation: null };
  if (!text) return empty;
  try {
    const parsed = JSON.parse(text) as { status?: string; draft?: DraftBody; validation?: Validation };
    return { status: parsed.status ?? null, draft: parsed.draft ?? null, validation: parsed.validation ?? null };
  } catch {
    return empty;
  }
}

/** The draft the reviewer starts from: their earlier edits if any, else the model's draft. */
export function currentDraft(incident: Incident): DraftBody {
  const model = parseModelDraft(incident.root_cause_draft).draft ?? {};
  const edited = incident.reviewed_draft ?? {};
  return {
    hypothesis: { ...model.hypothesis, ...edited.hypothesis },
    postmortem: { ...model.postmortem, ...edited.postmortem },
  };
}
