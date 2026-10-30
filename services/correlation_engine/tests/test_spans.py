"""Realistic and hostile span input for ServiceDependencyGraph.load_spans, plus size checks."""

import time

from src.graph import ServiceDependencyGraph


def span(span_id, parent, service, **extra):
    return {"span_id": span_id, "parent_span_id": parent, "service_name": service, **extra}


def edges(graph: ServiceDependencyGraph):
    return {(u, v): d["call_count"] for u, v, d in graph.graph.edges(data=True)}


def test_otel_style_span_with_extra_fields_is_used() -> None:
    graph = ServiceDependencyGraph()
    graph.load_spans(
        [
            span("1", None, "web", attributes={"http.method": "GET"}, duration_ms=12.5, status_code=200),
            span("2", "1", "api", attributes={"rpc.system": "grpc"}, duration_ms=8.0, status_code=500),
        ]
    )
    assert edges(graph) == {("web", "api"): 1}


def test_repeated_calls_add_up_on_one_edge() -> None:
    graph = ServiceDependencyGraph()
    graph.load_spans([span("1", None, "web")] + [span(f"c{i}", "1", "api") for i in range(5)])
    assert edges(graph) == {("web", "api"): 5}


def test_calls_inside_one_service_make_no_edge() -> None:
    graph = ServiceDependencyGraph()
    graph.load_spans([span("1", None, "web"), span("2", "1", "web")])
    assert edges(graph) == {}


def test_orphan_parent_and_missing_fields_are_ignored_not_fatal() -> None:
    graph = ServiceDependencyGraph()
    graph.load_spans(
        [
            span("1", "does-not-exist", "web"),  # parent was dropped or sampled out
            {"span_id": "2", "parent_span_id": "1"},  # no service_name
            {"parent_span_id": "1", "service_name": "api"},  # no span_id of its own: still a valid child
            {"span_id": "4", "parent_span_id": "", "service_name": "x"},  # empty parent means root
            {},
        ]
    )
    assert edges(graph) == {("web", "api"): 1}


def test_span_that_is_its_own_parent_is_harmless() -> None:
    graph = ServiceDependencyGraph()
    graph.load_spans([span("1", "1", "web")])
    assert edges(graph) == {}


def test_duplicate_span_ids_keep_the_last_span() -> None:
    graph = ServiceDependencyGraph()
    graph.load_spans([span("1", None, "old"), span("1", None, "new"), span("2", "1", "api")])
    assert edges(graph) == {("new", "api"): 1}


def test_long_chain_respects_depth_and_stays_fast() -> None:
    graph = ServiceDependencyGraph()
    for i in range(10_000):
        graph.add_trace_edge(f"s{i}", f"s{i + 1}")
    start = time.perf_counter()
    assert len(graph.get_blast_radius("s0", max_depth=20)) == 21
    assert len(graph.get_blast_radius("s0", max_depth=10_000, direction="downstream")) == 10_001
    assert time.perf_counter() - start < 1.0


def test_wide_fan_out_and_big_cycle() -> None:
    graph = ServiceDependencyGraph()
    for i in range(5_000):
        graph.add_trace_edge("hub", f"leaf{i}")
    assert len(graph.get_blast_radius("hub", max_depth=1)) == 5_001
    assert len(graph.get_blast_radius("leaf0", max_depth=1, direction="upstream")) == 2

    ring = ServiceDependencyGraph()
    for i in range(2_000):
        ring.add_trace_edge(f"r{i}", f"r{(i + 1) % 2_000}")
    assert len(ring.get_blast_radius("r0", max_depth=5_000)) == 2_000


def test_isolated_service_without_edges_is_retained_as_node() -> None:
    """Isolated services in trace spans without caller/callee edges are retained as nodes."""
    graph = ServiceDependencyGraph()
    graph.load_spans([span("1", None, "recommendation-engine")])
    assert edges(graph) == {}
    assert "recommendation-engine" in graph.graph.nodes
    assert graph.get_blast_radius("recommendation-engine") == ["recommendation-engine"]

