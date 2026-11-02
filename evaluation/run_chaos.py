#!/usr/bin/env python3
"""Perimeter Chaos Engineering & Live Evaluation Harness.

Applies Chaos Mesh synthetic fault injection manifests against a controlled Minikube
testbed, executes the correlation pipeline (via BFF webhook or in-process correlation engine),
guarantees cleanup of injected chaos resources even on failure, scores the resulting
blast radius against ground-truth benchmarks, and exports verified result JSON files.

ENVIRONMENT NOTICE:
    All chaos experiments and evaluation runs execute strictly within a controlled,
    synthetic test environment (Minikube / staging). Results NEVER originate from
    or target production environments.

Usage:
    # Dry-run mode (runs offline with mock telemetry fixtures, no cluster required):
    python evaluation/run_chaos.py --scenario chaos-sc-01 --dry-run
    python evaluation/run_chaos.py --scenario all --dry-run

    # Live cluster mode (requires Minikube and Chaos Mesh installed):
    python evaluation/run_chaos.py --scenario chaos-sc-01
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from datetime import UTC
except ImportError:  # pragma: no cover
    UTC = timezone.utc  # noqa: UP017

# Setup paths relative to repo root
REPO_ROOT = Path(__file__).resolve().parents[1]
ENGINE_DIR = REPO_ROOT / "services" / "correlation_engine"
BENCHMARK_DIR = REPO_ROOT / "evaluation" / "benchmark"
CHAOS_DIR = REPO_ROOT / "evaluation" / "chaos"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))
if str(BENCHMARK_DIR) not in sys.path:
    sys.path.insert(0, str(BENCHMARK_DIR))

# Import existing benchmark scorer and correlation engine graph components
from src.graph.service_graph import ServiceDependencyGraph
from src.mock.fixtures import get_sample_trace_spans

from evaluation.benchmark.scorer import (
    DEFAULT_GROUND_TRUTH_PATH,
    DEFAULT_RESULTS_DIR,
    score_blast_radius,
)

CONTROLLED_ENV_DISCLAIMER = (
    "Results strictly generated within a controlled synthetic test environment "
    "(Minikube / staging). Experiments never target or originate from production."
)

DEFAULT_CORRELATION_URL = "http://127.0.0.1:8000"

CORRELATION_ENDPOINTS: dict[str, str] = {
    "http://127.0.0.1:8000": "http://127.0.0.1:8000/correlate",
    "http://localhost:8000": "http://localhost:8000/correlate",
    "http://127.0.0.1:59999": "http://127.0.0.1:59999/correlate",
    "cluster": "http://perimeter-engine.perimeter.svc.cluster.local:8000/correlate",
    "http://perimeter-engine.perimeter.svc.cluster.local:8000": "http://perimeter-engine.perimeter.svc.cluster.local:8000/correlate",
}

SAFE_NAMESPACE_REGEX = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")

SCENARIO_MANIFEST_MAP: dict[str, str] = {
    "chaos-sc-01": "01-pod-kill-payment-gateway.yaml",
    "chaos-sc-02": "02-network-latency-bank-network.yaml",
    "chaos-sc-03": "03-stress-recommendation-engine.yaml",
}


def validate_namespace(namespace: str) -> str:
    """Validate Kubernetes namespace conforms to RFC 1123 DNS label."""
    cleaned = namespace.strip()
    if not SAFE_NAMESPACE_REGEX.match(cleaned):
        raise ValueError(
            f"Invalid Kubernetes namespace: '{namespace}'. Must match RFC 1123 DNS label."
        )
    return cleaned


def validate_manifest_path(manifest_path: Path) -> Path:
    """Validate manifest path exists and resolves inside the evaluation chaos directory."""
    resolved = manifest_path.resolve()
    chaos_resolved = CHAOS_DIR.resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"Chaos manifest not found: {resolved}")
    try:
        resolved.relative_to(chaos_resolved)
    except ValueError as err:
        raise ValueError(
            f"Manifest path must reside inside {chaos_resolved}: {resolved}"
        ) from err
    return resolved


def resolve_correlation_endpoint(raw_url: str = DEFAULT_CORRELATION_URL) -> str:
    """Resolve correlation engine URL strictly against trusted static endpoints (SSRF prevention)."""
    cleaned = raw_url.rstrip("/")
    if cleaned in CORRELATION_ENDPOINTS:
        return CORRELATION_ENDPOINTS[cleaned]
    raise ValueError(
        f"Correlation URL '{raw_url}' is not permitted. Permitted targets: {sorted(CORRELATION_ENDPOINTS.keys())}"
    )


# Alias for backward compatibility
validate_correlation_url = resolve_correlation_endpoint


def load_ground_truth(path: Path | None = None) -> list[dict[str, Any]]:
    """Load ground-truth scenarios from JSON fixture."""
    gt_path = (path or DEFAULT_GROUND_TRUTH_PATH).resolve()
    if not gt_path.is_file():
        raise FileNotFoundError(f"Ground-truth file not found: {gt_path}")
    with open(gt_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("scenarios", [])


def find_manifest_for_scenario(scenario_id: str, chaos_dir: Path | None = None) -> Path | None:
    """Find the Chaos Mesh YAML manifest corresponding to a scenario ID."""
    base_dir = (chaos_dir or CHAOS_DIR).resolve()
    prefix = scenario_id[:11] if scenario_id.startswith("chaos-sc-") else scenario_id
    if prefix in SCENARIO_MANIFEST_MAP:
        candidate = base_dir / SCENARIO_MANIFEST_MAP[prefix]
        if candidate.is_file():
            return candidate

    for yaml_file in sorted(base_dir.glob("*.yaml")):
        if prefix in yaml_file.name or scenario_id in yaml_file.name:
            return yaml_file

    return None


def resolve_scenarios(
    scenario_query: str,
    ground_truth_path: Path | None = None,
    chaos_dir: Path | None = None,
) -> list[tuple[dict[str, Any], Path | None]]:
    """Resolve user scenario query to scenario dicts and their manifest paths."""
    all_scenarios = load_ground_truth(ground_truth_path)
    q = scenario_query.strip().lower()

    resolved: list[tuple[dict[str, Any], Path | None]] = []

    if q in ("all", "*"):
        for sc in all_scenarios:
            sc_id = sc.get("scenario_id", "")
            manifest = find_manifest_for_scenario(sc_id, chaos_dir)
            resolved.append((sc, manifest))
        return resolved

    if q.isdigit():
        q = f"chaos-sc-{int(q):02d}"
    elif q.startswith("sc-"):
        q = f"chaos-{q}"

    for sc in all_scenarios:
        sc_id = sc.get("scenario_id", "").lower()
        if sc_id == q or sc_id.startswith(q) or q in sc_id:
            manifest = find_manifest_for_scenario(sc_id, chaos_dir)
            resolved.append((sc, manifest))

    if not resolved:
        valid_ids = [s.get("scenario_id") for s in all_scenarios]
        raise ValueError(
            f"Scenario '{scenario_query}' not recognized. Available scenarios: {valid_ids} or 'all'"
        )

    return resolved


def check_kubectl_available() -> bool:
    """Check if kubectl CLI is present in the system PATH."""
    try:
        subprocess.run(
            ["kubectl", "version", "--client"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return True
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def apply_chaos_manifest(manifest_path: Path, namespace: str = "perimeter-test") -> None:
    """Apply a Chaos Mesh manifest using kubectl, enforcing sanitized arguments."""
    safe_ns = validate_namespace(namespace)
    safe_path = validate_manifest_path(manifest_path)
    cmd = ["kubectl", "apply", "-f", str(safe_path), "-n", safe_ns]
    res = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(
            f"Failed to apply chaos manifest {safe_path.name}: {res.stderr.strip()}"
        )


def delete_chaos_manifest(manifest_path: Path, namespace: str = "perimeter-test") -> None:
    """Delete a Chaos Mesh manifest using kubectl, ensuring clean teardown."""
    safe_ns = validate_namespace(namespace)
    safe_path = validate_manifest_path(manifest_path)
    cmd = [
        "kubectl",
        "delete",
        "-f",
        str(safe_path),
        "-n",
        safe_ns,
        "--ignore-not-found=true",
        "--wait=false",
    ]
    subprocess.run(cmd, check=False, capture_output=True, text=True)


def execute_pipeline_live(
    origin_service: str,
    direction: str = "both",
    max_depth: int = 3,
    correlation_url: str = DEFAULT_CORRELATION_URL,
) -> list[str]:
    """Execute the correlation pipeline against a live Correlation Engine instance."""
    endpoint = resolve_correlation_endpoint(correlation_url)
    payload = json.dumps(
        {"service": origin_service, "direction": direction, "max_depth": max_depth}
    ).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("impacted_services", [])
    except urllib.error.URLError as e:
        raise ConnectionError(
            f"Could not reach Correlation Engine at {endpoint}: {e}. "
            "Ensure the engine is running or pass --dry-run for offline fixture evaluation."
        ) from e


def execute_pipeline_dry_run(
    origin_service: str,
    direction: str = "both",
    max_depth: int = 3,
    spans: list[dict[str, Any]] | None = None,
) -> list[str]:
    """Execute in-process graph correlation using mock telemetry fixtures."""
    graph = ServiceDependencyGraph()
    graph.load_spans(spans if spans is not None else get_sample_trace_spans())
    return graph.get_blast_radius(
        origin_service=origin_service,
        max_depth=max_depth,
        direction=direction,
    )


def _prepare_live_manifest(manifest_path: Path | None, scenario_id: str) -> Path:
    """Validate manifest and environment availability before live cluster injection."""
    if not manifest_path:
        raise FileNotFoundError(f"No Chaos Mesh YAML manifest found for scenario: {scenario_id}")

    if not check_kubectl_available():
        raise OSError(
            "kubectl command not found. Install kubectl and configure Minikube cluster "
            "or run with --dry-run for offline verification."
        )
    return manifest_path


def _run_dry_run_injection(
    manifest_path: Path | None,
    scenario_id: str,
    origin: str,
    direction: str,
    max_depth: int,
) -> tuple[list[str], str]:
    """Handle dry-run simulated fault application and in-process correlation."""
    if manifest_path:
        print(f"[Simulation] Verified Chaos Mesh manifest exists: {manifest_path.name}")
    else:
        print(f"[Simulation] Running scenario without manifest: {scenario_id}")
    fault_time = datetime.now(UTC).isoformat()
    services = execute_pipeline_dry_run(
        origin_service=origin,
        direction=direction,
        max_depth=max_depth,
    )
    return services, fault_time


def run_single_scenario(
    scenario: dict[str, Any],
    manifest_path: Path | None,
    dry_run: bool = False,
    wait_seconds: int = 5,
    namespace: str = "perimeter-test",
    correlation_url: str = DEFAULT_CORRELATION_URL,
    output_dir: Path | None = None,
    threshold: float = 0.8,
) -> dict[str, Any]:
    """Execute a single chaos scenario, guaranteeing cleanup and result persistence."""
    sc_id = scenario.get("scenario_id", "unknown-scenario")
    origin = scenario.get("origin_service", "")
    direction = scenario.get("direction", "both")
    max_depth = scenario.get("max_depth", 3)
    expected = scenario.get("expected_services", [])
    excluded = scenario.get("excluded_services", [])
    injected_fault = scenario.get("injected_fault", {})

    print(f"\n[{'DRY-RUN' if dry_run else 'LIVE'}] Running scenario: {sc_id}")
    print(f"Target: {origin} | Direction: {direction} | Expected: {expected}")

    found_services: list[str] = []
    injected = False
    fault_applied_at: str | None = None

    try:
        if not dry_run:
            safe_manifest = _prepare_live_manifest(manifest_path, sc_id)
            print(f"Applying Chaos Mesh manifest: {safe_manifest.name} in namespace '{namespace}'...")
            apply_chaos_manifest(safe_manifest, namespace=namespace)
            injected = True
            fault_applied_at = datetime.now(UTC).isoformat()

            if wait_seconds > 0:
                print(f"Waiting {wait_seconds}s for fault propagation...")
                time.sleep(wait_seconds)

            print(f"Querying Correlation Engine at {correlation_url}...")
            found_services = execute_pipeline_live(
                origin_service=origin,
                direction=direction,
                max_depth=max_depth,
                correlation_url=correlation_url,
            )
        else:
            found_services, fault_applied_at = _run_dry_run_injection(
                manifest_path=manifest_path,
                scenario_id=sc_id,
                origin=origin,
                direction=direction,
                max_depth=max_depth,
            )
    finally:
        if injected and manifest_path:
            print(f"Cleaning up Chaos Mesh resource: {manifest_path.name}...")
            delete_chaos_manifest(manifest_path, namespace=namespace)
            print("Cleanup complete.")
        elif dry_run:
            print("[Simulation] Cleanup simulated successfully.")

    scored_result = score_blast_radius(
        expected_services=expected,
        found_services=found_services,
        excluded_services=excluded,
        injected_fault=injected_fault,
        scenario_id=sc_id,
        threshold=threshold,
    )

    scored_result["environment"] = "controlled_test_environment"
    scored_result["environment_disclaimer"] = CONTROLLED_ENV_DISCLAIMER
    scored_result["dry_run"] = dry_run
    scored_result["manifest"] = manifest_path.name if manifest_path else None
    scored_result["fault_applied_at"] = fault_applied_at

    target_results_dir = (output_dir or DEFAULT_RESULTS_DIR).resolve()
    target_results_dir.mkdir(parents=True, exist_ok=True)
    out_file = target_results_dir / f"chaos_result_{sc_id}.json"
    with open(out_file, "w", encoding="utf-8") as out_f:
        json.dump(scored_result, out_f, indent=2)

    status_tag = "PASS" if scored_result["passed"] else "FAIL"
    print(
        f"Result: {status_tag} | Precision: {scored_result['precision']:.2f} | "
        f"Recall: {scored_result['recall']:.2f} | F1: {scored_result['f1_score']:.2f}"
    )
    return scored_result


def run_harness(
    scenario_query: str,
    dry_run: bool = False,
    wait_seconds: int = 5,
    namespace: str = "perimeter-test",
    correlation_url: str = DEFAULT_CORRELATION_URL,
    ground_truth_path: Path | None = None,
    output_dir: Path | None = None,
    threshold: float = 0.8,
) -> dict[str, Any]:
    """Execute one or more chaos scenarios through the harness."""
    print("=" * 76)
    print("PROJECT PERIMETER — CHAOS HARNESS & ACCURACY EVALUATION")
    print("=" * 76)
    print("ENVIRONMENT : Controlled Synthetic Test Environment (Minikube / Mock)")
    print(f"MODE        : {'DRY-RUN (Offline Fixture Simulation)' if dry_run else 'LIVE CLUSTER INJECTION'}")
    print(f"DISCLAIMER  : {CONTROLLED_ENV_DISCLAIMER}\n")

    targets = resolve_scenarios(scenario_query, ground_truth_path=ground_truth_path)
    print(f"Resolved {len(targets)} scenario(s) to execute.")

    results: list[dict[str, Any]] = []
    total_passed = 0

    for sc, manifest in targets:
        result = run_single_scenario(
            scenario=sc,
            manifest_path=manifest,
            dry_run=dry_run,
            wait_seconds=wait_seconds,
            namespace=namespace,
            correlation_url=correlation_url,
            output_dir=output_dir,
            threshold=threshold,
        )
        results.append(result)
        if result.get("passed", False):
            total_passed += 1

    summary = {
        "harness_run_at": datetime.now(UTC).isoformat(),
        "environment": "controlled_test_environment",
        "environment_disclaimer": CONTROLLED_ENV_DISCLAIMER,
        "dry_run": dry_run,
        "total_scenarios": len(results),
        "passed_scenarios": total_passed,
        "failed_scenarios": len(results) - total_passed,
        "pass_rate": round(total_passed / len(results), 4) if results else 0.0,
        "results": results,
    }

    target_results_dir = (output_dir or DEFAULT_RESULTS_DIR).resolve()
    target_results_dir.mkdir(parents=True, exist_ok=True)
    summary_file = target_results_dir / f"chaos_run_{'dryrun' if dry_run else 'live'}_summary.json"
    with open(summary_file, "w", encoding="utf-8") as sf:
        json.dump(summary, sf, indent=2)

    print("\n" + "=" * 76)
    print(f"HARNESS SUMMARY: {total_passed}/{len(results)} Scenarios Passed")
    print("=" * 76)

    return summary


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for chaos harness."""
    parser = argparse.ArgumentParser(
        description="Perimeter Chaos Engineering & Ground-Truth Evaluation Harness"
    )
    parser.add_argument(
        "--scenario",
        type=str,
        default="chaos-sc-01",
        help="Scenario ID (e.g. 'chaos-sc-01', '01', 'chaos-sc-02', 'all')",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run offline using mock fixtures without contacting a Kubernetes cluster",
    )
    parser.add_argument(
        "--wait",
        type=int,
        default=5,
        help="Wait time in seconds for fault propagation (live mode only, default: 5s)",
    )
    parser.add_argument(
        "--namespace",
        type=str,
        default="perimeter-test",
        help="Kubernetes namespace for Chaos Mesh resources (default: 'perimeter-test')",
    )
    parser.add_argument(
        "--correlation-url",
        type=str,
        default=os.getenv("CORRELATION_URL", DEFAULT_CORRELATION_URL),
        help=f"Correlation Engine URL for live pipeline trigger (default: {DEFAULT_CORRELATION_URL})",
    )
    parser.add_argument(
        "--ground-truth",
        type=Path,
        default=DEFAULT_GROUND_TRUTH_PATH,
        help="Path to ground_truth.json fixture",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_RESULTS_DIR,
        help="Directory to save evaluation JSON results",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    summary = run_harness(
        scenario_query=args.scenario,
        dry_run=args.dry_run,
        wait_seconds=args.wait,
        namespace=args.namespace,
        correlation_url=args.correlation_url,
        ground_truth_path=args.ground_truth,
        output_dir=args.output_dir,
    )
    if summary["failed_scenarios"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
