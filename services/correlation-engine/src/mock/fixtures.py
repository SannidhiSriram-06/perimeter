"""Synthetic OpenTelemetry trace fixtures and Prometheus alert payloads for Project Perimeter.

This module provides headless mock telemetry fixtures for testing the blast-radius
Breadth-First Search (BFS) engine, signal compression, and incident postmortem drafting
without requiring a live Kubernetes cluster.

Working Command to Run:
    cd services/correlation-engine && python -m src.mock
"""

from typing import Any, Dict, List

# -----------------------------------------------------------------------------
# Synthetic Trace Graph Definitions
# -----------------------------------------------------------------------------
# Trace 1: Checkout Failure Cascade
#   frontend-proxy -> checkout-service -> payment-gateway (500 / 4200ms) -> bank-network (timeout)
# Trace 2: Secondary dependency
#   checkout-service -> inventory-service (200 / healthy)
# Trace 3: Unrelated concurrent noise
#   recommendation-engine (503 error, disconnected from checkout)
# -----------------------------------------------------------------------------

SYNTHETIC_TRACES: Dict[str, Dict[str, Any]] = {
    "trace_checkout_failure_cascade": {
        "trace_id": "trace-checkout-cascade-001",
        "name": "Trace 1: Checkout Failure Cascade",
        "description": "frontend-proxy -> checkout-service -> payment-gateway (500 / 4200ms) -> bank-network (timeout)",
        "root_service": "frontend-proxy",
        "status": "error",
        "spans": [
            {
                "trace_id": "trace-checkout-cascade-001",
                "span_id": "span-fe-01",
                "parent_span_id": None,
                "service_name": "frontend-proxy",
                "name": "HTTP POST /api/checkout",
                "duration_ms": 4500.0,
                "status_code": 500,
                "attributes": {
                    "http.method": "POST",
                    "http.target": "/api/checkout",
                    "http.status_code": 500,
                    "net.peer.name": "checkout-service",
                    "error": True,
                },
                "status_message": "Downstream HTTP 500 error from checkout-service",
            },
            {
                "trace_id": "trace-checkout-cascade-001",
                "span_id": "span-co-02",
                "parent_span_id": "span-fe-01",
                "service_name": "checkout-service",
                "name": "CheckoutService.ProcessOrder",
                "duration_ms": 4350.0,
                "status_code": 500,
                "attributes": {
                    "rpc.service": "CheckoutService",
                    "rpc.method": "ProcessOrder",
                    "http.status_code": 500,
                    "net.peer.name": "payment-gateway",
                    "error": True,
                },
                "status_message": "Payment processing failed in payment-gateway",
            },
            {
                "trace_id": "trace-checkout-cascade-001",
                "span_id": "span-pg-03",
                "parent_span_id": "span-co-02",
                "service_name": "payment-gateway",
                "name": "PaymentGateway.ChargeCard",
                "duration_ms": 4200.0,
                "status_code": 500,
                "attributes": {
                    "rpc.service": "PaymentGateway",
                    "rpc.method": "ChargeCard",
                    "http.status_code": 500,
                    "net.peer.name": "bank-network",
                    "latency_ms": 4200.0,
                    "error": True,
                },
                "status_message": "Upstream bank network connection timed out",
            },
            {
                "trace_id": "trace-checkout-cascade-001",
                "span_id": "span-bn-04",
                "parent_span_id": "span-pg-03",
                "service_name": "bank-network",
                "name": "ExternalBankAPI.AuthorizeTransaction",
                "duration_ms": 4000.0,
                "status_code": 504,
                "attributes": {
                    "http.url": "https://core-switch.bank-network.internal/v2/auth",
                    "http.status_code": 504,
                    "error": True,
                    "timeout": True,
                },
                "status_message": "Gateway Timeout: socket read timeout after 4000ms",
            },
        ],
    },
    "trace_secondary_dependency": {
        "trace_id": "trace-inventory-check-002",
        "name": "Trace 2: Secondary dependency",
        "description": "checkout-service -> inventory-service (200 / healthy)",
        "root_service": "checkout-service",
        "status": "ok",
        "spans": [
            {
                "trace_id": "trace-inventory-check-002",
                "span_id": "span-co-05",
                "parent_span_id": None,
                "service_name": "checkout-service",
                "name": "CheckoutService.ReserveInventory",
                "duration_ms": 65.0,
                "status_code": 200,
                "attributes": {
                    "rpc.service": "CheckoutService",
                    "rpc.method": "ReserveInventory",
                    "http.status_code": 200,
                    "net.peer.name": "inventory-service",
                    "error": False,
                },
                "status_message": "OK",
            },
            {
                "trace_id": "trace-inventory-check-002",
                "span_id": "span-inv-06",
                "parent_span_id": "span-co-05",
                "service_name": "inventory-service",
                "name": "InventoryService.CheckStock",
                "duration_ms": 48.0,
                "status_code": 200,
                "attributes": {
                    "rpc.service": "InventoryService",
                    "rpc.method": "CheckStock",
                    "http.status_code": 200,
                    "error": False,
                },
                "status_message": "OK",
            },
        ],
    },
    "trace_unrelated_noise": {
        "trace_id": "trace-noise-rec-003",
        "name": "Trace 3: Unrelated concurrent noise",
        "description": "recommendation-engine (503 error, disconnected from checkout)",
        "root_service": "recommendation-engine",
        "status": "error",
        "spans": [
            {
                "trace_id": "trace-noise-rec-003",
                "span_id": "span-rec-07",
                "parent_span_id": None,
                "service_name": "recommendation-engine",
                "name": "RecommendationEngine.GetTrendingItems",
                "duration_ms": 850.0,
                "status_code": 503,
                "attributes": {
                    "rpc.service": "RecommendationEngine",
                    "rpc.method": "GetTrendingItems",
                    "http.status_code": 503,
                    "error": True,
                },
                "status_message": "Service Unavailable: model inference worker pool exhausted",
            },
        ],
    },
}


