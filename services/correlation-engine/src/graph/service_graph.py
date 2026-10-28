"""Service Dependency Graph and blast-radius BFS calculation engine.

This module provides graph abstractions to map microservice dependencies
discovered from distributed tracing spans and compute blast radiuses
during incident cascades.

Execution note (hyphenated directory):
    Due to the hyphen in `correlation-engine`, Python cannot import it as a standard
    dotted module path from repository root. Run commands from within this directory:
    $ cd services/correlation-engine && python3 -m pytest tests/
    $ cd services/correlation-engine && python3 -m src.mock
"""

from collections import deque
from itertools import chain
from typing import Any, Dict, Iterator, List, Literal, Optional, Set
import networkx as nx
from pydantic import BaseModel, Field


Direction = Literal["downstream", "upstream", "both"]


class ServiceEdge(BaseModel):
    """Pydantic model representing an edge between two microservices."""

    source_service: str = Field(..., description="Upstream caller service")
    target_service: str = Field(..., description="Downstream callee service")
    call_count: int = Field(default=1, ge=1, description="Number of observed trace calls")


class BlastRadiusReport(BaseModel):
    """Pydantic model representing the computed blast radius of an incident."""

    origin_service: str = Field(..., description="Service initiating or suffering the alert")
    max_depth: int = Field(default=3, ge=0, description="Max BFS traversal depth")
    direction: Direction = Field(default="downstream", description="Which way the BFS followed call edges")
    impacted_services: List[str] = Field(
        default_factory=list, description="Ordered list of downstream impacted services"
    )
    total_impacted: int = Field(default=0, description="Total count of impacted services")


class ServiceDependencyGraph:
    """Directed dependency graph representing microservice call topology."""

    def __init__(self, graph: Optional[nx.DiGraph] = None) -> None:
        """Initialize the service dependency graph wrapping a networkx DiGraph."""
        self._graph: nx.DiGraph = graph if graph is not None else nx.DiGraph()

    @property
    def graph(self) -> nx.DiGraph:
        """Access the underlying networkx DiGraph instance."""
        return self._graph

    def add_trace_edge(
        self, source_service: str, target_service: str, call_count: int = 1
    ) -> None:
        """Add or update a directed dependency edge from source to target service.

        Args:
            source_service: Name of caller service.
            target_service: Name of callee service.
            call_count: Number of calls to add/increment for this edge.

        Raises:
            ValueError: If call_count is less than 1.
        """
        if call_count < 1:
            raise ValueError(f"call_count must be at least 1, got {call_count}")

        if self._graph.has_edge(source_service, target_service):
            self._graph[source_service][target_service]["call_count"] += call_count
        else:
            self._graph.add_edge(
                source_service, target_service, call_count=call_count
            )

    def _neighbors(self, service: str, direction: Direction) -> Iterator[str]:
        if direction == "downstream":
            return iter(self._graph.successors(service))
        if direction == "upstream":
            return iter(self._graph.predecessors(service))
        return chain(self._graph.successors(service), self._graph.predecessors(service))

    def get_blast_radius(
        self, origin_service: str, max_depth: int = 3, direction: Direction = "downstream"
    ) -> List[str]:
        """Compute the blast radius using Breadth-First Search (BFS).

        Traverses call edges starting from `origin_service` up to `max_depth`
        hops away. Cycle-safe: handles loops and mutual dependencies without
        infinite loops.

        Args:
            origin_service: The service where failure or alert originated.
            max_depth: Maximum BFS traversal distance (default: 3).
            direction: "downstream" follows callees (where a fault may come from),
                "upstream" follows callers (who suffers from it), "both" follows
                both ways.

        Returns:
            Ordered list of reachable services starting with `origin_service`.
            Returns an empty list if `origin_service` is not in the graph or
            if max_depth is negative.

        Raises:
            ValueError: If direction is not one of the allowed values.
        """
        if direction not in ("downstream", "upstream", "both"):
            raise ValueError(f"direction must be downstream, upstream or both, got {direction!r}")
        if not self._graph.has_node(origin_service) or max_depth < 0:
            return []

        visited: Set[str] = {origin_service}
        impacted_order: List[str] = [origin_service]
        queue: deque = deque([(origin_service, 0)])

        while queue:
            current_service, current_depth = queue.popleft()

            if current_depth >= max_depth:
                continue

            for neighbor in self._neighbors(current_service, direction):
                if neighbor not in visited:
                    visited.add(neighbor)
                    impacted_order.append(neighbor)
                    queue.append((neighbor, current_depth + 1))

        return impacted_order

    def get_blast_radius_report(
        self, origin_service: str, max_depth: int = 3, direction: Direction = "downstream"
    ) -> BlastRadiusReport:
        """Return a Pydantic-validated BlastRadiusReport for the origin service.

        Raises:
            ValueError: If max_depth is negative.
        """
        if max_depth < 0:
            raise ValueError(f"max_depth must be non-negative, got {max_depth}")

        impacted = self.get_blast_radius(origin_service, max_depth, direction)
        return BlastRadiusReport(
            origin_service=origin_service,
            max_depth=max_depth,
            direction=direction,
            impacted_services=impacted,
            total_impacted=len(impacted),
        )

    def load_spans(self, spans: List[Dict[str, Any]]) -> None:
        """Construct dependency edges directly from a list of OpenTelemetry spans.

        Matches child spans to parent spans by span_id/parent_span_id to identify
        cross-service calls.
        """
        span_by_id: Dict[str, Dict[str, Any]] = {
            span["span_id"]: span for span in spans if "span_id" in span
        }

        for span in spans:
            parent_id = span.get("parent_span_id")
            if parent_id and parent_id in span_by_id:
                parent_span = span_by_id[parent_id]
                source_svc = parent_span.get("service_name")
                target_svc = span.get("service_name")
                if source_svc and target_svc and source_svc != target_svc:
                    self.add_trace_edge(source_svc, target_svc)
