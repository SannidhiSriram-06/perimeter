"""HTTP interface to the correlation engine, so the BFF can ask for a blast radius.

Run from the engine directory:
    uvicorn src.api:app --port 8000
"""

from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .graph import BlastRadiusReport, Direction, ServiceDependencyGraph
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


@app.post("/correlate", response_model=BlastRadiusReport)
def correlate(request: CorrelateRequest) -> BlastRadiusReport:
    graph = ServiceDependencyGraph()
    # shortcut: with no spans in the request we use the mock fixtures, because no trace store exists yet; read spans from it when it does.
    graph.load_spans(request.spans if request.spans is not None else get_sample_trace_spans())
    return graph.get_blast_radius_report(request.service, request.max_depth, request.direction)
