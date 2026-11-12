"""Unit tests for Perimeter test microservices without requiring a live Kubernetes cluster."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

# Ensure services/test-services is on sys.path
SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

import app  # noqa: E402
import loadgen  # noqa: E402

# Set up a shared InMemorySpanExporter for testing
TEST_EXPORTER = InMemorySpanExporter()
TEST_PROVIDER = TracerProvider()
TEST_PROVIDER.add_span_processor(SimpleSpanProcessor(TEST_EXPORTER))
app.tracer = TEST_PROVIDER.get_tracer("perimeter.test_services", "1.0.0")


@pytest.fixture(autouse=True)
def clear_spans():
    """Clears in-memory spans before each test."""
    TEST_EXPORTER.clear()
    yield
    TEST_EXPORTER.clear()


@pytest.fixture
def client():
    return TestClient(app.app)


def test_health_endpoint(client: TestClient):
    """Verifies that /health returns 200 OK and environment labels."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["environment"] == "controlled-test"


def test_bank_network_authorize_success(client: TestClient):
    """Verifies bank-network nominal 200 authorization and span attributes."""
    with patch.object(app, "INDUCED_DELAY_MS", 0.0), patch.object(app, "INDUCED_STATUS_CODE", 0):
        resp = client.post("/authorize", json={"amount": 100.0})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "authorized"
        assert "auth_code" in data

    spans = TEST_EXPORTER.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.name == "ExternalBankAPI.AuthorizeTransaction"
    assert span.attributes["http.status_code"] == 200
    assert span.attributes["error"] is False


def test_bank_network_induced_status_504(client: TestClient):
    """Verifies bank-network simulated 504 timeout error."""
    with patch.object(app, "INDUCED_STATUS_CODE", 504), patch.object(app, "INDUCED_DELAY_MS", 0.0):
        resp = client.post("/authorize", json={"amount": 100.0})
        assert resp.status_code == 504
        data = resp.json()
        assert "error" in data

    spans = TEST_EXPORTER.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.name == "ExternalBankAPI.AuthorizeTransaction"
    assert span.attributes["http.status_code"] == 504
    assert span.attributes["error"] is True
    assert span.attributes["timeout"] is True


def test_inventory_reserve(client: TestClient):
    """Verifies inventory reservation endpoint and span attributes."""
    resp = client.post("/reserve", json={"item_id": "test-item"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "reserved"
    assert data["stock"] == 100

    spans = TEST_EXPORTER.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.name == "InventoryService.CheckStock"
    assert span.attributes["http.status_code"] == 200
    assert span.attributes["error"] is False


def test_recommendation_engine_status(client: TestClient):
    """Verifies recommendation-engine isolated 503 default error response."""
    with patch.object(app, "INDUCED_STATUS_CODE", 503):
        resp = client.get("/recommendations")
        assert resp.status_code == 503

    spans = TEST_EXPORTER.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.name == "RecommendationEngine.GetTrendingItems"
    assert span.attributes["http.status_code"] == 503
    assert span.attributes["error"] is True

    # Test induced 200
    TEST_EXPORTER.clear()
    with patch.object(app, "INDUCED_STATUS_CODE", 200):
        resp = client.get("/recommendations")
        assert resp.status_code == 200
        assert "items" in resp.json()


def test_payment_gateway_charge_success(client: TestClient):
    """Verifies payment-gateway delegating to bank-network with 200 OK."""
    mock_resp = httpx.Response(200, json={"status": "authorized", "auth_code": "AUTH-123"})
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock, return_value=mock_resp):
        resp = client.post("/charge", json={"amount": 50.0})
        assert resp.status_code == 200

    spans = TEST_EXPORTER.get_finished_spans()
    charge_spans = [s for s in spans if s.name == "PaymentGateway.ChargeCard"]
    assert len(charge_spans) == 1
    assert charge_spans[0].attributes["rpc.method"] == "ChargeCard"
    assert charge_spans[0].attributes["error"] is False


def test_payment_gateway_timeout(client: TestClient):
    """Verifies payment-gateway handling timeout from bank-network (returns 504)."""
    with patch.object(
        httpx.AsyncClient,
        "post",
        new_callable=AsyncMock,
        side_effect=httpx.TimeoutException("Read timeout"),
    ):
        resp = client.post("/charge", json={"amount": 50.0})
        assert resp.status_code == 504

    spans = TEST_EXPORTER.get_finished_spans()
    charge_spans = [s for s in spans if s.name == "PaymentGateway.ChargeCard"]
    assert len(charge_spans) == 1
    assert charge_spans[0].attributes["http.status_code"] == 504
    assert charge_spans[0].attributes["error"] is True


def test_checkout_service_cascade(client: TestClient):
    """Verifies checkout-service calling inventory and payment-gateway."""
    async def mock_post(url, *args, **kwargs):
        if "reserve" in str(url):
            return httpx.Response(200, json={"status": "reserved"})
        if "charge" in str(url):
            return httpx.Response(200, json={"status": "authorized"})
        return httpx.Response(404)

    with patch.object(httpx.AsyncClient, "post", side_effect=mock_post):
        resp = client.post("/checkout", json={"order_id": "test-order"})
        assert resp.status_code == 200

    spans = TEST_EXPORTER.get_finished_spans()
    span_names = {s.name for s in spans}
    assert "CheckoutService.ReserveInventory" in span_names
    assert "CheckoutService.ProcessOrder" in span_names


def test_frontend_proxy_to_checkout(client: TestClient):
    """Verifies frontend-proxy ingress routing to checkout-service."""
    mock_resp = httpx.Response(200, json={"order_id": "ord-1", "status": "processed"})
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock, return_value=mock_resp):
        resp = client.post("/api/checkout", json={"order_id": "ord-1"})
        assert resp.status_code == 200

    spans = TEST_EXPORTER.get_finished_spans()
    fe_spans = [s for s in spans if s.name == "HTTP POST /api/checkout"]
    assert len(fe_spans) == 1
    assert fe_spans[0].attributes["net.peer.name"] == "checkout-service"


def test_loadgen_run_bounded():
    """Verifies that loadgen runs for the requested count and handles responses."""
    mock_resp = httpx.Response(200, json={"status": "ok"})

    with patch.object(httpx.Client, "post", return_value=mock_resp):
        count = loadgen.run_loadgen(
            url="http://mock-frontend:8080/api/checkout",
            interval=0.01,
            max_requests=3,
        )
        assert count == 3


def test_loadgen_validate_url():
    """Verifies that URL validation prevents SSRF by checking schemes and host presence."""
    assert loadgen.validate_url("http://frontend-proxy:8080/api/checkout") == "http://frontend-proxy:8080/api/checkout"
    assert loadgen.validate_url("https://secure-proxy/api/checkout") == "https://secure-proxy/api/checkout"

    with pytest.raises(ValueError, match="Invalid URL scheme"):
        loadgen.validate_url("ftp://malicious-host/api/checkout")

    with pytest.raises(ValueError, match="Invalid URL scheme"):
        loadgen.validate_url("file:///etc/passwd")

    with pytest.raises(ValueError, match="Host and network location must not be empty"):
        loadgen.validate_url("http://")

