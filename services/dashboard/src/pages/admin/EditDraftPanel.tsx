import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  currentDraft,
  parseModelDraft,
  patchDraft,
  type Confidence,
  type DraftIssue,
  type Incident,
  type Validation,
} from '../../api/incidents';
import { isFinal } from '../../components/reportState';
import { diff, LIMITS, saveErrorMessage, toForm, validate, type FormErrors, type FormState } from './draftForm';

const CONFIDENCE: Confidence[] = ['low', 'medium', 'high'];

interface Props {
  incident: Incident;
  /** Called with the incident the server returns after a save, so the parent shows the stored values. */
  onSaved: (incident: Incident) => void;
}

/** Validator messages whose rule starts with one of these prefixes, shown next to the field they concern. */
const issuesFor = (validation: Validation | null, ...prefixes: string[]): DraftIssue[] =>
  (validation?.issues ?? []).filter((i) => prefixes.some((p) => i.rule.startsWith(p)));

function FieldWarnings({ issues }: { issues: DraftIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="flags" aria-label="Validator flags">
      {issues.map((i) => (
        <li key={`${i.rule}-${i.message}`}>⚠ {i.message}</li>
      ))}
    </ul>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  error?: string;
  hint?: string;
  rows?: number;
  warnings?: DraftIssue[];
}

function Field({ label, value, onChange, disabled, error, hint, rows = 3, warnings = [] }: FieldProps) {
  return (
    <div>
      <label>
        {label}
        <textarea rows={rows} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </label>
      {hint && <small>{hint}</small>}
      {error && <p className="error" role="alert">{error}</p>}
      <FieldWarnings issues={warnings} />
    </div>
  );
}

function ValidatorSummary({ validation }: { validation: Validation | null }) {
  if (!validation) return <p>No validator result for this draft.</p>;
  const unsupported = validation.claims.filter((c) => !c.supported);
  if (unsupported.length === 0 && validation.issues.length === 0 && validation.timeline_warnings.length === 0) {
    return <p>The validator supported every claim in the model draft.</p>;
  }
  return (
    <section aria-label="Validator flags" className="banner">
      <h3>Double check these</h3>
      <ul>
        {unsupported.map((c) => (
          <li key={c.id}>
            ✗ {c.rendered_text} ({c.reasons.join('; ')})
          </li>
        ))}
        {validation.issues.map((i) => (
          <li key={`${i.rule}-${i.message}`}>⚠ {i.message}</li>
        ))}
        {validation.timeline_warnings.length > 0 && (
          <li>⚠ Timeline rows without a supported claim: {validation.timeline_warnings.map((n) => n + 1).join(', ')}</li>
        )}
      </ul>
    </section>
  );
}

function ReviewStamp({ incident }: { incident: Incident }) {
  if (!incident.reviewed_at) return <p>Not edited yet.</p>;
  return (
    <p>
      Last edited by {incident.reviewed_by ?? 'unknown'} at {new Date(incident.reviewed_at).toLocaleString()}
      {incident.finalized_at && ` · finalized ${new Date(incident.finalized_at).toLocaleString()}`}
    </p>
  );
}

function useDraftForm(incident: Incident) {
  const base = useMemo(() => toForm(currentDraft(incident)), [incident]);
  const [form, setForm] = useState<FormState>(base);
  useEffect(() => setForm(base), [base]);
  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  return { base, form, set };
}

export default function EditDraftPanel({ incident, onSaved }: Props) {
  const { base, form, set } = useDraftForm(incident);
  const [reopened, setReopened] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = useMemo(() => parseModelDraft(incident.root_cause_draft).validation, [incident]);
  const readOnly = isFinal(incident) && !reopened;
  const errors: FormErrors = validate(form);
  const patch = diff(form, base);
  const changed = Object.keys(patch).length > 0;
  const invalid = Object.keys(errors).length > 0;

  async function submit(finalize: boolean) {
    setSaving(true);
    setError(null);
    setConfirming(false);
    try {
      const res = await patchDraft(incident.id, finalize ? { ...patch, finalize: true } : patch);
      onSaved(res.incident);
      setReopened(false);
    } catch (err) {
      setError(saveErrorMessage(err instanceof ApiError ? err.status : undefined));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Edit draft" className="card edit-panel" style={{ marginTop: 24 }}>
      <h2>Review draft</h2>
      <ReviewStamp incident={incident} />
      <ValidatorSummary validation={validation} />

      {readOnly && (
        <output className="dashed line">
          This incident is final and read-only. <button onClick={() => setReopened(true)}>Reopen for editing</button>
        </output>
      )}

      <h3>Hypothesis</h3>
      <Field label="Summary" value={form.summary} onChange={set('summary')} disabled={readOnly} error={errors.summary} hint={`${form.summary.length}/${LIMITS.hypothesisSummary}`} />
      <Field label="Root cause service" value={form.rootCause} onChange={set('rootCause')} disabled={readOnly} rows={1} warnings={issuesFor(validation, 'root_cause')} />
      <Field label="Cascade path (one service per line)" value={form.cascadePath} onChange={set('cascadePath')} disabled={readOnly} error={errors.cascadePath} warnings={issuesFor(validation, 'cascade_path')} />
      <label>
        Confidence
        <select value={form.confidence} disabled={readOnly} onChange={(e) => set('confidence')(e.target.value as Confidence)}>
          {CONFIDENCE.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <h3>Postmortem</h3>
      <Field label="Postmortem summary" value={form.pmSummary} onChange={set('pmSummary')} disabled={readOnly} error={errors.pmSummary} hint={`${form.pmSummary.length}/${LIMITS.pmSummary}`} />
      <Field label="Impact" value={form.impact} onChange={set('impact')} disabled={readOnly} error={errors.impact} hint={`${form.impact.length}/${LIMITS.impact}`} />
      <Field label="Contributing factors (one per line)" value={form.factors} onChange={set('factors')} disabled={readOnly} error={errors.factors} />
      <Field label="Next steps (one per line)" value={form.nextSteps} onChange={set('nextSteps')} disabled={readOnly} error={errors.nextSteps} />

      {error && <p className="error" role="alert">{error}</p>}

      {!readOnly && !confirming && (
        <div className="finalize">
          <p>
            <button className="primary" onClick={() => setConfirming(true)} disabled={saving || invalid}>Mark final</button>
            <button onClick={() => submit(false)} disabled={saving || invalid || !changed}>Save</button>
          </p>
        </div>
      )}
      {!readOnly && confirming && (
        <div className="finalize">
          <p role="alertdialog" aria-label="Confirm finalize">
            Mark this incident final? Team members will no longer be able to edit it.{' '}
            <button className="primary" onClick={() => submit(true)} disabled={saving}>Confirm: mark final</button>
            <button onClick={() => setConfirming(false)}>Cancel</button>
          </p>
        </div>
      )}
    </section>
  );
}
