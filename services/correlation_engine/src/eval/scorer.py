"""Ground-truth evaluation scoring module for blast radius accuracy benchmarking.

Calculates precision, recall, and F1 score against controlled fault injection
experiments and verifies compliance with controlled test environments.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


def calculate_metrics(
    expected_services: Sequence[str],
    found_services: Sequence[str],
) -> Dict[str, Any]:
    """Calculate precision, recall, and F1 score between expected and found services.

    Args:
        expected_services: List of service names expected in the blast radius (ground truth).
        found_services: List of service names discovered by the correlation engine.

    Returns:
        Dict containing precision, recall, f1_score, true_positives,
        false_positives, and false_negatives.
    """
    expected_set = set(expected_services)
    found_set = set(found_services)

    true_positives = sorted(list(expected_set & found_set))
    false_positives = sorted(list(found_set - expected_set))
    false_negatives = sorted(list(expected_set - found_set))

    tp_count = len(true_positives)
    found_count = len(found_set)
    expected_count = len(expected_set)

    if found_count > 0:
        precision = tp_count / found_count
    else:
        precision = 1.0 if expected_count == 0 else 0.0

    if expected_count > 0:
        recall = tp_count / expected_count
    else:
        recall = 1.0 if found_count == 0 else 0.0

    if (precision + recall) > 0.0:
        f1_score = 2.0 * (precision * recall) / (precision + recall)
    else:
        f1_score = 0.0

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1_score, 4),
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
    }


def score_blast_radius(
    expected_services: Sequence[str],
    found_services: Sequence[str],
    injected_fault: Optional[Dict[str, Any]] = None,
    scenario_id: Optional[str] = None,
    threshold: float = 0.8,
) -> Dict[str, Any]:
    """Score a discovered blast radius against ground truth and produce a result report.

    Args:
        expected_services: Expected ground-truth services.
        found_services: Services returned by the correlation engine.
        injected_fault: Metadata about the injected chaos fault (action, service, parameters).
        scenario_id: Optional unique scenario identifier.
        threshold: Minimum precision and recall required to pass (default: 0.8).

    Returns:
        Structured evaluation result dictionary compliant with ground-truth JSON schema.
    """
    metrics = calculate_metrics(expected_services, found_services)
    passed = (metrics["precision"] >= threshold) and (metrics["recall"] >= threshold)

    fault_meta = injected_fault or {}
    environment = fault_meta.get("environment", "controlled_test_environment")

    return {
        "scenario_id": scenario_id or "unknown",
        "injected_fault": fault_meta,
        "environment": environment,
        "origin_service": fault_meta.get("target_service", ""),
        "expected_services": list(expected_services),
        "found_services": list(found_services),
        "precision": metrics["precision"],
        "recall": metrics["recall"],
        "f1_score": metrics["f1_score"],
        "true_positives": metrics["true_positives"],
        "false_positives": metrics["false_positives"],
        "false_negatives": metrics["false_negatives"],
        "passed": passed,
        "threshold": threshold,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def evaluate_scenario(
    scenario: Dict[str, Any],
    found_services: Sequence[str],
    threshold: float = 0.8,
) -> Dict[str, Any]:
    """Score a scenario dictionary against discovered services."""
    return score_blast_radius(
        expected_services=scenario.get("expected_services", []),
        found_services=found_services,
        injected_fault=scenario.get("injected_fault", {}),
        scenario_id=scenario.get("scenario_id", ""),
        threshold=threshold,
    )


def evaluate_all_fixtures(
    ground_truth_path: Optional[Path] = None,
    spans: Optional[List[Dict[str, Any]]] = None,
    threshold: float = 0.8,
) -> List[Dict[str, Any]]:
    """Run evaluation for all scenarios in a ground-truth JSON against mock spans.

    Args:
        ground_truth_path: Path to ground_truth.json fixture.
        spans: Telemetry spans list. Defaults to mock fixtures if None.
        threshold: Score threshold.

    Returns:
        List of scored ground-truth results.
    """
    from src.graph.service_graph import ServiceDependencyGraph
    from src.mock.fixtures import get_sample_trace_spans

    if ground_truth_path is None:
        # Default fixture location
        base_dir = Path(__file__).resolve().parents[4]
        ground_truth_path = (
            base_dir / "evaluation" / "benchmark" / "fixtures" / "ground_truth.json"
        )

    with open(ground_truth_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    scenarios = data.get("scenarios", [])

    graph = ServiceDependencyGraph()
    graph.load_spans(spans if spans is not None else get_sample_trace_spans())

    results: List[Dict[str, Any]] = []
    for sc in scenarios:
        origin = sc.get("origin_service", "")
        direction = sc.get("direction", "downstream")
        max_depth = sc.get("max_depth", 3)

        found = graph.get_blast_radius(
            origin_service=origin,
            max_depth=max_depth,
            direction=direction,
        )
        scored = evaluate_scenario(sc, found, threshold=threshold)
        results.append(scored)

    return results
