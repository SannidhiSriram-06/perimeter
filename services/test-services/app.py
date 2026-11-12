"""Instrumented microservices for Project Perimeter synthetic chaos evaluation.

Emits OpenTelemetry spans matching the topology and call graph in
docs/evaluation/Chaos_Scenarios.md and services/correlation-engine/src/mock/fixtures.py:
  frontend-proxy -> checkout-service -> payment-gateway -> bank-network
  checkout-service -> inventory-service
  recommendation-engine (isolated background service)
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    SimpleSpanProcessor,
    SpanExporter,
)
from opentelemetry.trace import Status, StatusCode
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

logger = logging.getLogger("test-services")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

SERVICE_NAME = os.getenv("SERVICE_NAME", "frontend-proxy")
OTEL_EXPORTER_OTLP_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
CHECKOUT_SERVICE_URL = os.getenv("CHECKOUT_SERVICE_URL", "http://checkout-service:8080/checkout")
INVENTORY_SERVICE_URL = os.getenv("INVENTORY_SERVICE_URL", "http://inventory-service:8080/reserve")
PAYMENT_GATEWAY_URL = os.getenv("PAYMENT_GATEWAY_URL", "http://payment-gateway:8080/charge")
BANK_NETWORK_URL = os.getenv("BANK_NETWORK_URL", "http://bank-network:8080/authorize")
RECOMMENDATION_ENGINE_URL = os.getenv(
    "RECOMMENDATION_ENGINE_URL", "http://recommendation-engine:8080/recommendations"
)
HTTP_TIMEOUT_SECONDS = float(os.getenv("HTTP_TIMEOUT_SECONDS", "5.0"))
INDUCED_DELAY_MS = float(os.getenv("INDUCED_DELAY_MS", "0.0"))
INDUCED_STATUS_CODE = int(os.getenv("INDUCED_STATUS_CODE", "0"))

propagator = TraceContextTextMapPropagator()


def configure_tracer(
    service_name: str,
    exporter: Optional[SpanExporter] = None,
    otlp_endpoint: Optional[str] = None,
) -> TracerProvider:
    """Configures the OpenTelemetry TracerProvider with appropriate resource attributes."""
    resource = Resource.create(
        {
            "service.name": service_name,
            "service.namespace": "perimeter-test",
            "perimeter.environment": "controlled-test",
        }
    )
    provider = TracerProvider(resource=resource)

    if exporter is not None:
        provider.add_span_processor(SimpleSpanProcessor(exporter))
    elif otlp_endpoint:
        otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
        provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

    trace.set_tracer_provider(provider)
    return provider


# Configure tracer on startup
tracer_provider = configure_tracer(SERVICE_NAME, otlp_endpoint=OTEL_EXPORTER_OTLP_ENDPOINT)
tracer = trace.get_tracer("perimeter.test_services", "1.0.0")

app = FastAPI(
    title=f"Perimeter Test Service: {SERVICE_NAME}",
    description="Controlled test microservice for chaos fault injection and trace correlation.",
    version="1.0.0",
)


@app.get("/health")
def health() -> Dict[str, str]:
    """Health check endpoint for liveness and readiness probes."""
    return {
        "status": "ok",
        "service": SERVICE_NAME,
        "environment": "controlled-test",
    }


# ---------------------------------------------------------------------------
# frontend-proxy endpoints
# ---------------------------------------------------------------------------
@app.post("/api/checkout")
async def frontend_checkout(request: Request) -> Response:
    """Ingress entrypoint on frontend-proxy: routes request to checkout-service."""
    incoming_headers = dict(request.headers)
    ctx = propagator.extract(carrier=incoming_headers)

    start_time = time.time()
    with tracer.start_as_current_span(
        "HTTP POST /api/checkout",
        context=ctx,
        kind=trace.SpanKind.SERVER,
    ) as span:
        span.set_attribute("http.method", "POST")
        span.set_attribute("http.target", "/api/checkout")
        span.set_attribute("net.peer.name", "checkout-service")

        body: Dict[str, Any] = {}
        try:
            body = await request.json()
        except Exception:
            body = {"order_id": "ord-test-001", "amount": 99.50}

        out_headers: Dict[str, str] = {"Content-Type": "application/json"}
        propagator.inject(out_headers)

        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
                resp = await client.post(CHECKOUT_SERVICE_URL, json=body, headers=out_headers)
                span.set_attribute("http.status_code", resp.status_code)
                duration_ms = (time.time() - start_time) * 1000.0
                span.set_attribute("duration_ms", duration_ms)

                if resp.status_code >= 500:
                    span.set_status(
                        Status(
                            StatusCode.ERROR,
                            f"Downstream HTTP {resp.status_code} error from checkout-service",
                        )
                    )
                    span.set_attribute("error", True)
                    return JSONResponse(
                        status_code=resp.status_code,
                        content={
                            "error": "Downstream checkout failure",
                            "downstream_status": resp.status_code,
                            "service": SERVICE_NAME,
                        },
                    )
                return Response(
                    content=resp.content,
                    status_code=resp.status_code,
                    media_type="application/json",
                )
        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000.0
            span.set_attribute("duration_ms", duration_ms)
            span.set_attribute("http.status_code", 500)
            span.set_attribute("error", True)
            span.set_status(Status(StatusCode.ERROR, f"Error calling checkout-service: {exc}"))
            return JSONResponse(
                status_code=500,
                content={
                    "error": f"Failed to connect to checkout-service: {exc}",
                    "service": SERVICE_NAME,
                },
            )


# ---------------------------------------------------------------------------
# checkout-service endpoints
# ---------------------------------------------------------------------------
@app.post("/checkout")
async def checkout_process(request: Request) -> Response:
    """Orchestrates order creation, inventory reservation, and payment authorization."""
    incoming_headers = dict(request.headers)
    ctx = propagator.extract(carrier=incoming_headers)

    start_time = time.time()
    with tracer.start_as_current_span(
        "CheckoutService.ProcessOrder",
        context=ctx,
        kind=trace.SpanKind.SERVER,
    ) as span:
        span.set_attribute("rpc.service", "CheckoutService")
        span.set_attribute("rpc.method", "ProcessOrder")
        span.set_attribute("net.peer.name", "payment-gateway")

        body: Dict[str, Any] = {}
        try:
            body = await request.json()
        except Exception:
            body = {"order_id": "ord-test-001", "amount": 99.50}

        # Step 1: Reserve inventory (secondary healthy dependency)
        inv_headers: Dict[str, str] = {"Content-Type": "application/json"}
        with tracer.start_as_current_span(
            "CheckoutService.ReserveInventory",
            kind=trace.SpanKind.CLIENT,
        ) as inv_span:
            inv_span.set_attribute("rpc.service", "CheckoutService")
            inv_span.set_attribute("rpc.method", "ReserveInventory")
            inv_span.set_attribute("net.peer.name", "inventory-service")
            propagator.inject(inv_headers)

            try:
                async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
                    inv_resp = await client.post(
                        INVENTORY_SERVICE_URL,
                        json={"item_id": "item-001", "qty": 1},
                        headers=inv_headers,
                    )
                    inv_span.set_attribute("http.status_code", inv_resp.status_code)
                    if inv_resp.status_code >= 400:
                        inv_span.set_status(
                            Status(StatusCode.ERROR, "Inventory reservation failed")
                        )
                        inv_span.set_attribute("error", True)
                    else:
                        inv_span.set_status(Status(StatusCode.OK))
                        inv_span.set_attribute("error", False)
            except Exception as exc:
                inv_span.set_status(
                    Status(StatusCode.ERROR, f"Inventory reservation unreachable: {exc}")
                )
                inv_span.set_attribute("error", True)
                inv_span.set_attribute("http.status_code", 500)

        # Step 2: Call payment-gateway
        pay_headers: Dict[str, str] = {"Content-Type": "application/json"}
        propagator.inject(pay_headers)

        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
                pay_resp = await client.post(PAYMENT_GATEWAY_URL, json=body, headers=pay_headers)
                span.set_attribute("http.status_code", pay_resp.status_code)
                duration_ms = (time.time() - start_time) * 1000.0
                span.set_attribute("duration_ms", duration_ms)

                if pay_resp.status_code >= 500:
                    span.set_status(
                        Status(
                            StatusCode.ERROR,
                            "Payment processing failed in payment-gateway",
                        )
                    )
                    span.set_attribute("error", True)
                    return JSONResponse(
                        status_code=pay_resp.status_code,
                        content={
                            "error": "Payment processing failed in payment-gateway",
                            "downstream_status": pay_resp.status_code,
                            "service": SERVICE_NAME,
                        },
                    )

                span.set_status(Status(StatusCode.OK))
                span.set_attribute("error", False)
                return Response(
                    content=pay_resp.content,
                    status_code=pay_resp.status_code,
                    media_type="application/json",
                )
        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000.0
            span.set_attribute("duration_ms", duration_ms)
            span.set_attribute("http.status_code", 500)
            span.set_attribute("error", True)
            span.set_status(Status(StatusCode.ERROR, f"Payment gateway call failed: {exc}"))
            return JSONResponse(
                status_code=500,
                content={
                    "error": f"Failed to connect to payment-gateway: {exc}",
                    "service": SERVICE_NAME,
                },
            )


# ---------------------------------------------------------------------------
# payment-gateway endpoints
# ---------------------------------------------------------------------------
@app.post("/charge")
async def payment_charge(request: Request) -> Response:
    """Authorizes credit card transactions by delegating to bank-network."""
    incoming_headers = dict(request.headers)
    ctx = propagator.extract(carrier=incoming_headers)

    start_time = time.time()
    with tracer.start_as_current_span(
        "PaymentGateway.ChargeCard",
        context=ctx,
        kind=trace.SpanKind.SERVER,
    ) as span:
        span.set_attribute("rpc.service", "PaymentGateway")
        span.set_attribute("rpc.method", "ChargeCard")
        span.set_attribute("net.peer.name", "bank-network")

        body: Dict[str, Any] = {}
        try:
            body = await request.json()
        except Exception:
            body = {"amount": 99.50}

        out_headers: Dict[str, str] = {"Content-Type": "application/json"}
        propagator.inject(out_headers)

        try:
            # Short timeout to simulate gateway timeout if bank-network is lagged
            async with httpx.AsyncClient(timeout=3.0) as client:
                bank_resp = await client.post(BANK_NETWORK_URL, json=body, headers=out_headers)
                duration_ms = (time.time() - start_time) * 1000.0
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("http.status_code", bank_resp.status_code)

                if bank_resp.status_code >= 500:
                    span.set_status(
                        Status(StatusCode.ERROR, "Upstream bank network connection timed out")
                    )
                    span.set_attribute("error", True)
                    return JSONResponse(
                        status_code=500,
                        content={
                            "error": "Upstream bank network returned error",
                            "bank_status": bank_resp.status_code,
                            "service": SERVICE_NAME,
                        },
                    )

                span.set_status(Status(StatusCode.OK))
                span.set_attribute("error", False)
                return Response(
                    content=bank_resp.content,
                    status_code=bank_resp.status_code,
                    media_type="application/json",
                )
        except httpx.TimeoutException:
            duration_ms = (time.time() - start_time) * 1000.0
            span.set_attribute("duration_ms", duration_ms)
            span.set_attribute("http.status_code", 504)
            span.set_attribute("error", True)
            span.set_status(
                Status(StatusCode.ERROR, "Upstream bank network connection timed out (504)")
            )
            return JSONResponse(
                status_code=504,
                content={
                    "error": "Gateway Timeout: Upstream bank network connection timed out",
                    "service": SERVICE_NAME,
                },
            )
        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000.0
            span.set_attribute("duration_ms", duration_ms)
            span.set_attribute("http.status_code", 500)
            span.set_attribute("error", True)
            span.set_status(Status(StatusCode.ERROR, f"Bank network connection error: {exc}"))
            return JSONResponse(
                status_code=500,
                content={
                    "error": f"Failed to connect to bank-network: {exc}",
                    "service": SERVICE_NAME,
                },
            )


# ---------------------------------------------------------------------------
# bank-network endpoints (leaf external simulator)
# ---------------------------------------------------------------------------
@app.post("/authorize")
async def bank_authorize(request: Request) -> Response:
    """Simulates external core banking switch authorization."""
    incoming_headers = dict(request.headers)
    ctx = propagator.extract(carrier=incoming_headers)

    start_time = time.time()
    with tracer.start_as_current_span(
        "ExternalBankAPI.AuthorizeTransaction",
        context=ctx,
        kind=trace.SpanKind.SERVER,
    ) as span:
        span.set_attribute("http.url", "https://core-switch.bank-network.internal/v2/auth")

        # Simulate induced latency (e.g. from network chaos or env configuration)
        delay = INDUCED_DELAY_MS / 1000.0
        if delay > 0:
            await asyncio.sleep(delay)

        target_status = INDUCED_STATUS_CODE if INDUCED_STATUS_CODE > 0 else 200
        duration_ms = (time.time() - start_time) * 1000.0
        span.set_attribute("duration_ms", duration_ms)
        span.set_attribute("http.status_code", target_status)

        if target_status >= 500:
            span.set_attribute("error", True)
            if target_status == 504:
                span.set_attribute("timeout", True)
                span.set_status(
                    Status(
                        StatusCode.ERROR,
                        f"Gateway Timeout: socket read timeout after {duration_ms:.0f}ms",
                    )
                )
            else:
                span.set_status(
                    Status(StatusCode.ERROR, f"Bank internal error: status {target_status}")
                )
            return JSONResponse(
                status_code=target_status,
                content={
                    "error": f"Bank network error: status {target_status}",
                    "service": SERVICE_NAME,
                },
            )

        span.set_status(Status(StatusCode.OK))
        span.set_attribute("error", False)
        return JSONResponse(
            status_code=200,
            content={
                "status": "authorized",
                "auth_code": "AUTH-BNK-99214",
                "service": SERVICE_NAME,
            },
        )


# ---------------------------------------------------------------------------
# inventory-service endpoints
# ---------------------------------------------------------------------------
@app.post("/reserve")
async def inventory_reserve(request: Request) -> Response:
    """Simulates stock verification and reservation."""
    incoming_headers = dict(request.headers)
    ctx = propagator.extract(carrier=incoming_headers)

    start_time = time.time()
    with tracer.start_as_current_span(
        "InventoryService.CheckStock",
        context=ctx,
        kind=trace.SpanKind.SERVER,
    ) as span:
        span.set_attribute("rpc.service", "InventoryService")
        span.set_attribute("rpc.method", "CheckStock")
        span.set_attribute("http.status_code", 200)
        span.set_attribute("error", False)

        # Realistic nominal latency ~48ms
        await asyncio.sleep(0.048)
        duration_ms = (time.time() - start_time) * 1000.0
        span.set_attribute("duration_ms", duration_ms)
        span.set_status(Status(StatusCode.OK))

        return JSONResponse(
            status_code=200,
            content={
                "status": "reserved",
                "stock": 100,
                "service": SERVICE_NAME,
            },
        )


# ---------------------------------------------------------------------------
# recommendation-engine endpoints (isolated background service)
# ---------------------------------------------------------------------------
@app.api_route("/recommendations", methods=["GET", "POST"])
async def get_recommendations(request: Request) -> Response:
    """Simulates recommendation service (isolated concurrent noise in chaos tests)."""
    incoming_headers = dict(request.headers)
    ctx = propagator.extract(carrier=incoming_headers)

    start_time = time.time()
    with tracer.start_as_current_span(
        "RecommendationEngine.GetTrendingItems",
        context=ctx,
        kind=trace.SpanKind.SERVER,
    ) as span:
        span.set_attribute("rpc.service", "RecommendationEngine")
        span.set_attribute("rpc.method", "GetTrendingItems")

        target_status = INDUCED_STATUS_CODE if INDUCED_STATUS_CODE > 0 else 503
        span.set_attribute("http.status_code", target_status)

        duration_ms = (time.time() - start_time) * 1000.0
        span.set_attribute("duration_ms", duration_ms)

        if target_status >= 400:
            span.set_attribute("error", True)
            span.set_status(
                Status(
                    StatusCode.ERROR,
                    f"Recommendation engine unavailable or error: {target_status}",
                )
            )
            return JSONResponse(
                status_code=target_status,
                content={
                    "error": "Recommendation engine service unavailable",
                    "status_code": target_status,
                    "service": SERVICE_NAME,
                },
            )

        span.set_attribute("error", False)
        span.set_status(Status(StatusCode.OK))
        return JSONResponse(
            status_code=200,
            content={
                "items": ["rec-prod-101", "rec-prod-102"],
                "service": SERVICE_NAME,
            },
        )