def get_sample_trace_spans() -> List[Dict[str, Any]]:
    """Return the list of all synthetic OpenTelemetry spans across mock traces.

    Each span dictionary guaranteed to contain:
        - span_id (str): Unique span identifier.
        - parent_span_id (Optional[str]): Parent span ID or None if root span.
        - service_name (str): Name of the service generating the telemetry span.
        - duration_ms (float): Span latency in milliseconds.
        - status_code (int): HTTP status code (200, 500, 504, 503, etc.).

    Returns:
        List[Dict[str, Any]]: Complete list of mock telemetry spans.
    """
    all_spans: List[Dict[str, Any]] = []
    for trace_data in SYNTHETIC_TRACES.values():
        all_spans.extend(trace_data.get("spans", []))
    return all_spans


def get_sample_alert_payload() -> Dict[str, Any]:
    """Return a realistic Prometheus Alertmanager webhook JSON payload.

    The alert fires on `checkout-service` P95 latency > 2s, simulating the trigger
    event (T+00s) that kicks off Project Perimeter's 90-second incident correlation
    lifecycle and blast-radius BFS engine.

    Returns:
        Dict[str, Any]: Complete Prometheus Alertmanager v4 webhook payload.
    """
    return {
        "version": "4",
        "groupKey": '{}:{alertname="CheckoutServiceHighLatency",service="checkout-service"}',
        "truncatedAlerts": 0,
        "status": "firing",
        "receiver": "perimeter-incident-webhook",
        "groupLabels": {
            "alertname": "CheckoutServiceHighLatency",
            "service": "checkout-service",
        },
        "commonLabels": {
            "alertname": "CheckoutServiceHighLatency",
            "service": "checkout-service",
            "severity": "critical",
            "tier": "tier-1",
            "environment": "production",
            "cluster": "prod-k8s-cluster",
            "namespace": "perimeter-core",
        },
        "commonAnnotations": {
            "summary": "P95 latency degradation on checkout-service exceeds 2s threshold",
            "description": "checkout-service P95 latency is currently 4.35s, breaching the SLA threshold of 2.0s over the past 5 minutes.",
            "runbook_url": "https://wiki.perimeter.internal/runbooks/checkout-service-latency",
            "dashboard_url": "http://grafana.monitoring.svc:3000/d/checkout-health",
        },
        "externalURL": "http://alertmanager.monitoring.svc:9093",
        "alerts": [
            {
                "status": "firing",
                "labels": {
                    "alertname": "CheckoutServiceHighLatency",
                    "service": "checkout-service",
                    "severity": "critical",
                    "tier": "tier-1",
                    "instance": "checkout-service-8f4b596d-c2x9q:8080",
                    "environment": "production",
                    "cluster": "prod-k8s-cluster",
                    "namespace": "perimeter-core",
                },
                "annotations": {
                    "summary": "P95 latency degradation on checkout-service exceeds 2s threshold",
                    "description": "checkout-service P95 latency is currently 4.35s, breaching the SLA threshold of 2.0s over the past 5 minutes.",
                    "observed_value": "4.35s",
                    "threshold_value": "2.0s",
                },
                "startsAt": "2026-10-12T16:00:00.000Z",
                "endsAt": "0001-01-01T00:00:00Z",
                "generatorURL": "http://prometheus.monitoring.svc:9090/graph?g0.expr=histogram_quantile%280.95%2C+sum%28rate%28http_request_duration_seconds_bucket%7Bservice%3D%22checkout-service%22%7D%5B5m%5D%29%29+by+%28le%29%29+%3E+2&g0.tab=1",
                "fingerprint": "8d3e2a1b9c4f7062",
            }
        ],
    }
