"""Perimeter On-Call Router Package.

Provides scoring, team directory evaluation, and mixed-seniority pairing
to dispatch responders for production incidents.
"""

from .engine import route_incident
from .fixtures import SEEDED_MEMBERS, SEEDED_SERVICES, SERVICE_DOMAIN_SKILLS
from .models import (
    CandidateScore,
    PoolType,
    Responder,
    RouteReport,
    Seniority,
    Service,
    TeamMember,
)
from .scoring import (
    compute_availability_score,
    compute_composite_score,
    compute_seniority_score,
    compute_skill_score,
)

__all__ = [
    "CandidateScore",
    "PoolType",
    "Responder",
    "RouteReport",
    "SEEDED_MEMBERS",
    "SEEDED_SERVICES",
    "SERVICE_DOMAIN_SKILLS",
    "Seniority",
    "Service",
    "TeamMember",
    "compute_availability_score",
    "compute_composite_score",
    "compute_seniority_score",
    "compute_skill_score",
    "route_incident",
]
