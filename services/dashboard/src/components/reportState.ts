import { parseIncidentDetails, type Incident } from '../api/incidents';
import type { Tone } from './ui';

export const isFinal = (incident: Incident): boolean => incident.status === 'final' || Boolean(incident.finalized_at);

const LABELS = {
  ok: { tone: 'ok', label: 'Ready' },
  flagged: { tone: 'warn', label: 'Flagged for review' },
  none: { tone: 'pending', label: 'No draft' },
} as const;

/** Where an incident's report stands, for status marks and filters. */
export function reportState(incident: Incident): { tone: Tone; label: string } {
  if (isFinal(incident)) return { tone: 'ink', label: 'Finalized' };
  return LABELS[parseIncidentDetails(incident).status];
}
