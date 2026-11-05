"""Signal compressor: ranking order, token budget, stable ids, blast-radius filtering."""

import json

import pytest

from src.compressor import DEFAULT_TOKEN_BUDGET, compress, estimate_tokens
from src.graph import ServiceDependencyGraph
from src.mock.fixtures import get_sample_logs, get_sample_metrics, get_sample_trace_spans

ALERT = {"alertname": "CheckoutServiceHighLatency", "service": "checkout-service", "fired_at": "2026-10-12T16:00:00Z"}
SPANS = get_sample_trace_spans()
LOGS = get_sample_logs()
METRICS = get_sample_metrics()


@pytest.fixture
def graph() -> ServiceDependencyGraph:
    g = ServiceDependencyGraph()
    g.load_spans(SPANS)
    return g


def run(graph, budget=DEFAULT_TOKEN_BUDGET, **kw):
    blast = kw.pop("blast", graph.get_blast_radius("checkout-service", direction="both"))
    return compress("inc-1", ALERT, graph, blast, kw.pop("spans", SPANS), kw.pop("logs", LOGS), kw.pop("metrics", METRICS), budget)


def ids(context):
    return [e["id"] for e in context["evidence"]]


def test_output_has_the_context_shape(graph) -> None:
    ctx = run(graph)
    assert set(ctx) == {"incident_id", "alert", "blast_radius", "trace_edges", "evidence"}
    assert ctx["incident_id"] == "inc-1"
    assert {e["kind"] for e in ctx["evidence"]} == {"span", "log", "metric"}
    assert {"id": "edge-1"}.items() <= ctx["trace_edges"][0].items()


def test_evidence_ids_are_unchanged(graph) -> None:
    ctx = run(graph)
    source_ids = {s["span_id"] for s in SPANS} | {x["id"] for x in LOGS} | {x["id"] for x in METRICS}
    assert set(ids(ctx)) <= source_ids
    assert "span-bn-04" in ids(ctx)
    assert "log-bn-01" in ids(ctx)


def test_services_outside_the_blast_radius_never_appear(graph) -> None:
    ctx = run(graph)
    assert all(e["service"] != "recommendation-engine" for e in ctx["evidence"])
    assert "log-rec-01" not in ids(ctx)
    assert "met-rec-01" not in ids(ctx)
    narrow = run(graph, blast=["bank-network", "payment-gateway"])
    assert {e["service"] for e in narrow["evidence"]} <= {"bank-network", "payment-gateway"}
    assert narrow["blast_radius"] == ["bank-network", "payment-gateway"]
    assert all({t["source"], t["target"]} <= {"bank-network", "payment-gateway"} for t in narrow["trace_edges"])


def test_failing_evidence_ranks_above_healthy_evidence(graph) -> None:
    order = ids(run(graph))
    assert order.index("span-bn-04") < order.index("span-inv-06")
    assert order.index("log-bn-01") < order.index("log-inv-01")
    assert order.index("met-bn-01") < order.index("met-inv-01")


def test_closer_service_wins_a_tie_on_anomaly(graph) -> None:
    same = [
        {"span_id": "far", "service_name": "bank-network", "duration_ms": 100.0, "status_code": 200},
        {"span_id": "near", "service_name": "checkout-service", "duration_ms": 100.0, "status_code": 200},
    ]
    order = ids(run(graph, spans=same, logs=[], metrics=[]))
    assert order == ["near", "far"]


def test_ranking_is_deterministic(graph) -> None:
    first = run(graph)
    second = run(graph)
    assert first == second
    shuffled = run(graph, spans=list(reversed(SPANS)), logs=list(reversed(LOGS)))
    assert ids(first) == ids(shuffled)


@pytest.mark.parametrize("budget", [500, 600, 800, 1000, 1500, 3000])
def test_budget_is_never_exceeded(graph, budget) -> None:
    ctx = run(graph, budget=budget)
    assert estimate_tokens(json.dumps(ctx, sort_keys=True, indent=2)) <= budget


def test_a_smaller_budget_keeps_the_best_evidence_first(graph) -> None:
    full = ids(run(graph, budget=3000))
    small = ids(run(graph, budget=900))
    assert 0 < len(small) < len(full)
    assert set(small) <= set(full)
    assert "span-bn-04" in small


def test_budget_too_small_for_the_fixed_part_raises(graph) -> None:
    with pytest.raises(ValueError, match="too small"):
        run(graph, budget=20)


