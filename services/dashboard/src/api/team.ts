import { api } from './client';

export interface ServiceItem {
  id: string;
  name: string;
  owning_team_id: string;
  tier: string;
}

export interface ServicesResponse {
  services: ServiceItem[];
}

export interface ClaimItem {
  id: string;
  type: string;
  text: string;
  evidence_ids?: string[];
  service?: string;
  source?: string;
  target?: string;
  value?: number;
  unit?: string;
  status_code?: number;
  timestamp?: string;
}

export interface HypothesisData {
  summary?: string;
  root_cause_service?: string;
  cascade_path?: string[];
  confidence?: 'low' | 'medium' | 'high';
}

export interface PostmortemData {
  summary?: string;
  impact?: string;
  contributing_factors?: string[];
  next_steps?: string[];
  timeline?: Array<{ time: string; event: string; claim_ids?: string[] }>;
}

export interface IncidentItem {
  id: string;
  title: string;
  status: string;
  alert_service_id: string | null;
  blast_radius: string[];
  root_cause_draft: string | null;
  reviewed_draft?: unknown;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  finalized_at?: string | null;
  created_at: string;
  service_name: string | null;
  owning_team_id: string | null;
}

export interface IncidentsResponse {
  incidents: IncidentItem[];
}

export interface ClaimValidationInfo {
  claim: ClaimItem;
  supported: boolean;
  reason?: string;
}

export interface ParsedIncidentDraft {
  status: 'ok' | 'flagged' | 'none';
  hypothesis?: HypothesisData;
  claims: ClaimValidationInfo[];
  postmortem?: PostmortemData;
}

export function parseIncidentDraft(incident: IncidentItem): ParsedIncidentDraft {
  let draftStatus: 'ok' | 'flagged' | 'none' = 'none';
  let hypothesis: HypothesisData | undefined;
  let postmortem: PostmortemData | undefined;
  const claims: ClaimValidationInfo[] = [];

  // Parse original root_cause_draft if present
  let originalDraftObj: any = null;
  let validationObj: any = null;
  if (incident.root_cause_draft) {
    try {
      const parsed = typeof incident.root_cause_draft === 'string'
        ? JSON.parse(incident.root_cause_draft)
        : incident.root_cause_draft;

      if (parsed.status === 'ok' || parsed.status === 'flagged') {
        draftStatus = parsed.status;
      }
      originalDraftObj = parsed.draft ?? parsed;
      validationObj = parsed.validation ?? null;
    } catch {
      // unparseable draft text
    }
  }

  // Parse reviewed_draft if present
  let reviewedDraftObj: any = null;
  if (incident.reviewed_draft) {
    try {
      reviewedDraftObj = typeof incident.reviewed_draft === 'string'
        ? JSON.parse(incident.reviewed_draft)
        : incident.reviewed_draft;
    } catch {
      // unparseable reviewed draft
    }
  }

  // Base data comes from original AI draft, then merged with reviewed draft
  const activeDraft = { ...(originalDraftObj || {}), ...(reviewedDraftObj || {}) };

  if (activeDraft.hypothesis) {
    hypothesis = activeDraft.hypothesis;
  }

  if (activeDraft.postmortem) {
    postmortem = activeDraft.postmortem;
  }

  // Extract claims and map validation status
  const rawClaims: ClaimItem[] = originalDraftObj?.claims || activeDraft.claims || [];
  const claimValidationMap: Record<string, { supported?: boolean; reason?: string }> =
    validationObj?.claims || {};

  for (const c of rawClaims) {
    const val = claimValidationMap[c.id];
    const isSupported = val?.supported !== false;
    claims.push({
      claim: c,
      supported: isSupported,
      reason: val?.reason,
    });
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

export function fetchTeamIncidents(): Promise<IncidentsResponse> {
  return api<IncidentsResponse>('/api/v1/incidents');
}
