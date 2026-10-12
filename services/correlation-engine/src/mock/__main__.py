"""CLI runner for mock OpenTelemetry telemetry and synthetic alert fixtures.

Notice regarding directory naming:
    The directory name `services/correlation-engine` contains a hyphen, which is not a valid
    Python identifier. Therefore, `python -m services.correlation-engine.src.mock` cannot be
    imported directly as a module name from the repository root.

Working Command to Run:
    cd services/correlation-engine && python -m src.mock

Alternative Direct Invocation:
    python services/correlation-engine/src/mock/__main__.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List

# Ensure parent search paths are added so execution succeeds from any directory
_current_dir = Path(__file__).resolve().parent
_src_dir = _current_dir.parent
_engine_dir = _src_dir.parent

if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))
if str(_src_dir) not in sys.path:
    sys.path.insert(0, str(_src_dir))

try:
    from src.mock.fixtures import (
        SYNTHETIC_TRACES,
        get_sample_alert_payload,
        get_sample_trace_spans,
    )
except ImportError:
    try:
        from mock.fixtures import (
            SYNTHETIC_TRACES,
            get_sample_alert_payload,
            get_sample_trace_spans,
        )
    except ImportError:
        from fixtures import (  # type: ignore
            SYNTHETIC_TRACES,
            get_sample_alert_payload,
            get_sample_trace_spans,
        )


def print_summary_statistics() -> None:
    """Print comprehensive summary statistics for the mock telemetry spans and alert fixtures."""
    spans: List[Dict[str, Any]] = get_sample_trace_spans()
    alert: Dict[str, Any] = get_sample_alert_payload()

    total_traces = len(SYNTHETIC_TRACES)
    total_spans = len(spans)
    unique_services = sorted({span["service_name"] for span in spans})
    error_spans = [span for span in spans if span["status_code"] >= 400]

    print("=" * 80)
    print("PROJECT PERIMETER -- MOCK TELEMETRY & SYNTHETIC TRACE GENERATOR")
    print("=" * 80)
    print(f"Total Synthetic Traces: {total_traces}")
    print(f"Total Spans:            {total_spans}")
    print(f"Unique Services ({len(unique_services)}):    {', '.join(unique_services)}")
    print(f"Error / Anomaly Spans:  {len(error_spans)} of {total_spans}")
    print("-" * 80)

    print("\n[TRACE BREAKDOWN]")
    for key, trace_info in SYNTHETIC_TRACES.items():
        t_spans = trace_info.get("spans", [])
        durations = [s["duration_ms"] for s in t_spans]
        max_duration = max(durations) if durations else 0.0
        print(f"* {trace_info['name']}")
        print(f"  Trace ID:     {trace_info['trace_id']}")
        print(f"  Description:  {trace_info['description']}")
        print(f"  Root Service: {trace_info['root_service']} | Spans: {len(t_spans)} | Max Latency: {max_duration:.1f}ms")
        print()

    print("-" * 80)
    print(f"{'SPAN ID':<16} {'PARENT ID':<16} {'SERVICE NAME':<24} {'DURATION':<12} {'STATUS':<8}")
    print("-" * 80)
    for span in spans:
        parent = span["parent_span_id"] or "ROOT"
        duration_str = f"{span['duration_ms']:.1f}ms"
        print(
            f"{span['span_id']:<16} {parent:<16} {span['service_name']:<24} {duration_str:<12} {span['status_code']:<8}"
        )
    print("-" * 80)

    print("\n[SERVICE METRIC SUMMARY]")
    for svc in unique_services:
        svc_spans = [s for s in spans if s["service_name"] == svc]
        avg_dur = sum(s["duration_ms"] for s in svc_spans) / len(svc_spans)
        status_codes = sorted({s["status_code"] for s in svc_spans})
        err_count = sum(1 for s in svc_spans if s["status_code"] >= 400)
        print(
            f"* {svc:<22} spans: {len(svc_spans):<3} errors: {err_count:<3} "
            f"avg_latency: {avg_dur:>7.1f}ms   status_codes: {status_codes}"
        )

    print("\n[PROMETHEUS ALERTMANAGER FIXTURE CHECK]")
    firing_alerts = alert.get("alerts", [])
    print(f"* Webhook Status:     {alert.get('status')}")
    print(f"* Receiver:           {alert.get('receiver')}")
    print(f"* Alert Count:        {len(firing_alerts)}")
    if firing_alerts:
        first_alert = firing_alerts[0]
        labels = first_alert.get("labels", {})
        annotations = first_alert.get("annotations", {})
        print(f"* Alert Name:         {labels.get('alertname')}")
        print(f"* Target Service:     {labels.get('service')}")
        print(f"* Severity:           {labels.get('severity')}")
        print(f"* Summary:            {annotations.get('summary')}")
        print(f"* Description:        {annotations.get('description')}")

    print("\n" + "=" * 80)
    print("[OK] Mock telemetry fixtures verified successfully.")
    print("=" * 80)


def main() -> int:
    """CLI entrypoint."""
    print_summary_statistics()
    return 0


if __name__ == "__main__":
    sys.exit(main())
