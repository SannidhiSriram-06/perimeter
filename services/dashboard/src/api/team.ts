import { api } from './client';
import { ClaimResult, DraftBody, Hypothesis, Incident, Postmortem, Validation } from './incidents';

export interface ServiceItem {
  id: string;
  name: string;
  owning_team_id: string;
  tier: string;
}

export interface ServicesResponse {
  services: ServiceItem[];
}

export interface ValidatedClaim {
  id: string;
  type: string;
  rendered_text: string;
  supported: boolean;
  reasons: string[];
  evidence_ids?: string[];
}

export interface ParsedIncidentDraft {
  status: 'ok' | 'flagged' | 'none';
  hypothesis?: Hypothesis;
  claims: ValidatedClaim[];
  postmortem?: Postmortem;
}

export function parseIncidentDraft(incident: Incident): ParsedIncidentDraft {
  let draftStatus: 'ok' | 'flagged' | 'none' = 'none';
  let modelDraft: DraftBody | null = null;
  let validationObj: Validation | null = null;

  if (incident.root_cause_draft) {
    try {
      const parsed = JSON.parse(incident.root_cause_draft) as {
        status?: string;
        draft?: DraftBody;
        validation?: Validation;
      };
      if (parsed.status === 'ok' || parsed.status === 'flagged') {
        draftStatus = parsed.status;
      }
      modelDraft = parsed.draft ?? null;
      validationObj = parsed.validation ?? null;
    } catch {
      // unparseable draft text
    }
  }

  const reviewed = incident.reviewed_draft ?? null;
  const hypothesis = reviewed?.hypothesis ?? modelDraft?.hypothesis;
  const postmortem = reviewed?.postmortem ?? modelDraft?.postmortem;

  // Build lookup from the validation claims array (audit N-04)
  const validationClaims: ClaimResult[] = Array.isArray(validationObj?.claims)
    ? validationObj.claims
    : [];
  const claimValidationMap: Record<string, ClaimResult> = Object.fromEntries(
    validationClaims.map((c) => [c.id, c])
  );

  const rawClaims: Array<{ id: string; type?: string; text?: string; evidence_ids?: string[] }> =
    (modelDraft as { claims?: Array<{ id: string; type?: string; text?: string; evidence_ids?: string[] }> })?.claims ||
    validationClaims.map((c) => ({ id: c.id, text: c.rendered_text }));

  const claims: ValidatedClaim[] = [];
  const seenIds = new Set<string>();

  for (const c of rawClaims) {
    seenIds.add(c.id);
    const val = claimValidationMap[c.id];
    claims.push({
      id: c.id,
      type: c.type || 'claim',
      // Show rendered_text from the validation result instead of model text (audit N-04)
      rendered_text: val?.rendered_text || c.text || '',
      supported: val ? val.supported : true,
      reasons: val?.reasons || [],
      evidence_ids: c.evidence_ids || [],
    });
  }

  for (const vc of validationClaims) {
    if (!seenIds.has(vc.id)) {
      claims.push({
        id: vc.id,
        type: 'claim',
        rendered_text: vc.rendered_text,
        supported: vc.supported,
        reasons: vc.reasons || [],
        evidence_ids: [],
      });
    }
  }

  return {
    status: draftStatus,
    hypothesis,
    claims,
    postmortem,
  };
}

export function fetchTeamServices(): Promise<ServicesResponse> {
  return api<ServicesResponse>('/api/v1/services');
}

export function fetchTeamIncidents(): Promise<{ incidents: Incident[] }> {
  return api<{ incidents: Incident[] }>('/api/v1/incidents');
}
