"""Pydantic form of the LLM output JSON schema in docs/llm-output-schema.md.

`extra="forbid"` mirrors `additionalProperties: false`: a draft with a field the contract does not name is rejected.
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ClaimType = Literal["service_ref", "causal_edge", "metric_value", "latency", "status_code", "timestamp"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Hypothesis(_Strict):
    root_cause_service: str
    cascade_path: List[str] = Field(..., min_length=1)
    summary: str = Field(..., max_length=500)
    confidence: Literal["low", "medium", "high"]


class Claim(_Strict):
    id: str
    type: ClaimType
    text: str = Field(..., max_length=300)
    evidence_ids: List[str] = Field(..., min_length=1)
    service: Optional[str] = None
    source: Optional[str] = None
    target: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[Literal["ms", "s", "count", "percent"]] = None
    status_code: Optional[int] = None
    timestamp: Optional[datetime] = None


class TimelineEntry(_Strict):
    time: datetime
    event: str = Field(..., max_length=300)
    claim_ids: List[str] = Field(..., min_length=1)


class Postmortem(_Strict):
    summary: str = Field(..., max_length=800)
    impact: str = Field(..., max_length=500)
    timeline: List[TimelineEntry]
    contributing_factors: List[str]
    next_steps: List[str]


class Draft(_Strict):
    incident_id: str
    hypothesis: Hypothesis
    claims: List[Claim] = Field(..., max_length=30)
    postmortem: Postmortem


# Keywords Groq's strict mode does not document. They are removed from the schema sent to the API; Draft still enforces
# them locally when the answer is validated.
_UNSENT_KEYWORDS = {"title", "default", "format", "minLength", "maxLength", "minItems", "maxItems"}


def strict_json_schema() -> Dict[str, Any]:
    """The Draft schema in the shape strict structured outputs accept.

    Every object lists all of its properties as required and forbids extras. A field that does not apply to a claim
    type (for example `status_code` on a `causal_edge`) is sent as null, which Draft allows.
    """

    def clean(node: Any) -> Any:
        if isinstance(node, list):
            return [clean(item) for item in node]
        if not isinstance(node, dict):
            return node
        out = {k: clean(v) for k, v in node.items() if k not in _UNSENT_KEYWORDS or k == "properties"}
        if isinstance(out.get("properties"), dict):
            out["required"] = list(out["properties"])
            out["additionalProperties"] = False
        return out

    return clean(Draft.model_json_schema())
