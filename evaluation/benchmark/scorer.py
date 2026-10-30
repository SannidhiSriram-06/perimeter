#!/usr/bin/env python3
"""Perimeter Accuracy Benchmark Engine.

Loads ground-truth chaos fault scenarios, runs correlation blast-radius discovery,
computes precision, recall, and F1 scores, enforces excluded-service boundaries,
and exports verified result JSON files.

Usage:
    python evaluation/benchmark/scorer.py
    python evaluation/benchmark/run_benchmark.py
"""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Sequence

# Add services/correlation_engine to python path for importing src
REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_DIR = REPO_ROOT / "services" / "correlation_engine"
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

# Import directly from the correlation engine; fail immediately if not found
from src.graph.service_graph import ServiceDependencyGraph  # noqa: E402
from src.mock.fixtures import get_sample_trace_spans  # noqa: E402

DEFAULT_GROUND_TRUTH_PATH = (
    REPO_ROOT / "evaluation" / "benchmark" / "fixtures" / "ground_truth.json"
)
DEFAULT_RESULTS_DIR = REPO_ROOT / "evaluation" / "benchmark" / "results"
DEFAULT_OUTPUT_PATH = DEFAULT_RESULTS_DIR / "benchmark_results.json"


def calculate_metrics(
    expected_services: Sequence[str],
    found_services: Sequence[str],
    excluded_services: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """Calculate precision, recall, and F1 score, verifying negative controls.

    Args:
        expected_services: List of service names expected in the blast radius (ground truth).
        found_services: List of service names discovered by the correlation engine.
        excluded_services: List of negative control service names that must not be in found_services.

    Returns:
        Dict containing precision, recall, f1_score, true_positives,
        false_positives, false_negatives, and excluded_violations.
    """
    expected_set = set(expected_services)
    found_set = set(found_services)
    excluded_set = set(excluded_services) if excluded_services else set()

    true_positives = sorted(expected_set & found_set)
    false_positives = sorted(found_set - expected_set)
    false_negatives = sorted(expected_set - found_set)
    excluded_violations = sorted(found_set & excluded_set)

    tp_count = len(true_positives)
    found_count = len(found_set)
    expected_count = len(expected_set)

    if found_count > 0:
        precision = tp_count / found_count
    elif expected_count == 0:
        precision = 1.0
    else:
        precision = 0.0

    if expected_count > 0:
        recall = tp_count / expected_count
    elif found_count == 0:
        recall = 1.0
    else:
        recall = 0.0

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
        "excluded_violations": excluded_violations,
    }


