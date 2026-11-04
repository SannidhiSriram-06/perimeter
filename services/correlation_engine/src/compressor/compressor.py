"""Turns a blast radius plus raw telemetry into the context object the model sees (docs/llm-output-schema.md).

Every candidate (span, log, metric) inside the blast radius gets two scores in [0, 1]:

* anomaly: how abnormal it looks (error status or level, high latency, a metric above its baseline);
* proximity: how close its service is to the alerting service on the call graph (1 / (1 + hops), edges read both ways).

rank = ANOMALY_WEIGHT * anomaly + PROXIMITY_WEIGHT * proximity. Evidence is added best-first until the token budget
is used up. Evidence ids (span_id, log id, metric id) are copied unchanged because the fact-checking validator looks
them up. Services outside the blast radius never appear.
"""

import json
import math
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

import networkx as nx

from ..graph import ServiceDependencyGraph

DEFAULT_TOKEN_BUDGET = 3000  # Groq's free tier allows about 8K tokens per minute, and the prompt and answer need room too.
ANOMALY_WEIGHT = 0.7
PROXIMITY_WEIGHT = 0.3
MAX_MESSAGE_CHARS = 200

_LOG_LEVEL_SCORE = {"fatal": 1.0, "critical": 1.0, "error": 1.0, "warn": 0.5, "warning": 0.5}
_ERROR_WORDS = ("error", "fail", "timeout", "timed out", "refused", "exhausted", "unavailable")


def estimate_tokens(text: str) -> int:
    """Approximate tokens as characters / 4. This is a rule of thumb, not a real tokenizer count."""
    return math.ceil(len(text) / 4)


def _render(context: Mapping[str, Any]) -> str:
    # Same serialisation the prompt builder uses, so the estimate measures what is actually sent.
    return json.dumps(context, sort_keys=True, indent=2)


def compress(
    incident_id: str,
    alert: Mapping[str, Any],
    graph: ServiceDependencyGraph,
    blast_radius: Iterable[str],
    spans: Iterable[Mapping[str, Any]],
    logs: Iterable[Mapping[str, Any]] = (),
    metrics: Iterable[Mapping[str, Any]] = (),
    token_budget: int = DEFAULT_TOKEN_BUDGET,
) -> Dict[str, Any]:
    """Return a context object whose estimated size never exceeds `token_budget`.

    The incident id, alert, blast radius and trace edges are always kept (the validator needs them), so a budget too
    small for those raises ValueError. Evidence that does not fit is dropped, lowest rank first.
    """
    blast: List[str] = list(blast_radius)
    inside = set(blast)
    edges = sorted((s, t) for s, t in graph.graph.edges() if s in inside and t in inside)
    context: Dict[str, Any] = {
        "incident_id": incident_id,
        "alert": dict(alert),
        "blast_radius": blast,
        "trace_edges": [{"id": f"edge-{i}", "source": s, "target": t} for i, (s, t) in enumerate(edges, start=1)],
        "evidence": [],
    }
    if estimate_tokens(_render(context)) > token_budget:
        raise ValueError(f"token_budget {token_budget} is too small for the blast radius and trace edges alone")

    proximity = _proximity(graph, alert.get("service"))
    candidates = _candidates(inside, spans, logs, metrics)
    ranked = sorted(
        ((_rank(item, score, proximity), item["id"], item) for score, item in candidates),
        key=lambda r: (-r[0], r[1]),
    )

    chosen: List[Dict[str, Any]] = []
    for _, _, item in ranked:
        trial = {**context, "evidence": chosen + [item]}
        if estimate_tokens(_render(trial)) <= token_budget:
            chosen.append(item)
    context["evidence"] = chosen
    return context


def _proximity(graph: ServiceDependencyGraph, origin: Optional[str]) -> Dict[str, float]:
    if origin is None or origin not in graph.graph:
        return {}
    hops = nx.single_source_shortest_path_length(graph.graph.to_undirected(as_view=True), origin)
    return {service: 1.0 / (1 + n) for service, n in hops.items()}


def _rank(item: Mapping[str, Any], anomaly: float, proximity: Mapping[str, float]) -> float:
    return ANOMALY_WEIGHT * anomaly + PROXIMITY_WEIGHT * proximity.get(item["service"], 0.0)


def _candidates(
    inside: set,
    spans: Iterable[Mapping[str, Any]],
    logs: Iterable[Mapping[str, Any]],
    metrics: Iterable[Mapping[str, Any]],
) -> List[Tuple[float, Dict[str, Any]]]:
    span_list = [s for s in spans if s.get("service_name") in inside and s.get("span_id")]
    longest = max((float(s.get("duration_ms") or 0) for s in span_list), default=0.0)
    out = [_span_candidate(s, longest) for s in span_list]
    out += [_log_candidate(log) for log in logs if log.get("service") in inside and log.get("id")]
    out += [_metric_candidate(m) for m in metrics if m.get("service") in inside and m.get("id")]
    return out


def _error_score(status: int) -> float:
    if status >= 500:
        return 1.0
    return 0.6 if status >= 400 else 0.0


def _span_candidate(span: Mapping[str, Any], longest: float) -> Tuple[float, Dict[str, Any]]:
    duration = float(span.get("duration_ms") or 0)
    slow = duration / longest if longest > 0 else 0.0
    item = {
        "id": span["span_id"],
        "kind": "span",
        "service": span["service_name"],
        "duration_ms": span.get("duration_ms"),
        "status_code": span.get("status_code"),
        "message": _short(span.get("status_message")),
    }
    return 0.6 * _error_score(span.get("status_code") or 0) + 0.4 * slow, item


def _log_score(log: Mapping[str, Any]) -> float:
    level = _LOG_LEVEL_SCORE.get(str(log.get("level") or "").lower(), 0.1)
    message = str(log.get("message") or "").lower()
    if level < 0.5 and any(w in message for w in _ERROR_WORDS):
        return 0.7
    return level


def _log_candidate(log: Mapping[str, Any]) -> Tuple[float, Dict[str, Any]]:
    item = {
        "id": log["id"],
        "kind": "log",
        "service": log["service"],
        "timestamp": log.get("timestamp"),
        "message": _short(log.get("message") or ""),
    }
    return _log_score(log), item


def _metric_candidate(metric: Mapping[str, Any]) -> Tuple[float, Dict[str, Any]]:
    item = {
        "id": metric["id"],
        "kind": "metric",
        "service": metric["service"],
        "name": metric.get("name"),
        "value": metric.get("value"),
        "timestamp": metric.get("timestamp"),
    }
    return _metric_anomaly(metric), item


def _metric_anomaly(metric: Mapping[str, Any]) -> float:
    """0 at baseline, 1 at five times the baseline or more. With no usable baseline the metric is a neutral 0.5."""
    value, baseline = metric.get("value"), metric.get("baseline")
    if isinstance(value, (int, float)) and isinstance(baseline, (int, float)) and baseline > 0:
        return min(1.0, max(0.0, (value / baseline - 1.0) / 4.0))
    return 0.5


def _short(text: Any) -> Optional[str]:
    if text is None:
        return None
    text = str(text)
    return text if len(text) <= MAX_MESSAGE_CHARS else text[: MAX_MESSAGE_CHARS - 1] + "…"
