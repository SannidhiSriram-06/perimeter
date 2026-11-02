"""Unit tests for the Chaos Engineering & Evaluation Harness (evaluation/run_chaos.py)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from evaluation.run_chaos import (
    apply_chaos_manifest,
    check_kubectl_available,
    delete_chaos_manifest,
    execute_pipeline_dry_run,
    execute_pipeline_live,
    find_manifest_for_scenario,
    load_ground_truth,
    parse_args,
    resolve_scenarios,
    run_harness,
    run_single_scenario,
    validate_correlation_url,
    validate_manifest_path,
    validate_namespace,
)


class TestChaosHarness(unittest.TestCase):
    """Test suite validating offline dry-run simulation, manifest resolution, scoring, and cleanup."""

    def test_load_ground_truth(self) -> None:
        """Verify ground_truth.json is loaded and contains required scenario definitions."""
        scenarios = load_ground_truth()
        self.assertGreaterEqual(len(scenarios), 3)
        scenario_ids = [s["scenario_id"] for s in scenarios]
        self.assertIn("chaos-sc-01-payment-gateway-both", scenario_ids)
        self.assertIn("chaos-sc-02-bank-network-upstream", scenario_ids)
        self.assertIn("chaos-sc-03-recommendation-engine-noise", scenario_ids)

    def test_find_manifest_for_scenario(self) -> None:
        """Verify manifest lookup maps scenario IDs to existing Chaos Mesh YAMLs."""
        m1 = find_manifest_for_scenario("chaos-sc-01")
        self.assertIsNotNone(m1)
        self.assertEqual(m1.name, "01-pod-kill-payment-gateway.yaml")
        self.assertTrue(m1.is_file())

        m2 = find_manifest_for_scenario("chaos-sc-02-bank-network-upstream")
        self.assertIsNotNone(m2)
        self.assertEqual(m2.name, "02-network-latency-bank-network.yaml")

        m3 = find_manifest_for_scenario("chaos-sc-03")
        self.assertIsNotNone(m3)
        self.assertEqual(m3.name, "03-stress-recommendation-engine.yaml")

        self.assertIsNone(find_manifest_for_scenario("non-existent-scenario"))

    def test_resolve_scenarios_all(self) -> None:
        """Verify resolving 'all' returns all ground truth scenarios with mapped manifests."""
        resolved = resolve_scenarios("all")
        self.assertEqual(len(resolved), 4)
        for sc, manifest in resolved:
            self.assertIn("scenario_id", sc)
            self.assertIsNotNone(manifest)
            self.assertTrue(manifest.is_file())

    def test_resolve_scenarios_aliases(self) -> None:
        """Verify resolving by short ID or numeric string."""
        resolved_01 = resolve_scenarios("01")
        self.assertEqual(len(resolved_01), 2)  # upstream and both

        resolved_sc02 = resolve_scenarios("chaos-sc-02")
        self.assertEqual(len(resolved_sc02), 1)
        self.assertEqual(resolved_sc02[0][0]["origin_service"], "bank-network")

        with self.assertRaises(ValueError):
            resolve_scenarios("unknown-query-id")

    def test_execute_pipeline_dry_run(self) -> None:
        """Verify dry-run in-process BFS graph traversal without contacting cluster."""
        # Payment gateway 'both' direction
        found_pg = execute_pipeline_dry_run("payment-gateway", direction="both", max_depth=3)
        self.assertIn("payment-gateway", found_pg)
        self.assertIn("checkout-service", found_pg)
        self.assertIn("bank-network", found_pg)
        self.assertIn("frontend-proxy", found_pg)
        self.assertNotIn("inventory-service", found_pg)
        self.assertNotIn("recommendation-engine", found_pg)

        # Recommendation engine isolated node
        found_rec = execute_pipeline_dry_run("recommendation-engine", direction="both", max_depth=3)
        self.assertEqual(found_rec, ["recommendation-engine"])

    def test_run_single_scenario_dry_run(self) -> None:
        """Verify executing single scenario in dry-run mode writes compliant JSON result."""
        resolved = resolve_scenarios("chaos-sc-01-payment-gateway-both")
        sc, manifest = resolved[0]

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_dir = Path(tmp_dir)
            result = run_single_scenario(
                scenario=sc,
                manifest_path=manifest,
                dry_run=True,
                output_dir=out_dir,
            )

            self.assertTrue(result["passed"])
            self.assertEqual(result["precision"], 1.0)
            self.assertEqual(result["recall"], 1.0)
            self.assertEqual(result["environment"], "controlled_test_environment")
            self.assertIn("controlled synthetic test environment", result["environment_disclaimer"])
            self.assertTrue(result["dry_run"])

            # Verify saved file
            expected_file = out_dir / f"chaos_result_{sc['scenario_id']}.json"
            self.assertTrue(expected_file.is_file())

    def test_run_harness_dry_run_all(self) -> None:
        """Verify full harness run over all scenarios in dry-run mode."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_dir = Path(tmp_dir)
            summary = run_harness(
                scenario_query="all",
                dry_run=True,
                output_dir=out_dir,
            )

            self.assertEqual(summary["total_scenarios"], 4)
            self.assertEqual(summary["passed_scenarios"], 4)
            self.assertEqual(summary["failed_scenarios"], 0)
            self.assertEqual(summary["pass_rate"], 1.0)
            self.assertEqual(summary["environment"], "controlled_test_environment")

            summary_file = out_dir / "chaos_run_dryrun_summary.json"
            self.assertTrue(summary_file.is_file())

    @patch("subprocess.run")
    def test_apply_and_delete_manifest(self, mock_run: MagicMock) -> None:
        """Verify kubectl commands for manifest application and cleanup."""
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        manifest = REPO_ROOT / "evaluation" / "chaos" / "01-pod-kill-payment-gateway.yaml"

        # Apply
        apply_chaos_manifest(manifest, namespace="perimeter-test")
        mock_run.assert_called_with(
            ["kubectl", "apply", "-f", str(manifest.resolve()), "-n", "perimeter-test"],
            check=False,
            capture_output=True,
            text=True,
        )

        # Delete
        delete_chaos_manifest(manifest, namespace="perimeter-test")
        mock_run.assert_called_with(
            [
                "kubectl",
                "delete",
                "-f",
                str(manifest.resolve()),
                "-n",
                "perimeter-test",
                "--ignore-not-found=true",
                "--wait=false",
            ],
            check=False,
            capture_output=True,
            text=True,
        )

    @patch("subprocess.run")
    def test_apply_manifest_failure_raises(self, mock_run: MagicMock) -> None:
        """Verify error is raised when kubectl apply returns non-zero code."""
        mock_run.return_value = MagicMock(returncode=1, stderr="error: namespace not found")
        manifest = REPO_ROOT / "evaluation" / "chaos" / "01-pod-kill-payment-gateway.yaml"

        with self.assertRaises(RuntimeError) as ctx:
            apply_chaos_manifest(manifest, namespace="invalid-ns")
        self.assertIn("Failed to apply chaos manifest", str(ctx.exception))

    @patch("evaluation.run_chaos.delete_chaos_manifest")
    @patch("evaluation.run_chaos.apply_chaos_manifest")
    @patch("evaluation.run_chaos.check_kubectl_available", return_value=True)
    def test_cleanup_guaranteed_on_error(
        self,
        mock_kubectl: MagicMock,
        mock_apply: MagicMock,
        mock_delete: MagicMock,
    ) -> None:
        """Verify delete_chaos_manifest is always called even when the pipeline fails."""
        sc = {
            "scenario_id": "test-failure-cleanup",
            "origin_service": "payment-gateway",
            "direction": "both",
            "expected_services": ["payment-gateway"],
        }
        manifest = REPO_ROOT / "evaluation" / "chaos" / "01-pod-kill-payment-gateway.yaml"

        with (
            patch("evaluation.run_chaos.execute_pipeline_live", side_effect=ConnectionError("Engine down")),
            self.assertRaises(ConnectionError),
        ):
            run_single_scenario(
                scenario=sc,
                manifest_path=manifest,
                dry_run=False,
                wait_seconds=0,
            )

        # Cleanup must have been invoked despite exception
        mock_apply.assert_called_once()
        mock_delete.assert_called_once_with(manifest, namespace="perimeter-test")

    @patch("subprocess.run")
    def test_check_kubectl_available(self, mock_run: MagicMock) -> None:
        """Verify check_kubectl_available reflects CLI presence."""
        mock_run.return_value = MagicMock(returncode=0)
        self.assertTrue(check_kubectl_available())

        mock_run.side_effect = FileNotFoundError()
        self.assertFalse(check_kubectl_available())

    def test_execute_pipeline_live_connection_error(self) -> None:
        """Verify live pipeline execution raises ConnectionError when endpoint unreachable."""
        with self.assertRaises(ConnectionError):
            execute_pipeline_live(
                origin_service="payment-gateway",
                correlation_url="http://127.0.0.1:59999",  # unreachable port
            )

    def test_parse_args(self) -> None:
        """Verify argument parser defaults and flags."""
        test_args = ["--scenario", "chaos-sc-02", "--dry-run", "--wait", "10", "--namespace", "test-ns"]
        with patch.object(sys, "argv", ["run_chaos.py"] + test_args):
            args = parse_args()
            self.assertEqual(args.scenario, "chaos-sc-02")
            self.assertTrue(args.dry_run)
            self.assertEqual(args.wait, 10)
            self.assertEqual(args.namespace, "test-ns")


    def test_validate_namespace(self) -> None:
        """Verify namespace validation accepts RFC 1123 labels and rejects malicious inputs."""
        self.assertEqual(validate_namespace("perimeter-test"), "perimeter-test")
        self.assertEqual(validate_namespace("default"), "default")
        with self.assertRaises(ValueError):
            validate_namespace("invalid; rm -rf")
        with self.assertRaises(ValueError):
            validate_namespace("-invalid-start")
        with self.assertRaises(ValueError):
            validate_namespace("INVALID_UPPERCASE")

    def test_validate_manifest_path(self) -> None:
        """Verify manifest path validation ensures file is inside chaos directory."""
        valid_manifest = REPO_ROOT / "evaluation" / "chaos" / "01-pod-kill-payment-gateway.yaml"
        self.assertEqual(validate_manifest_path(valid_manifest), valid_manifest.resolve())

        # Non-existent file
        with self.assertRaises(FileNotFoundError):
            validate_manifest_path(REPO_ROOT / "evaluation" / "chaos" / "missing.yaml")

        # Path outside chaos dir
        with self.assertRaises(ValueError):
            validate_manifest_path(REPO_ROOT / "deploy" / "docker-compose.yml")

    def test_validate_correlation_url(self) -> None:
        """Verify correlation URL validation prevents SSRF against arbitrary hosts."""
        self.assertEqual(validate_correlation_url("http://127.0.0.1:8000"), "http://127.0.0.1:8000/correlate")
        self.assertEqual(validate_correlation_url("http://localhost:8000/"), "http://localhost:8000/correlate")

        with self.assertRaises(ValueError):
            validate_correlation_url("ftp://127.0.0.1:8000")

        with self.assertRaises(ValueError):
            validate_correlation_url("http://malicious-external-host.com")


if __name__ == "__main__":
    unittest.main()