def score_blast_radius(
    expected_services: Sequence[str],
    found_services: Sequence[str],
    excluded_services: Optional[Sequence[str]] = None,
    injected_fault: Optional[Dict[str, Any]] = None,
    scenario_id: Optional[str] = None,
    threshold: float = 0.8,
) -> Dict[str, Any]:
    """Score a discovered blast radius against ground truth and produce a result report.

    Args:
        expected_services: Expected ground-truth services.
        found_services: Services returned by the correlation engine.
        excluded_services: Negative controls that must not be in found_services.
        injected_fault: Metadata about the injected chaos fault (action, service, parameters).
        scenario_id: Optional unique scenario identifier.
        threshold: Minimum precision and recall required to pass (default: 0.8).

    Returns:
        Structured evaluation result dictionary compliant with ground-truth JSON schema.
    """
    metrics = calculate_metrics(
        expected_services, found_services, excluded_services=excluded_services
    )
    has_no_violations = len(metrics["excluded_violations"]) == 0
    passed = (
        (metrics["precision"] >= threshold)
        and (metrics["recall"] >= threshold)
        and has_no_violations
    )

    fault_meta = injected_fault or {}
    environment = fault_meta.get("environment", "controlled_test_environment")

    return {
        "scenario_id": scenario_id or "unknown",
        "injected_fault": fault_meta,
        "environment": environment,
        "origin_service": fault_meta.get("target_service", ""),
        "expected_services": list(expected_services),
        "excluded_services": list(excluded_services or []),
        "found_services": list(found_services),
        "precision": metrics["precision"],
        "recall": metrics["recall"],
        "f1_score": metrics["f1_score"],
        "true_positives": metrics["true_positives"],
        "false_positives": metrics["false_positives"],
        "false_negatives": metrics["false_negatives"],
        "excluded_violations": metrics["excluded_violations"],
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
        excluded_services=scenario.get("excluded_services", []),
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
    target_path = (ground_truth_path or DEFAULT_GROUND_TRUTH_PATH).resolve()
    if not target_path.is_file():
        raise FileNotFoundError(f"Ground-truth file not found: {target_path}")

    with open(target_path, "r", encoding="utf-8") as f:
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


def run_benchmark(
    ground_truth_path: Path,
    output_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Execute evaluation benchmark across all ground-truth scenarios."""
    print("=" * 72)
    print("PROJECT PERIMETER — ACCURACY & CORRELATION EVALUATION BENCHMARK")
    print("=" * 72)
    print("ENVIRONMENT: Controlled Synthetic Test Environment (Minikube / Mock)")
    print("STATUS     : NOT A PRODUCTION ENVIRONMENT\n")

    resolved_gt_path = ground_truth_path.resolve()
    if not resolved_gt_path.is_file():
        raise FileNotFoundError(f"Ground-truth file not found at: {resolved_gt_path}")

    with open(resolved_gt_path, "r", encoding="utf-8") as f:
        gt_data = json.load(f)

    scenarios = gt_data.get("scenarios", [])
    print(f"Loaded {len(scenarios)} fault scenario(s) from {resolved_gt_path.name}\n")

    graph = ServiceDependencyGraph()
    graph.load_spans(get_sample_trace_spans())

    scenario_results: List[Dict[str, Any]] = []
    total_passed = 0

    print(f"{'Scenario ID':<38} | {'P':<6} | {'R':<6} | {'F1':<6} | {'Result'}")
    print("-" * 72)

    for sc in scenarios:
        sc_id = sc["scenario_id"]
        origin = sc["origin_service"]
        direction = sc.get("direction", "downstream")
        max_depth = sc.get("max_depth", 3)
        expected = sc["expected_services"]
        excluded = sc.get("excluded_services", [])

        found = graph.get_blast_radius(
            origin_service=origin, max_depth=max_depth, direction=direction
        )

        result = score_blast_radius(
            expected_services=expected,
            found_services=found,
            excluded_services=excluded,
            injected_fault=sc.get("injected_fault", {}),
            scenario_id=sc_id,
        )
        scenario_results.append(result)

        if result["passed"]:
            total_passed += 1
            status_str = "PASS [OK]"
        else:
            status_str = "FAIL [X]"

        print(
            f"{sc_id:<38} | "
            f"{result['precision']:<6.2f} | "
            f"{result['recall']:<6.2f} | "
            f"{result['f1_score']:<6.2f} | "
            f"{status_str}"
        )

    all_matched = total_passed == len(scenarios)
    pass_rate = round(total_passed / len(scenarios), 4) if scenarios else 0.0

    summary = {
        "benchmark_run_at": datetime.now(timezone.utc).isoformat(),
        "environment": "controlled_test_environment",
        "notice": "All metrics measured within an isolated synthetic/staging testbed, not production.",
        "scenarios_total": len(scenarios),
        "scenarios_passed": total_passed,
        "scenarios_failed": len(scenarios) - total_passed,
        "all_scenarios_matched": all_matched,
        "pass_rate": pass_rate,
        "results": scenario_results,
    }

    print("-" * 72)
    print(
        f"Summary: {total_passed}/{len(scenarios)} scenarios passed "
        f"({'all scenarios match ground truth' if all_matched else 'partial match'})"
    )

    target_out_path = output_path or DEFAULT_OUTPUT_PATH
    resolved_out_path = target_out_path.resolve()
    resolved_out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(resolved_out_path, "w", encoding="utf-8") as out_f:
        json.dump(summary, out_f, indent=2)
    print(f"Saved scored result file to: {resolved_out_path}\n")

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Perimeter Accuracy Benchmark Scorer")
    parser.add_argument(
        "--ground-truth",
        type=Path,
        default=DEFAULT_GROUND_TRUTH_PATH,
        help="Path to ground truth JSON file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path to output scored JSON result file",
    )
    args = parser.parse_args()
    run_benchmark(args.ground_truth, args.output)


if __name__ == "__main__":
    main()