def test_large_input_is_trimmed_to_the_budget(graph) -> None:
    many = [{"id": f"log-{i}", "service": "bank-network", "level": "error", "timestamp": "2026-10-12T16:00:00Z", "message": "x" * 150} for i in range(500)]
    ctx = run(graph, budget=1500, logs=many)
    assert estimate_tokens(json.dumps(ctx, sort_keys=True, indent=2)) <= 1500
    assert 0 < len(ctx["evidence"]) < 500


def test_skips_items_without_ids_and_truncates_long_messages(graph) -> None:
    logs = [{"service": "bank-network", "message": "no id"}, {"id": "l1", "service": "bank-network", "level": "error", "message": "y" * 1000}]
    ctx = run(graph, spans=[], logs=logs, metrics=[])
    assert ids(ctx) == ["l1"]
    assert len(ctx["evidence"][0]["message"]) <= 200


def test_log_levels_and_keywords_drive_the_score(graph) -> None:
    logs = [
        {"id": "info", "service": "bank-network", "level": "info", "message": "all fine"},
        {"id": "kw", "service": "bank-network", "level": "info", "message": "request timed out"},
        {"id": "warn", "service": "bank-network", "level": "warn", "message": "slow"},
        {"id": "err", "service": "bank-network", "level": "error", "message": "boom"},
    ]
    assert ids(run(graph, spans=[], logs=logs, metrics=[])) == ["err", "kw", "warn", "info"]


def test_metric_scores_use_the_baseline_when_present(graph) -> None:
    metrics = [
        {"id": "flat", "service": "bank-network", "name": "m", "value": 1, "baseline": 1},
        {"id": "spike", "service": "bank-network", "name": "m", "value": 9, "baseline": 1},
        {"id": "nobase", "service": "bank-network", "name": "m", "value": 3},
        {"id": "zero", "service": "bank-network", "name": "m", "value": 3, "baseline": 0},
    ]
    assert ids(run(graph, spans=[], logs=[], metrics=metrics))[0] == "spike"
    assert ids(run(graph, spans=[], logs=[], metrics=metrics))[-1] == "flat"


def test_unknown_alert_service_still_ranks_by_anomaly(graph) -> None:
    ctx = compress("i", {"service": "ghost"}, graph, ["bank-network"], SPANS, LOGS, METRICS, 3000)
    assert ctx["evidence"]
    ctx2 = compress("i", {}, graph, ["bank-network"], SPANS, LOGS, METRICS, 3000)
    assert ids(ctx) == ids(ctx2)


def test_span_status_buckets(graph) -> None:
    spans = [
        {"span_id": "ok", "service_name": "bank-network", "duration_ms": 10.0, "status_code": 200},
        {"span_id": "c4", "service_name": "bank-network", "duration_ms": 10.0, "status_code": 404},
        {"span_id": "c5", "service_name": "bank-network", "duration_ms": 10.0, "status_code": 500},
        {"span_id": "none", "service_name": "bank-network"},
    ]
    assert ids(run(graph, spans=spans, logs=[], metrics=[]))[:3] == ["c5", "c4", "ok"]


# --- live alerts: mock logs and metrics are re-timed to the alert (found in the end-to-end run) ----------------


def test_mock_logs_and_metrics_are_rebased_to_the_alert_time() -> None:
    logs = get_sample_logs("2026-11-05T18:30:00Z")
    metrics = get_sample_metrics("2026-11-05T18:30:00Z")
    assert {x["id"] for x in logs} == {x["id"] for x in get_sample_logs()}
    bn = next(x for x in logs if x["id"] == "log-bn-01")
    assert bn["timestamp"] == "2026-11-05T18:30:02Z"  # 2 s after the alert, as in the fixture
    assert all(m["timestamp"] == "2026-11-05T18:30:00Z" for m in metrics)


def test_rebase_accepts_offsets_and_ignores_bad_input() -> None:
    assert get_sample_logs("2026-10-12T18:00:00+02:00") == get_sample_logs()
    assert get_sample_logs("not a time") == get_sample_logs()
    assert get_sample_logs("2026-10-12T16:00:00") == get_sample_logs()
    assert get_sample_logs(None)[0]["timestamp"] == "2026-10-12T16:00:02Z"


def test_rebased_timestamps_fall_inside_the_validator_window(graph) -> None:
    fired = "2026-11-05T18:30:00Z"
    ctx = compress("i", {**ALERT, "fired_at": fired}, graph, ["bank-network"], SPANS, get_sample_logs(fired), get_sample_metrics(fired), 3000)
    stamps = [e["timestamp"] for e in ctx["evidence"] if "timestamp" in e]
    assert stamps
    assert all(t.startswith("2026-11-05T18:") for t in stamps)
