"""Unit and integration tests for the evaluation benchmark scorer."""

from pathlib import Path
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from evaluation.benchmark.scorer import (  # noqa: E402
    calculate_metrics,
    evaluate_all_fixtures,
    evaluate_scenario,
    score_blast_radius,
)
from src.graph.service_graph import ServiceDependencyGraph  # noqa: E402
from src.mock.fixtures import get_sample_trace_spans  # noqa: E402


class TestEvaluationScorer(unittest.TestCase):
    """Test suite validating metric accuracy, excluded services, and chaos benchmark scoring."""

    def test_perfect_match(self) -> None:
        """Verify identical expected and found services yield 1.0 for all metrics."""
        expected = ["checkout-service", "payment-gateway", "frontend-proxy"]
        found = ["checkout-service", "payment-gateway", "frontend-proxy"]

        metrics = calculate_metrics(expected, found)
        self.assertEqual(metrics["precision"], 1.0)
        self.assertEqual(metrics["recall"], 1.0)
        self.assertEqual(metrics["f1_score"], 1.0)
        self.assertEqual(metrics["false_positives"], [])
        self.assertEqual(metrics["false_negatives"], [])
        self.assertEqual(metrics["excluded_violations"], [])

    def test_partial_match_metrics(self) -> None:
        """Verify calculation with both false positives and false negatives."""
        expected = ["svc-a", "svc-b", "svc-c"]
        found = ["svc-b", "svc-c", "svc-d"]

        metrics = calculate_metrics(expected, found)
        self.assertEqual(metrics["true_positives"], ["svc-b", "svc-c"])
        self.assertEqual(metrics["false_positives"], ["svc-d"])
        self.assertEqual(metrics["false_negatives"], ["svc-a"])
        self.assertAlmostEqual(metrics["precision"], 2 / 3, places=3)
        self.assertAlmostEqual(metrics["recall"], 2 / 3, places=3)
        self.assertAlmostEqual(metrics["f1_score"], 2 / 3, places=3)

    def test_empty_found_services(self) -> None:
        """Verify empty discovered blast radius returns zero precision and recall."""
        expected = ["svc-a", "svc-b"]
        found = []

        metrics = calculate_metrics(expected, found)
        self.assertEqual(metrics["precision"], 0.0)
        self.assertEqual(metrics["recall"], 0.0)
        self.assertEqual(metrics["f1_score"], 0.0)
        self.assertEqual(metrics["false_negatives"], ["svc-a", "svc-b"])

    def test_empty_both_services(self) -> None:
        """Verify empty expected and empty found cleanly returns 1.0."""
        metrics = calculate_metrics([], [])
        self.assertEqual(metrics["precision"], 1.0)
        self.assertEqual(metrics["recall"], 1.0)
        self.assertEqual(metrics["f1_score"], 1.0)

    def test_enforce_excluded_services_fails_on_violation(self) -> None:
        """Verify presence of an excluded service fails the evaluation even if score is high."""
        expected = ["svc-a", "svc-b"]
        found = ["svc-a", "svc-b", "unrelated-noise"]
        excluded = ["unrelated-noise"]

        report = score_blast_radius(
            expected_services=expected,
            found_services=found,
            excluded_services=excluded,
            threshold=0.6,
        )
        self.assertFalse(report["passed"])
        self.assertEqual(report["excluded_violations"], ["unrelated-noise"])

    def test_enforce_excluded_services_passes_when_clean(self) -> None:
        """Verify evaluation passes when none of the excluded services appear."""
        expected = ["svc-a", "svc-b"]
        found = ["svc-a", "svc-b"]
        excluded = ["unrelated-noise"]

        report = score_blast_radius(
            expected_services=expected,
            found_services=found,
            excluded_services=excluded,
            threshold=0.8,
        )
        self.assertTrue(report["passed"])
        self.assertEqual(report["excluded_violations"], [])

    def test_score_blast_radius_report_structure(self) -> None:
        """Verify ground-truth result JSON schema fields and controlled environment label."""
        injected = {
            "fault_type": "PodChaos",
            "action": "pod-kill",
            "target_service": "payment-gateway",
            "environment": "controlled_test_environment",
        }
        report = score_blast_radius(
            expected_services=["payment-gateway", "checkout-service"],
            found_services=["payment-gateway", "checkout-service"],
            excluded_services=["recommendation-engine"],
            injected_fault=injected,
            scenario_id="chaos-sc-01",
            threshold=0.8,
        )

        self.assertEqual(report["scenario_id"], "chaos-sc-01")
        self.assertEqual(report["environment"], "controlled_test_environment")
        self.assertEqual(report["origin_service"], "payment-gateway")
        self.assertTrue(report["passed"])
        self.assertEqual(report["precision"], 1.0)
        self.assertEqual(report["recall"], 1.0)
        self.assertEqual(report["excluded_violations"], [])
        self.assertIn("timestamp", report)

    def test_scenario_evaluation_threshold_failure(self) -> None:
        """Verify run fails when recall drops below threshold."""
        scenario = {
            "scenario_id": "chaos-test-fail",
            "injected_fault": {"target_service": "checkout-service"},
            "expected_services": ["checkout-service", "payment-gateway", "bank-network"],
        }
        # Only found checkout-service (recall = 1/3 = 0.33 < 0.8)
        report = evaluate_scenario(scenario, ["checkout-service"], threshold=0.8)
        self.assertFalse(report["passed"])
        self.assertLess(report["recall"], 0.8)

    def test_chaos_scenario_01_upstream_on_mock_spans(self) -> None:
        """Verify Scenario 1 upstream: payment-gateway callers against mock spans."""
        graph = ServiceDependencyGraph()
        graph.load_spans(get_sample_trace_spans())

        found = graph.get_blast_radius(
            origin_service="payment-gateway",
            direction="upstream",
            max_depth=3,
        )
        expected = ["payment-gateway", "checkout-service", "frontend-proxy"]
        excluded = ["inventory-service", "recommendation-engine"]

        result = score_blast_radius(
            expected_services=expected,
            found_services=found,
            excluded_services=excluded,
            scenario_id="chaos-sc-01-payment-gateway-upstream",
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["precision"], 1.0)
        self.assertEqual(result["recall"], 1.0)
        self.assertEqual(result["excluded_violations"], [])

    def test_chaos_scenario_01_both_excludes_inventory_service(self) -> None:
        """Verify Scenario 1 both: union of callers and callees excludes inventory-service."""
        graph = ServiceDependencyGraph()
        graph.load_spans(get_sample_trace_spans())

        found = graph.get_blast_radius(
            origin_service="payment-gateway",
            direction="both",
            max_depth=3,
        )
        expected = ["payment-gateway", "checkout-service", "bank-network", "frontend-proxy"]
        excluded = ["inventory-service", "recommendation-engine"]

        result = score_blast_radius(
            expected_services=expected,
            found_services=found,
            excluded_services=excluded,
            scenario_id="chaos-sc-01-payment-gateway-both",
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["precision"], 1.0)
        self.assertEqual(result["recall"], 1.0)
        self.assertEqual(result["excluded_violations"], [])
        self.assertNotIn("inventory-service", found)

    def test_chaos_scenario_02_on_mock_spans(self) -> None:
        """Verify Scenario 2: bank-network upstream callers against mock spans."""
        graph = ServiceDependencyGraph()
        graph.load_spans(get_sample_trace_spans())

        found = graph.get_blast_radius(
            origin_service="bank-network",
            direction="upstream",
            max_depth=3,
        )
        expected = [
            "bank-network",
            "payment-gateway",
            "checkout-service",
            "frontend-proxy",
        ]
        excluded = ["inventory-service", "recommendation-engine"]

        result = score_blast_radius(
            expected_services=expected,
            found_services=found,
            excluded_services=excluded,
            scenario_id="chaos-sc-02-bank-network-upstream",
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["precision"], 1.0)
        self.assertEqual(result["recall"], 1.0)
        self.assertEqual(result["excluded_violations"], [])

    def test_chaos_scenario_03_noisy_neighbor_isolation(self) -> None:
        """Verify Scenario 3: recommendation-engine stress isolates without false positives."""
        graph = ServiceDependencyGraph()
        graph.load_spans(get_sample_trace_spans())

        found = graph.get_blast_radius(
            origin_service="recommendation-engine",
            direction="both",
            max_depth=3,
        )
        expected = ["recommendation-engine"]
        excluded = [
            "frontend-proxy",
            "checkout-service",
            "payment-gateway",
            "bank-network",
            "inventory-service",
        ]

        result = score_blast_radius(
            expected_services=expected,
            found_services=found,
            excluded_services=excluded,
            scenario_id="chaos-sc-03-recommendation-engine-noise",
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["precision"], 1.0)
        self.assertEqual(result["recall"], 1.0)
        self.assertEqual(result["excluded_violations"], [])

    def test_evaluate_all_fixtures_runner(self) -> None:
        """Verify all ground-truth scenarios load and pass cleanly with zero exclusions."""
        fixture_path = (
            Path(__file__).resolve().parents[3]
            / "evaluation"
            / "benchmark"
            / "fixtures"
            / "ground_truth.json"
        )
        results = evaluate_all_fixtures(ground_truth_path=fixture_path)
        self.assertGreaterEqual(len(results), 3)
        for res in results:
            self.assertTrue(res["passed"], f"Scenario {res['scenario_id']} failed")
            self.assertEqual(res["precision"], 1.0)
            self.assertEqual(res["recall"], 1.0)
            self.assertEqual(res["excluded_violations"], [])
            self.assertEqual(res["environment"], "controlled_test_environment")
