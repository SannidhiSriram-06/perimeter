"""HTTP interface to the correlation engine, so the BFF can ask for a blast radius.

Run from the engine directory:
    uvicorn src.api:app --port 8000
"""

import dataclasses
from typing import Annotated, Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .compressor import DEFAULT_TOKEN_BUDGET, compress
from .graph import BlastRadiusReport, Direction, ServiceDependencyGraph
from .llm import GroqClient, LLMClient, generate_draft
from .mock.fixtures import get_sample_logs, get_sample_metrics, get_sample_trace_spans

app = FastAPI(title="Perimeter correlation engine")

# Telemetry lists are capped well below what the compressor could process in a few seconds, because the endpoints
# are not authenticated yet. Extra keys are kept (OpenTelemetry spans carry many attributes).
MAX_ITEMS = 2_000


class Span(BaseModel):
    model_config = ConfigDict(extra="allow")
    span_id: Optional[str] = Field(default=None, max_length=200)
    parent_span_id: Optional[str] = Field(default=None, max_length=200)
    service_name: Optional[str] = Field(default=None, max_length=200)
    duration_ms: Optional[float] = Field(default=None, allow_inf_nan=False)
    status_code: Optional[int] = None
    status_message: Optional[str] = None


class LogLine(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = Field(default=None, max_length=200)
    service: Optional[str] = Field(default=None, max_length=200)
    level: Optional[str] = None
    timestamp: Optional[str] = None
    message: Optional[str] = None


class MetricSample(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = Field(default=None, max_length=200)
    service: Optional[str] = Field(default=None, max_length=200)
    name: Optional[str] = None
    value: Optional[float] = Field(default=None, allow_inf_nan=False)
    baseline: Optional[float] = Field(default=None, allow_inf_nan=False)
    timestamp: Optional[str] = None


def _plain(items: Optional[List[BaseModel]]) -> Optional[List[Dict[str, Any]]]:
    """Back to plain dicts with exactly the keys the caller sent, which is what the graph and compressor read."""
    return None if items is None else [i.model_dump(exclude_unset=True) for i in items]


class CorrelateRequest(BaseModel):
    service: str = Field(..., min_length=1, max_length=200, description="Service the alert fired on")
    max_depth: int = Field(default=3, ge=0, le=20)
    direction: Direction = "downstream"
    spans: Optional[List[Span]] = Field(
        default=None, max_length=MAX_ITEMS, description="OpenTelemetry spans to build the graph from"
    )


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/correlate")
def correlate(request: CorrelateRequest) -> BlastRadiusReport:
    graph = ServiceDependencyGraph()
    # shortcut: with no spans in the request we use the mock fixtures, because no trace store exists yet; read spans from it when it does.
    spans = _plain(request.spans)
    graph.load_spans(spans if spans is not None else get_sample_trace_spans())
    return graph.get_blast_radius_report(request.service, request.max_depth, request.direction)


class DraftRequest(CorrelateRequest):
    incident_id: str = Field(..., min_length=1, max_length=100)
    alertname: str = Field(default="alert", max_length=100)
    fired_at: Optional[str] = Field(default=None, max_length=40)
    direction: Direction = "both"
    logs: Optional[List[LogLine]] = Field(default=None, max_length=MAX_ITEMS, description="Log lines (id, service, level, timestamp, message)")
    metrics: Optional[List[MetricSample]] = Field(default=None, max_length=MAX_ITEMS, description="Metric samples (id, service, name, value, baseline, timestamp)")
    token_budget: int = Field(default=DEFAULT_TOKEN_BUDGET, ge=500, le=20_000, description="Estimated tokens (characters / 4) for the context")


def llm_client() -> LLMClient:
    return GroqClient()


@app.post("/draft", responses={422: {"description": "token_budget is too small for the blast radius and trace edges"}})
def draft(request: DraftRequest, client: Annotated[LLMClient, Depends(llm_client)]) -> Dict[str, Any]:
    """Correlate, build the context, ask the model once and fact-check the answer.

    `status` is ok, flagged, rejected or llm_error (see src/llm/draft.py). `draft` is set for ok and flagged only.
    """
    plain_spans = _plain(request.spans)
    spans = plain_spans if plain_spans is not None else get_sample_trace_spans()
    graph = ServiceDependencyGraph()
    graph.load_spans(spans)
    report = graph.get_blast_radius_report(request.service, request.max_depth, request.direction)
    alert = {"alertname": request.alertname, "service": request.service, "fired_at": request.fired_at}
    # shortcut: logs and metrics fall back to the mock fixtures until the event store exists.
    plain_logs = _plain(request.logs)
    logs = plain_logs if plain_logs is not None else get_sample_logs(request.fired_at)
    plain_metrics = _plain(request.metrics)
    metrics = plain_metrics if plain_metrics is not None else get_sample_metrics(request.fired_at)
    try:
        context = compress(
            request.incident_id, alert, graph, report.impacted_services, spans, logs, metrics, request.token_budget
        )
    except ValueError as err:
        raise HTTPException(422, str(err)) from err
    outcome = generate_draft(context, client, known_services=graph.graph.nodes)
    return {
        "status": outcome.status,
        "draft": outcome.draft,
        "validation": dataclasses.asdict(outcome.validation) if outcome.validation else None,
        "error": outcome.error,
    }
