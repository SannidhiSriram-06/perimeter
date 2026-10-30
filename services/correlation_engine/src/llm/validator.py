"""Deterministic fact-checking validator for the LLM root-cause draft.

Implements the rules in docs/llm-output-schema.md. The validator never edits the draft: it reports which claims are
supported and which whole-draft rules failed, and the dashboard shows those flags to the human reviewer.

Every check runs against the context object only, the same object the model was given.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional

from pydantic import ValidationError

from .schema import Claim, Draft

TOLERANCE = 0.05  # relative, for latency and metric values
TIMESTAMP_SLACK = timedelta(seconds=5)
INCIDENT_WINDOW = timedelta(minutes=15)

Context = Mapping[str, Any]


class DraftRejected(Exception):
    """The draft does not match the output schema, or answers a different incident."""


@dataclass
class ClaimResult:
    id: str
    supported: bool
    reasons: List[str] = field(default_factory=list)


@dataclass
class DraftIssue:
    rule: str
    message: str


@dataclass
class ValidationResult:
    claims: List[ClaimResult]
    issues: List[DraftIssue]
    # Indexes into postmortem.timeline of rows that cite a missing or unsupported claim. The row stays; the UI warns.
    timeline_warnings: List[int]

    @property
    def ok(self) -> bool:
        return all(c.supported for c in self.claims) and not self.issues and not self.timeline_warnings


def validate_draft(
    draft: Mapping[str, Any], context: Context, known_services: Optional[Iterable[str]] = None
) -> ValidationResult:
    """Check `draft` (the model's parsed JSON) against `context`.

    `known_services` is every service name in the cluster. Rule 4 flags any of them that appears in free text but is
    not in the blast radius; without it that rule is skipped, because the context alone does not list the others.

    Raises DraftRejected when the structure is wrong. Nothing else is checked in that case.
    """
    try:
        parsed = Draft.model_validate(draft)
    except ValidationError as err:
        raise DraftRejected(f"draft does not match the output schema: {err}") from err
    if parsed.incident_id != context.get("incident_id"):
        raise DraftRejected(f"draft is for {parsed.incident_id!r}, context is for {context.get('incident_id')!r}")

    blast = set(context.get("blast_radius", []))
    edges = {(e["source"], e["target"]) for e in context.get("trace_edges", [])}
    evidence = {e["id"]: e for e in context.get("evidence", [])}
    edge_ids = {e["id"] for e in context.get("trace_edges", [])}
    window = _window(context)

    claims = [_check_claim(c, blast, edges, evidence, edge_ids, window) for c in parsed.claims]
    by_id = {r.id: r for r in claims}

    issues: List[DraftIssue] = []
    hyp = parsed.hypothesis
    if hyp.root_cause_service not in blast:
        issues.append(DraftIssue("root_cause_in_blast_radius", f"{hyp.root_cause_service} is outside the blast radius"))
    for service in hyp.cascade_path:
        if service not in blast:
            issues.append(DraftIssue("cascade_path_in_blast_radius", f"{service} is outside the blast radius"))
    for i in range(len(hyp.cascade_path) - 1):
        a, b = hyp.cascade_path[i], hyp.cascade_path[i + 1]
        if (a, b) not in edges and (b, a) not in edges:
            issues.append(DraftIssue("cascade_path_connected", f"no trace edge between {a} and {b}"))

    warnings: List[int] = []
    for i, row in enumerate(parsed.postmortem.timeline):
        missing = [cid for cid in row.claim_ids if cid not in by_id]
        for cid in missing:
            issues.append(DraftIssue("timeline_claim_exists", f"timeline row {i} cites unknown claim {cid}"))
        if missing or any(not by_id[cid].supported for cid in row.claim_ids if cid in by_id):
            warnings.append(i)

    if known_services is not None:
        outsiders = [s for s in known_services if s not in blast]
        for where, text in _free_text(parsed):
            for service in outsiders:
                if re.search(rf"(?<![\w-]){re.escape(service)}(?![\w-])", text):
                    issues.append(DraftIssue("unknown_service_in_text", f"{service} (outside the blast radius) in {where}"))

    return ValidationResult(claims=claims, issues=issues, timeline_warnings=warnings)


def _free_text(draft: Draft) -> Iterable[tuple]:
    yield "hypothesis.summary", draft.hypothesis.summary
    pm = draft.postmortem
    yield "postmortem.summary", pm.summary
    yield "postmortem.impact", pm.impact
    for i, row in enumerate(pm.timeline):
        yield f"postmortem.timeline[{i}].event", row.event
    for i, text in enumerate(pm.contributing_factors):
        yield f"postmortem.contributing_factors[{i}]", text
    for i, text in enumerate(pm.next_steps):
        yield f"postmortem.next_steps[{i}]", text
    for claim in draft.claims:
        yield f"claims[{claim.id}].text", claim.text


# --- per-claim checks -----------------------------------------------------------------------------------------


def _check_claim(
    claim: Claim,
    blast: set,
    edges: set,
    evidence: Dict[str, Dict[str, Any]],
    edge_ids: set,
    window: Optional[tuple],
) -> ClaimResult:
    unknown = [eid for eid in claim.evidence_ids if eid not in evidence and eid not in edge_ids]
    if unknown:
        return ClaimResult(claim.id, False, [f"cites evidence that is not in the context: {', '.join(unknown)}"])
    cited = [evidence[eid] for eid in claim.evidence_ids if eid in evidence]

    checks: Dict[str, Callable[[], Optional[str]]] = {
        "service_ref": lambda: _service_ref(claim, blast),
        "causal_edge": lambda: _causal_edge(claim, edges),
        "latency": lambda: _latency(claim, cited),
        "status_code": lambda: _status_code(claim, cited),
        "metric_value": lambda: _metric_value(claim, cited),
        "timestamp": lambda: _timestamp(claim, cited, window),
    }
    problem = checks[claim.type]()
    return ClaimResult(claim.id, problem is None, [problem] if problem else [])


def _service_ref(claim: Claim, blast: set) -> Optional[str]:
    if claim.service not in blast:
        return f"{claim.service!r} is not in the blast radius"
    return None


def _causal_edge(claim: Claim, edges: set) -> Optional[str]:
    if (claim.source, claim.target) not in edges:
        return f"no trace edge {claim.source} -> {claim.target}"
    return None


def _spans_for(claim: Claim, cited: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [e for e in cited if e.get("kind") == "span" and e.get("service") == claim.service]


def _latency(claim: Claim, cited: List[Dict[str, Any]]) -> Optional[str]:
    if claim.value is None or claim.unit not in ("ms", "s"):
        return "latency claim needs a value in ms or s"
    spans = _spans_for(claim, cited)
    if not spans:
        return f"no cited span for {claim.service!r}"
    value_ms = claim.value * (1000 if claim.unit == "s" else 1)
    if not any(_close(value_ms, s.get("duration_ms")) for s in spans):
        return f"{value_ms:g}ms is not within 5% of the cited span duration"
    return None


def _status_code(claim: Claim, cited: List[Dict[str, Any]]) -> Optional[str]:
    spans = _spans_for(claim, cited)
    if not spans:
        return f"no cited span for {claim.service!r}"
    if not any(s.get("status_code") == claim.status_code for s in spans):
        return f"cited span for {claim.service!r} does not have status {claim.status_code}"
    return None


def _metric_value(claim: Claim, cited: List[Dict[str, Any]]) -> Optional[str]:
    # The claim schema has no metric-name field, so only the value can be compared, not the name.
    metrics = [e for e in cited if e.get("kind") == "metric"]
    if not metrics:
        return "cites no metric evidence"
    if not any(_close(claim.value, m.get("value")) for m in metrics):
        return "value is not within 5% of the cited metric"
    return None


def _timestamp(claim: Claim, cited: List[Dict[str, Any]], window: Optional[tuple]) -> Optional[str]:
    if claim.timestamp is None:
        return "timestamp claim has no timestamp"
    at = _utc(claim.timestamp)
    if window is None or not window[0] <= at <= window[1]:
        return "timestamp is outside the incident window"
    for e in cited:
        if e.get("kind") in ("log", "metric") and (ts := _parse(e.get("timestamp"))) is not None:
            if abs(at - ts) <= TIMESTAMP_SLACK:
                return None
    return "timestamp is not within 5 seconds of a cited log or metric"


# --- helpers ------------------------------------------------------------------------------------------------


def _close(claimed: Optional[float], actual: Any) -> bool:
    if claimed is None or not isinstance(actual, (int, float)):
        return False
    return abs(claimed - actual) <= TOLERANCE * abs(actual)


def _parse(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    try:
        return _utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        return None


def _utc(moment: datetime) -> datetime:
    # A timestamp with no zone is read as UTC so it can be compared with the others.
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment


def _window(context: Context) -> Optional[tuple]:
    fired = _parse(context.get("alert", {}).get("fired_at"))
    return None if fired is None else (fired - INCIDENT_WINDOW, fired + INCIDENT_WINDOW)
