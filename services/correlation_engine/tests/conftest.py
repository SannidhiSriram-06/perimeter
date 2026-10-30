"""Shared fixtures: the contract's worked-example context and draft."""

from typing import Any, Dict

import pytest

KNOWN = [
    "frontend-proxy",
    "checkout-service",
    "payment-gateway",
    "bank-network",
    "inventory-service",
    "recommendation-engine",
]


@pytest.fixture
def context() -> Dict[str, Any]:
    return {
        "incident_id": "inc-0001",
        "alert": {
            "alertname": "CheckoutServiceHighLatency",
            "service": "checkout-service",
            "fired_at": "2026-10-12T16:00:00Z",
        },
        "blast_radius": ["checkout-service", "payment-gateway", "bank-network", "inventory-service"],
        "trace_edges": [
            {"id": "edge-1", "source": "checkout-service", "target": "payment-gateway"},
            {"id": "edge-2", "source": "payment-gateway", "target": "bank-network"},
            {"id": "edge-3", "source": "checkout-service", "target": "inventory-service"},
        ],
        "evidence": [
            {"id": "span-co-02", "kind": "span", "service": "checkout-service", "duration_ms": 4350.0, "status_code": 500, "message": "Payment processing failed in payment-gateway"},
            {"id": "span-pg-03", "kind": "span", "service": "payment-gateway", "duration_ms": 4200.0, "status_code": 500, "message": "Upstream bank network connection timed out"},
            {"id": "span-bn-04", "kind": "span", "service": "bank-network", "duration_ms": 4000.0, "status_code": 504, "message": "Gateway Timeout: socket read timeout after 4000ms"},
            {"id": "span-inv-06", "kind": "span", "service": "inventory-service", "duration_ms": 48.0, "status_code": 200, "message": "OK"},
            {"id": "log-1", "kind": "log", "service": "bank-network", "timestamp": "2026-10-12T16:00:02Z", "message": "socket read timeout"},
            {"id": "met-1", "kind": "metric", "service": "checkout-service", "name": "p95_latency_seconds", "value": 4.35, "timestamp": "2026-10-12T16:00:00Z"},
        ],
    }


@pytest.fixture
def draft() -> Dict[str, Any]:
    """The worked example from the contract."""
    return {
        "incident_id": "inc-0001",
        "hypothesis": {
            "root_cause_service": "bank-network",
            "cascade_path": ["checkout-service", "payment-gateway", "bank-network"],
            "summary": "bank-network timed out after 4000ms, which stalled payment-gateway and then checkout-service.",
            "confidence": "medium",
        },
        "claims": [
            {"id": "c1", "type": "causal_edge", "text": "payment-gateway calls bank-network", "evidence_ids": ["edge-2"], "source": "payment-gateway", "target": "bank-network"},
            {"id": "c2", "type": "status_code", "text": "bank-network returned 504", "evidence_ids": ["span-bn-04"], "service": "bank-network", "status_code": 504},
            {"id": "c3", "type": "latency", "text": "payment-gateway took 4200ms", "evidence_ids": ["span-pg-03"], "service": "payment-gateway", "value": 4200, "unit": "ms"},
        ],
        "postmortem": {
            "summary": "Checkout requests failed because the bank network connection timed out.",
            "impact": "Checkout requests returned HTTP 500 during the incident window.",
            "timeline": [
                {"time": "2026-10-12T16:00:00Z", "event": "Latency alert fired on checkout-service", "claim_ids": ["c3"]},
            ],
            "contributing_factors": ["No fallback or shorter timeout on the payment-gateway to bank-network call"],
            "next_steps": ["Add a circuit breaker on the bank-network call", "Alert on bank-network 504 rate"],
        },
    }
