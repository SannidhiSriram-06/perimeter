"""Blast radius direction: callees (downstream), callers (upstream) or both."""

import pytest

from src.api import app
from src.graph import ServiceDependencyGraph
from src.mock.fixtures import get_sample_trace_spans
from fastapi.testclient import TestClient


def mock_graph() -> ServiceDependencyGraph:
    graph = ServiceDependencyGraph()
    graph.load_spans(get_sample_trace_spans())
    return graph


def test_upstream_from_a_leaf_finds_the_callers() -> None:
    # bank-network is a leaf: downstream finds nothing, upstream finds everyone who suffers from it.
    graph = mock_graph()
    assert graph.get_blast_radius("bank-network") == ["bank-network"]
    assert graph.get_blast_radius("bank-network", direction="upstream") == [
        "bank-network",
        "payment-gateway",
        "checkout-service",
        "frontend-proxy",
    ]


def test_both_directions_covers_callers_and_callees() -> None:
    radius = mock_graph().get_blast_radius("checkout-service", direction="both")
    assert set(radius) == {
        "checkout-service",
        "payment-gateway",
        "inventory-service",
        "bank-network",
        "frontend-proxy",
    }
    assert "recommendation-engine" not in radius


def test_upstream_respects_depth_and_cycles() -> None:
    graph = ServiceDependencyGraph()
    graph.add_trace_edge("a", "b")
    graph.add_trace_edge("b", "c")
    graph.add_trace_edge("c", "a")
    assert graph.get_blast_radius("a", max_depth=1, direction="upstream") == ["a", "c"]
    assert sorted(graph.get_blast_radius("a", direction="both")) == ["a", "b", "c"]


def test_report_records_direction() -> None:
    assert mock_graph().get_blast_radius_report("bank-network", direction="upstream").direction == "upstream"


def test_bad_direction_is_rejected() -> None:
    with pytest.raises(ValueError):
        mock_graph().get_blast_radius("checkout-service", direction="sideways")  # type: ignore[arg-type]
    client = TestClient(app)
    assert client.post("/correlate", json={"service": "a", "direction": "sideways"}).status_code == 422


def test_api_passes_direction_through() -> None:
    body = TestClient(app).post("/correlate", json={"service": "bank-network", "direction": "upstream"}).json()
    assert body["impacted_services"][-1] == "frontend-proxy"
    assert body["direction"] == "upstream"
