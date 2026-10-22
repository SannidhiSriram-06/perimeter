"""Unit and integration tests for ServiceDependencyGraph and blast-radius BFS."""

import pytest
from src.graph.service_graph import ServiceDependencyGraph, BlastRadiusReport
from src.mock.fixtures import get_sample_trace_spans


def test_linear_cascade():
    """Verify linear cascade A -> B -> C returns ['A', 'B', 'C']."""
    graph = ServiceDependencyGraph()
    graph.add_trace_edge("A", "B")
    graph.add_trace_edge("B", "C")

    blast_radius = graph.get_blast_radius("A", max_depth=3)
    assert blast_radius == ["A", "B", "C"]


def test_disconnected_service_not_included():
    """Verify disconnected service D is not included in blast radius of A."""
    graph = ServiceDependencyGraph()
    graph.add_trace_edge("A", "B")
    graph.add_trace_edge("B", "C")
    graph.add_trace_edge("D", "E")  # Disconnected cluster

    blast_radius = graph.get_blast_radius("A", max_depth=3)
    assert "D" not in blast_radius
    assert "E" not in blast_radius
    assert blast_radius == ["A", "B", "C"]


def test_cycle_protection_no_infinite_loop():
    """Verify cyclic dependency A -> B -> A does not cause an infinite loop."""
    graph = ServiceDependencyGraph()
    graph.add_trace_edge("A", "B")
    graph.add_trace_edge("B", "A")

    blast_radius = graph.get_blast_radius("A", max_depth=10)
    assert blast_radius == ["A", "B"]


def test_multi_node_cycle():
    """Verify larger cycle A -> B -> C -> A terminates cleanly."""
    graph = ServiceDependencyGraph()
    graph.add_trace_edge("A", "B")
    graph.add_trace_edge("B", "C")
    graph.add_trace_edge("C", "A")

    blast_radius = graph.get_blast_radius("A", max_depth=5)
    assert blast_radius == ["A", "B", "C"]


def test_max_depth_truncation():
    """Verify BFS halts when max_depth is reached."""
    graph = ServiceDependencyGraph()
    # A -> B -> C -> D -> E
    graph.add_trace_edge("A", "B")
    graph.add_trace_edge("B", "C")
    graph.add_trace_edge("C", "D")
    graph.add_trace_edge("D", "E")

    # Depth 0: [A], Depth 1: [A, B], Depth 2: [A, B, C]
    assert graph.get_blast_radius("A", max_depth=0) == ["A"]
    assert graph.get_blast_radius("A", max_depth=1) == ["A", "B"]
    assert graph.get_blast_radius("A", max_depth=2) == ["A", "B", "C"]
    assert graph.get_blast_radius("A", max_depth=3) == ["A", "B", "C", "D"]


def test_nonexistent_service_returns_empty():
    """Verify querying an unknown origin service returns an empty list."""
    graph = ServiceDependencyGraph()
    graph.add_trace_edge("A", "B")

    assert graph.get_blast_radius("UNKNOWN_SERVICE") == []


def test_edge_call_count_accumulation():
    """Verify adding duplicate edges increments call_count."""
    graph = ServiceDependencyGraph()
    graph.add_trace_edge("frontend", "backend", call_count=3)
    graph.add_trace_edge("frontend", "backend", call_count=2)

    edge_data = graph.graph.get_edge_data("frontend", "backend")
    assert edge_data["call_count"] == 5


def test_blast_radius_report_pydantic():
    """Verify BlastRadiusReport Pydantic model serialization."""
    graph = ServiceDependencyGraph()
    graph.add_trace_edge("checkout-service", "payment-gateway")
    graph.add_trace_edge("payment-gateway", "bank-network")

    report = graph.get_blast_radius_report("checkout-service", max_depth=2)
    assert isinstance(report, BlastRadiusReport)
    assert report.origin_service == "checkout-service"
    assert report.max_depth == 2
    assert report.impacted_services == ["checkout-service", "payment-gateway", "bank-network"]
    assert report.total_impacted == 3


def test_load_from_mock_fixtures():
    """Verify loading real spans from fixtures builds the cascade correctly."""
    spans = get_sample_trace_spans()
    graph = ServiceDependencyGraph()
    graph.load_spans(spans)

    # From fixtures Trace 1: frontend-proxy -> checkout-service -> payment-gateway -> bank-network
    # And Trace 2: checkout-service -> inventory-service
    blast_radius = graph.get_blast_radius("frontend-proxy", max_depth=3)
    assert "frontend-proxy" in blast_radius
    assert "checkout-service" in blast_radius
    assert "payment-gateway" in blast_radius

    # recommendation-engine is an isolated trace (Trace 3)
    assert "recommendation-engine" not in blast_radius
