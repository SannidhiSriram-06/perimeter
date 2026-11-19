import type { Confidence, DraftBody, DraftPatch } from '../../api/incidents';

/** Limits from the PATCH /api/v1/incidents/:id/draft contract (the BFF enforces them too). */
export const LIMITS = { hypothesisSummary: 500, pmSummary: 800, impact: 500, listItem: 300 } as const;

export interface FormState {
  summary: string;
  rootCause: string;
  cascadePath: string;
  confidence: Confidence;
  pmSummary: string;
  impact: string;
  factors: string;
  nextSteps: string;
}

export type FormErrors = Partial<Record<keyof FormState, string>>;

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

export function toForm(draft: DraftBody): FormState {
  const h = draft.hypothesis ?? {};
  const p = draft.postmortem ?? {};
  return {
    summary: h.summary ?? '',
    rootCause: h.root_cause_service ?? '',
    cascadePath: (h.cascade_path ?? []).join('\n'),
    confidence: h.confidence ?? 'low',
    pmSummary: p.summary ?? '',
    impact: p.impact ?? '',
    factors: (p.contributing_factors ?? []).join('\n'),
    nextSteps: (p.next_steps ?? []).join('\n'),
  };
}

const tooLong = (items: string[]) => items.some((i) => i.length > LIMITS.listItem);

export function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.summary.length > LIMITS.hypothesisSummary) errors.summary = `At most ${LIMITS.hypothesisSummary} characters`;
  if (lines(form.cascadePath).length === 0) errors.cascadePath = 'Needs at least one service';
  if (form.pmSummary.length > LIMITS.pmSummary) errors.pmSummary = `At most ${LIMITS.pmSummary} characters`;
  if (form.impact.length > LIMITS.impact) errors.impact = `At most ${LIMITS.impact} characters`;
  if (tooLong(lines(form.factors))) errors.factors = `Each line at most ${LIMITS.listItem} characters`;
  if (tooLong(lines(form.nextSteps))) errors.nextSteps = `Each line at most ${LIMITS.listItem} characters`;
  return errors;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Only what the reviewer changed, so a save never rewrites fields they did not touch. */
export function diff(form: FormState, base: FormState): DraftPatch {
  const hypothesis: NonNullable<DraftPatch['hypothesis']> = {};
  if (form.summary !== base.summary) hypothesis.summary = form.summary;
  if (form.rootCause !== base.rootCause) hypothesis.root_cause_service = form.rootCause;
  if (!sameList(lines(form.cascadePath), lines(base.cascadePath))) hypothesis.cascade_path = lines(form.cascadePath);
  if (form.confidence !== base.confidence) hypothesis.confidence = form.confidence;

  const postmortem: NonNullable<DraftPatch['postmortem']> = {};
  if (form.pmSummary !== base.pmSummary) postmortem.summary = form.pmSummary;
  if (form.impact !== base.impact) postmortem.impact = form.impact;
  if (!sameList(lines(form.factors), lines(base.factors))) postmortem.contributing_factors = lines(form.factors);
  if (!sameList(lines(form.nextSteps), lines(base.nextSteps))) postmortem.next_steps = lines(form.nextSteps);

  const patch: DraftPatch = {};
  if (Object.keys(hypothesis).length) patch.hypothesis = hypothesis;
  if (Object.keys(postmortem).length) patch.postmortem = postmortem;
  return patch;
}

/** A clear message for each failure the BFF can return. */
export function saveErrorMessage(status: number | undefined): string {
  switch (status) {
    case 400:
      return 'The server rejected these values. Check the field limits and try again.';
    case 403:
      return 'You do not have permission to edit this incident.';
    case 404:
      return 'This incident no longer exists.';
    case 409:
      return 'This incident has already been finalized.';
    default:
      return 'Could not save. Try again.';
  }
}
