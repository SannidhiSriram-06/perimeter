"""HTTP interface to the correlation engine, so the BFF can ask for a blast radius.

Run from the engine directory:
    uvicorn src.api:app --port 8000
"""

import dataclasses
from typing import Annotated, Any, Dict, List, Optional

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field

from .graph import BlastRadiusReport, Direction, ServiceDependencyGraph
from .llm import GroqClient, LLMClient, build_context, generate_draft
from .mock.fixtures import get_sample_trace_spans

app = FastAPI(title="Perimeter correlation engine")


class CorrelateRequest(BaseModel):
    service: str = Field(..., min_length=1, max_length=200, description="Service the alert fired on")
    max_depth: int = Field(default=3, ge=0, le=20)
    direction: Direction = "downstream"
    spans: Optional[List[Dict[str, Any]]] = Field(
        default=None, max_length=10_000, description="OpenTelemetry spans to build the graph from"
    )


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/correlate")
def correlate(request: CorrelateRequest) -> BlastRadiusReport:
    graph = ServiceDependencyGraph()
    # shortcut: with no spans in the request we use the mock fixtures, because no trace store exists yet; read spans from it when it does.
    graph.load_spans(request.spans if request.spans is not None else get_sample_trace_spans())
    return graph.get_blast_radius_report(request.service, request.max_depth, request.direction)


class DraftRequest(CorrelateRequest):
    incident_id: str = Field(..., min_length=1, max_length=100)
    alertname: str = Field(default="alert", max_length=100)
    fired_at: Optional[str] = Field(default=None, max_length=40)
    direction: Direction = "both"


def llm_client() -> LLMClient:
    return GroqClient()


@app.post("/draft")
def draft(request: DraftRequest, client: Annotated[LLMClient, Depends(llm_client)]) -> Dict[str, Any]:
    """Correlate, build the context, ask the model once and fact-check the answer.

    `status` is ok, flagged, rejected or llm_error (see src/llm/draft.py). `draft` is set for ok and flagged only.
    """
    spans = request.spans if request.spans is not None else get_sample_trace_spans()
    graph = ServiceDependencyGraph()
    graph.load_spans(spans)
    report = graph.get_blast_radius_report(request.service, request.max_depth, request.direction)
    alert = {"alertname": request.alertname, "service": request.service, "fired_at": request.fired_at}
    context = build_context(request.incident_id, alert, graph, report.impacted_services, spans)
    outcome = generate_draft(context, client, known_services=graph.graph.nodes)
    return {
        "status": outcome.status,
        "draft": outcome.draft,
        "validation": dataclasses.asdict(outcome.validation) if outcome.validation else None,
        "error": outcome.error,
    }
