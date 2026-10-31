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


# --- POST /draft ---------------------------------------------------------------------------------------


def _draft_client(response):
    from src.api import app, llm_client
    from src.llm import ScriptedClient

    scripted = ScriptedClient(response)
    app.dependency_overrides[llm_client] = lambda: scripted
    return scripted


def _good_draft(system: str, user: str) -> str:
    import json

    context = json.loads(user.split("<context>")[1].split("</context>")[0])
    return json.dumps(
        {
            "incident_id": context["incident_id"],
            "hypothesis": {
                "root_cause_service": "bank-network",
                "cascade_path": ["checkout-service", "payment-gateway", "bank-network"],
                "summary": "bank-network timed out, which stalled payment-gateway and checkout-service.",
                "confidence": "medium",
            },
            "claims": [
                {"id": "c1", "type": "status_code", "text": "bank-network returned 504", "evidence_ids": ["span-bn-04"],
                 "service": "bank-network", "status_code": 504, "source": None, "target": None, "value": None, "unit": None, "timestamp": None},
            ],
            "postmortem": {"summary": "s", "impact": "i", "timeline": [], "contributing_factors": [], "next_steps": []},
        }
    )


def test_draft_endpoint_returns_a_checked_draft() -> None:
    from src.api import app

    scripted = _draft_client(_good_draft)
    try:
        body = client.post(
            "/draft", json={"incident_id": "inc-1", "alertname": "HighLatency", "service": "checkout-service"}
        ).json()
    finally:
        app.dependency_overrides.clear()
    assert body["status"] == "ok"
    assert body["draft"]["hypothesis"]["root_cause_service"] == "bank-network"
    assert body["validation"]["claims"][0]["supported"] is True
    # the model saw the incident's blast radius (callers and callees) and none of the unrelated services
    context = scripted.calls[0][1]
    assert "bank-network" in context and "frontend-proxy" in context
    assert "recommendation-engine" not in context


def test_draft_endpoint_reports_a_model_failure_without_erroring() -> None:
    from src.api import app
    from src.llm import LLMError

    def fail(system: str, user: str) -> str:
        raise LLMError("no credentials")

    _draft_client(fail)
    try:
        response = client.post("/draft", json={"incident_id": "inc-1", "service": "checkout-service"})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["status"] == "llm_error"
    assert response.json()["draft"] is None
