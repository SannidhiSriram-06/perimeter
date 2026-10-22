"""Unit and integration tests for ServiceDependencyGraph and blast-radius BFS.

Execution:
    $ cd services/correlation-engine && python3 -m pytest tests/
"""

import unittest
from src.graph.service_graph import ServiceDependencyGraph, BlastRadiusReport
from src.mock.fixtures import get_sample_trace_spans


class TestServiceDependencyGraph(unittest.TestCase):
    """Test suite verifying service dependency graph topology and BFS calculations."""

    def test_linear_cascade(self) -> None:
        """Verify linear cascade A -> B -> C returns ['A', 'B', 'C']."""
        graph = ServiceDependencyGraph()
        graph.add_trace_edge("A", "B")
        graph.add_trace_edge("B", "C")

        blast_radius = graph.get_blast_radius("A", max_depth=3)
        self.assertEqual(blast_radius, ["A", "B", "C"])

    def test_disconnected_service_not_included(self) -> None:
        """Verify disconnected service D is not included in blast radius of A."""
        graph = ServiceDependencyGraph()
        graph.add_trace_edge("A", "B")
        graph.add_trace_edge("B", "C")
        graph.add_trace_edge("D", "E")

        blast_radius = graph.get_blast_radius("A", max_depth=3)
        self.assertNotIn("D", blast_radius)
        self.assertNotIn("E", blast_radius)
        self.assertEqual(blast_radius, ["A", "B", "C"])

    def test_cycle_protection_no_infinite_loop(self) -> None:
        """Verify cyclic dependency A -> B -> A does not cause an infinite loop."""
        graph = ServiceDependencyGraph()
        graph.add_trace_edge("A", "B")
        graph.add_trace_edge("B", "A")

        blast_radius = graph.get_blast_radius("A", max_depth=10)
        self.assertEqual(blast_radius, ["A", "B"])

    def test_multi_node_cycle(self) -> None:
        """Verify larger cycle A -> B -> C -> A terminates cleanly."""
        graph = ServiceDependencyGraph()
        graph.add_trace_edge("A", "B")
        graph.add_trace_edge("B", "C")
        graph.add_trace_edge("C", "A")

        blast_radius = graph.get_blast_radius("A", max_depth=5)
        self.assertEqual(blast_radius, ["A", "B", "C"])

    def test_max_depth_truncation(self) -> None:
        """Verify BFS halts when max_depth is reached."""
        graph = ServiceDependencyGraph()
        graph.add_trace_edge("A", "B")
        graph.add_trace_edge("B", "C")
        graph.add_trace_edge("C", "D")
        graph.add_trace_edge("D", "E")

        self.assertEqual(graph.get_blast_radius("A", max_depth=0), ["A"])
        self.assertEqual(graph.get_blast_radius("A", max_depth=1), ["A", "B"])
        self.assertEqual(graph.get_blast_radius("A", max_depth=2), ["A", "B", "C"])
        self.assertEqual(graph.get_blast_radius("A", max_depth=3), ["A", "B", "C", "D"])

    def test_negative_depth_handling(self) -> None:
        """Verify negative max_depth returns empty list and report raises ValueError."""
        graph = ServiceDependencyGraph()
        graph.add_trace_edge("A", "B")

        self.assertEqual(graph.get_blast_radius("A", max_depth=-1), [])
        with self.assertRaises(ValueError):
            graph.get_blast_radius_report("A", max_depth=-1)

    def test_nonexistent_service_returns_empty(self) -> None:
        """Verify querying an unknown origin service returns an empty list."""
        graph = ServiceDependencyGraph()
        graph.add_trace_edge("A", "B")

        self.assertEqual(graph.get_blast_radius("UNKNOWN_SERVICE"), [])

    def test_edge_call_count_accumulation(self) -> None:
        """Verify adding duplicate edges increments call_count."""
        graph = ServiceDependencyGraph()
        graph.add_trace_edge("frontend", "backend", call_count=3)
        graph.add_trace_edge("frontend", "backend", call_count=2)

        edge_data = graph.graph.get_edge_data("frontend", "backend")
        self.assertEqual(edge_data["call_count"], 5)

    def test_invalid_call_count_rejected(self) -> None:
        """Verify call_count < 1 raises ValueError."""
        graph = ServiceDependencyGraph()
        with self.assertRaises(ValueError):
            graph.add_trace_edge("A", "B", call_count=0)
        with self.assertRaises(ValueError):
            graph.add_trace_edge("A", "B", call_count=-5)

    def test_blast_radius_report_pydantic(self) -> None:
        """Verify BlastRadiusReport Pydantic model serialization."""
        graph = ServiceDependencyGraph()
        graph.add_trace_edge("checkout-service", "payment-gateway")
        graph.add_trace_edge("payment-gateway", "bank-network")

        report = graph.get_blast_radius_report("checkout-service", max_depth=2)
        self.assertIsInstance(report, BlastRadiusReport)
        self.assertEqual(report.origin_service, "checkout-service")
        self.assertEqual(report.max_depth, 2)
        self.assertEqual(
            report.impacted_services,
            ["checkout-service", "payment-gateway", "bank-network"],
        )
        self.assertEqual(report.total_impacted, 3)

    def test_load_from_mock_fixtures(self) -> None:
        """Verify loading real spans from fixtures builds the cascade correctly."""
        spans = get_sample_trace_spans()
        graph = ServiceDependencyGraph()
        graph.load_spans(spans)

        blast_radius = graph.get_blast_radius("frontend-proxy", max_depth=3)
        self.assertIn("frontend-proxy", blast_radius)
        self.assertIn("checkout-service", blast_radius)
        self.assertIn("payment-gateway", blast_radius)
        self.assertNotIn("recommendation-engine", blast_radius)


if __name__ == "__main__":
    unittest.main()
