"""Tests for the HTTP interface (POST /correlate, GET /health)."""

from fastapi.testclient import TestClient

from src.api import app

client = TestClient(app)


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_correlate_uses_mock_spans_when_none_given() -> None:
    body = client.post("/correlate", json={"service": "checkout-service"}).json()
    assert body["origin_service"] == "checkout-service"
    assert body["impacted_services"] == [
        "checkout-service",
        "payment-gateway",
        "inventory-service",
        "bank-network",
    ]
    assert body["total_impacted"] == 4


def test_correlate_builds_graph_from_posted_spans() -> None:
    spans = [
        {"span_id": "a", "parent_span_id": None, "service_name": "web"},
        {"span_id": "b", "parent_span_id": "a", "service_name": "api"},
    ]
    body = client.post("/correlate", json={"service": "web", "spans": spans}).json()
    assert body["impacted_services"] == ["web", "api"]


def test_correlate_unknown_service_is_empty() -> None:
    body = client.post("/correlate", json={"service": "nope"}).json()
    assert body["impacted_services"] == []


def test_correlate_rejects_bad_input() -> None:
    assert client.post("/correlate", json={"service": ""}).status_code == 422
    assert client.post("/correlate", json={"service": "a", "max_depth": -1}).status_code == 422
    assert client.post("/correlate", json={}).status_code == 422
