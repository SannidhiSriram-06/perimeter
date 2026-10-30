#!/usr/bin/env python3
"""Perimeter Accuracy Benchmark Engine.

Loads ground-truth chaos fault scenarios, runs correlation blast-radius discovery,
computes precision, recall, and F1 scores, and exports verified result JSON files.

Usage:
    python evaluation/benchmark/scorer.py
    python evaluation/benchmark/scorer.py --output evaluation/benchmark/results.json
"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Sequence

# Add services/correlation_engine to python path for importing src
REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_DIR = REPO_ROOT / "services" / "correlation_engine"
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

try:
    from src.eval.scorer import calculate_metrics, score_blast_radius
    from src.graph.service_graph import ServiceDependencyGraph
    from src.mock.fixtures import get_sample_trace_spans
except ImportError:
    # Standalone fallback if package structure differs
    def calculate_metrics(
        expected_services: Sequence[str],
        found_services: Sequence[str],
    ) -> Dict[str, Any]:
        expected_set = set(expected_services)
        found_set = set(found_services)
        tp = sorted(list(expected_set & found_set))
        fp = sorted(list(found_set - expected_set))
        fn = sorted(list(expected_set - found_set))
        p = len(tp) / len(found_set) if found_set else (1.0 if not expected_set else 0.0)
        r = len(tp) / len(expected_set) if expected_set else (1.0 if not found_set else 0.0)
        f1 = 2.0 * p * r / (p + r) if (p + r) > 0 else 0.0
        return {
            "precision": round(p, 4),
            "recall": round(r, 4),
            "f1_score": round(f1, 4),
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
        }

    def score_blast_radius(
        expected_services: Sequence[str],
        found_services: Sequence[str],
        injected_fault: Any = None,
        scenario_id: Any = None,
        threshold: float = 0.8,
    ) -> Dict[str, Any]:
        metrics = calculate_metrics(expected_services, found_services)
        return {
            "scenario_id": scenario_id or "unknown",
            "injected_fault": injected_fault or {},
            "environment": (injected_fault or {}).get("environment", "controlled_test_environment"),
            "expected_services": list(expected_services),
            "found_services": list(found_services),
            "precision": metrics["precision"],
            "recall": metrics["recall"],
            "f1_score": metrics["f1_score"],
            "true_positives": metrics["true_positives"],
            "false_positives": metrics["false_positives"],
            "false_negatives": metrics["false_negatives"],
            "passed": metrics["precision"] >= threshold and metrics["recall"] >= threshold,
            "threshold": threshold,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


def run_benchmark(
    ground_truth_path: Path,
    output_path: Path = None,
    engine_url: str = None,
) -> Dict[str, Any]:
    """Execute evaluation benchmark across all ground-truth scenarios."""
    print("=" * 72)
    print("PROJECT PERIMETER — ACCURACY & CORRELATION EVALUATION BENCHMARK")
    print("=" * 72)
    print("ENVIRONMENT: Controlled Synthetic Test Environment (Minikube / Mock)")
    print("STATUS     : NOT A PRODUCTION ENVIRONMENT\n")

    if not ground_truth_path.exists():
        raise FileNotFoundError(f"Ground-truth file not found at: {ground_truth_path}")

    with open(ground_truth_path, "r", encoding="utf-8") as f:
        gt_data = json.load(f)

    scenarios = gt_data.get("scenarios", [])
    print(f"Loaded {len(scenarios)} fault scenario(s) from {ground_truth_path.name}\n")

    # Initialize graph
    graph = None
    if not engine_url:
        graph = ServiceDependencyGraph()
        graph.load_spans(get_sample_trace_spans())

    scenario_results: List[Dict[str, Any]] = []
    total_passed = 0

    print(f"{'Scenario ID':<36} | {'P':<6} | {'R':<6} | {'F1':<6} | {'Result'}")
    print("-" * 72)

    for sc in scenarios:
        sc_id = sc["scenario_id"]
        origin = sc["origin_service"]
        direction = sc.get("direction", "downstream")
        max_depth = sc.get("max_depth", 3)
        expected = sc["expected_services"]

        if engine_url:
            import urllib.request
            req_data = json.dumps({"service": origin, "direction": direction, "max_depth": max_depth}).encode("utf-8")
            req = urllib.request.Request(engine_url, data=req_data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                found = res_json.get("impacted_services", [])
        else:
            found = graph.get_blast_radius(origin_service=origin, max_depth=max_depth, direction=direction)

        result = score_blast_radius(
            expected_services=expected,
            found_services=found,
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
            f"{sc_id:<36} | "
            f"{result['precision']:<6.2f} | "
            f"{result['recall']:<6.2f} | "
            f"{result['f1_score']:<6.2f} | "
            f"{status_str}"
        )

    summary = {
        "benchmark_run_at": datetime.now(timezone.utc).isoformat(),
        "environment": "controlled_test_environment",
        "notice": "All metrics measured within an isolated synthetic/staging testbed, not production.",
        "scenarios_total": len(scenarios),
        "scenarios_passed": total_passed,
        "scenarios_failed": len(scenarios) - total_passed,
        "overall_accuracy": round(total_passed / len(scenarios), 4) if scenarios else 0.0,
        "results": scenario_results,
    }

    print("-" * 72)
    print(f"Summary: {total_passed}/{len(scenarios)} scenarios passed "
          f"({summary['overall_accuracy'] * 100:.1f}% accuracy)\n")

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as out_f:
            json.dump(summary, out_f, indent=2)
        print(f"Saved scored result file to: {output_path}")

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Perimeter Accuracy Benchmark Scorer")
    parser.add_argument(
        "--ground-truth",
        type=Path,
        default=REPO_ROOT / "evaluation" / "benchmark" / "fixtures" / "ground_truth.json",
        help="Path to ground truth JSON file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=REPO_ROOT / "evaluation" / "benchmark" / "benchmark_results.json",
        help="Path to output scored JSON result file",
    )
    parser.add_argument(
        "--engine-url",
        type=str,
        default=None,
        help="Optional HTTP URL of running engine (e.g., http://localhost:8000/correlate)",
    )
    args = parser.parse_args()
    run_benchmark(args.ground_truth, args.output, args.engine_url)


if __name__ == "__main__":
    main()
