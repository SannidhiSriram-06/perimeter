"""Builds the context object the model sees (docs/llm-output-schema.md) from a blast radius and OpenTelemetry spans."""

from typing import Any, Dict, Iterable, List, Mapping

from ..graph import ServiceDependencyGraph


def build_context(
    incident_id: str,
    alert: Mapping[str, Any],
    graph: ServiceDependencyGraph,
    blast_radius: Iterable[str],
    spans: Iterable[Mapping[str, Any]],
) -> Dict[str, Any]:
    """One slowest span per service in the blast radius, plus every trace edge between those services.

    shortcut: stands in for the signal compressor. It does no ranking and no token budgeting, and sends no logs or
    metrics. Replace it with the compressor's output when that exists; the context shape stays the same.
    """
    blast: List[str] = list(blast_radius)
    inside = set(blast)

    edges = sorted(
        (s, t) for s, t in graph.graph.edges() if s in inside and t in inside
    )
    trace_edges = [{"id": f"edge-{i}", "source": s, "target": t} for i, (s, t) in enumerate(edges, start=1)]

    slowest: Dict[str, Mapping[str, Any]] = {}
    for span in spans:
        service = span.get("service_name")
        if service in inside and span.get("span_id"):
            if service not in slowest or span.get("duration_ms", 0) > slowest[service].get("duration_ms", 0):
                slowest[service] = span
    evidence = [
        {
            "id": span["span_id"],
            "kind": "span",
            "service": service,
            "duration_ms": span.get("duration_ms"),
            "status_code": span.get("status_code"),
            "message": span.get("status_message"),
        }
        for service in blast
        if (span := slowest.get(service)) is not None
    ]

    return {
        "incident_id": incident_id,
        "alert": dict(alert),
        "blast_radius": blast,
        "trace_edges": trace_edges,
        "evidence": evidence,
    }
