"""Mock OpenTelemetry telemetry and synthetic alert fixtures for Project Perimeter.

This package provides deterministic trace graphs and alert payloads for headless
testing of the correlation engine and blast-radius BFS algorithms without a live cluster.
"""

from .fixtures import (
    SYNTHETIC_TRACES,
    get_sample_alert_payload,
    get_sample_trace_spans,
)

__all__ = [
    "SYNTHETIC_TRACES",
    "get_sample_trace_spans",
    "get_sample_alert_payload",
]
