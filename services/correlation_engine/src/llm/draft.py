"""One incident in, one checked root-cause draft out: prompt, model call, parse, validate."""

import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Literal, Mapping, Optional

from .client import LLMClient, LLMError
from .prompt import build_prompt
from .validator import DraftRejected, ValidationResult, validate_draft

# ok: every claim supported. flagged: usable draft with unsupported claims for the reviewer to see.
# rejected: not valid JSON or not the schema; `raw` keeps the response for debugging. llm_error: no response at all.
Status = Literal["ok", "flagged", "rejected", "llm_error"]


@dataclass
class DraftOutcome:
    status: Status
    draft: Optional[Dict[str, Any]] = None
    validation: Optional[ValidationResult] = None
    raw: Optional[str] = None
    error: Optional[str] = None


def generate_draft(
    context: Mapping[str, Any], client: LLMClient, known_services: Optional[Iterable[str]] = None
) -> DraftOutcome:
    """Ask the model once and check its answer. There are no retries: a bad draft is shown as bad, not re-rolled."""
    system, user = build_prompt(context)
    try:
        raw = client.complete(system, user)
    except LLMError as err:
        return DraftOutcome("llm_error", error=str(err))

    try:
        data = json.loads(raw)
    except ValueError:
        return DraftOutcome("rejected", raw=raw, error="response is not valid JSON")
    if not isinstance(data, dict):
        return DraftOutcome("rejected", raw=raw, error="response is not a JSON object")

    try:
        result = validate_draft(data, context, known_services)
    except DraftRejected as err:
        return DraftOutcome("rejected", raw=raw, error=str(err))
    return DraftOutcome("ok" if result.ok else "flagged", draft=data, validation=result, raw=raw)
