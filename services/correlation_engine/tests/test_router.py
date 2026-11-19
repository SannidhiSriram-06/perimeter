"""Unit tests for the on-call router and POST /route endpoint.

Verifies scoring formulation, leave exclusion, mixed-seniority pairing,
fallback escalation hierarchy, and exact reproducibility of worked examples 8.1 and 8.2.
"""

from fastapi.testclient import TestClient
import pytest

from src.api import app
from src.router import (
    TeamMember,
    compute_availability_score,
    compute_composite_score,
    compute_seniority_score,
    compute_skill_score,
    route_incident,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_worked_example_8_1_standard_checkout_cascade():
    """Reproduces Example 8.1 from docs/router-scoring.md with exact scores:

    - Dev Dave (100101): 82.0 (Junior/Mid Pool, On-Call Mid)
    - Sara Senior (100102): 56.0 (Senior Pool, Lead)
    - Ken Platform (100103): 32.0 (Senior Pool, Secondary Team Senior)
    Dispatched Pair:
    - Primary: Sara Senior (100102)
    - Secondary: Dev Dave (100101)
    """
    report = route_incident(
        alert_service_id="checkout-service",
        blast_radius=[
            "checkout-service",
            "payment-gateway",
            "inventory-service",
            "bank-network",
            "frontend-proxy",
        ],
        required_skills=[
            "payments",
            "distributed-systems",
            "fastapi",
            "postgresql",
            "python",
        ],
    )

    assert report.primary_team_id == "team-payments"
    assert report.fallback_level == 0

    scores = {c.user_id: c for c in report.candidate_scores}

    # 1. Dev Dave (100101)
    dave = scores["100101"]
    assert dave.avail_score == 100.0
    assert dave.seniority_score == 50.0
    assert dave.skill_score == 90.0  # min(100, (3/5) * 100 * 1.5) = 90.0
    assert dave.raw_score == 82.0  # (0.40 * 100) + (0.30 * 50) + (0.30 * 90) = 40 + 15 + 27 = 82.0
    assert dave.team_multiplier == 1.0
    assert dave.total_score == 82.0
    assert dave.pool == "junior_mid"
    assert dave.excluded_reason is None
    assert dave.matched_skills == ["fastapi", "postgresql", "python"]

    # 2. Sara Senior (100102)
    sara = scores["100102"]
    assert sara.avail_score == 20.0  # off shift
    assert sara.seniority_score == 100.0  # lead
    assert sara.skill_score == 60.0  # min(100, (2/5) * 100 * 1.5) = 60.0
    assert sara.raw_score == 56.0  # (0.40 * 20) + (0.30 * 100) + (0.30 * 60) = 8 + 30 + 18 = 56.0
    assert sara.team_multiplier == 1.0
    assert sara.total_score == 56.0
    assert sara.pool == "senior"
    assert sara.excluded_reason is None
    assert sara.matched_skills == ["distributed-systems", "payments"]

    # 3. Ken Platform (100103)
    ken = scores["100103"]
    assert ken.avail_score == 100.0
    assert ken.seniority_score == 80.0  # senior
    assert ken.skill_score == 0.0  # 0 matched
    assert ken.raw_score == 64.0  # (0.40 * 100) + (0.30 * 80) + 0 = 40 + 24 = 64.0
    assert ken.team_multiplier == 0.5  # Secondary team
    assert ken.total_score == 32.0  # 64.0 * 0.5 = 32.0
    assert ken.pool == "senior"
    assert ken.excluded_reason is None

    # Mixed-Seniority Pairing: Senior Lead + Junior/Mid Investigator
    assert report.primary_responder is not None
    assert report.primary_responder.user_id == "100102"
    assert report.primary_responder.name == "Sara Senior"
    assert report.primary_responder.score == 56.0

    assert report.secondary_responder is not None
    assert report.secondary_responder.user_id == "100101"
    assert report.secondary_responder.name == "Dev Dave"
    assert report.secondary_responder.score == 82.0


def test_worked_example_8_2_on_leave_and_fallback():
    """Reproduces Example 8.2 from docs/router-scoring.md:

    Sara Senior is on leave (is_on_leave = True).
    - Sara Senior: excluded, score 0.0
    - Dev Dave: 82.0 (Junior/Mid Pool)
    - Ken Platform: 32.0 (Senior Pool, Cross-Team Fallback)
    Dispatched Pair:
    - Primary: Ken Platform (100103)
    - Secondary: Dev Dave (100101)
    Fallback Level: 1
    """
    members_with_leave = [
        TeamMember(
            user_id="100101",
            team_id="team-payments",
            name="Dev Dave",
            seniority="mid",
            skills=["python", "postgresql", "fastapi"],
            telegram_chat_id="chat_101",
            is_on_leave=False,
            on_call_status=True,
        ),
        TeamMember(
            user_id="100102",
            team_id="team-payments",
            name="Sara Senior",
            seniority="lead",
            skills=["go", "distributed-systems", "payments"],
            telegram_chat_id="chat_102",
            is_on_leave=True,  # ON LEAVE
            on_call_status=False,
        ),
        TeamMember(
            user_id="100103",
            team_id="team-core-platform",
            name="Ken Platform",
            seniority="senior",
            skills=["kubernetes", "terraform", "opentelemetry"],
            telegram_chat_id="chat_103",
            is_on_leave=False,
            on_call_status=True,
        ),
    ]

    report = route_incident(
        alert_service_id="checkout-service",
        blast_radius=[
            "checkout-service",
            "payment-gateway",
            "inventory-service",
            "bank-network",
            "frontend-proxy",
        ],
        required_skills=[
            "payments",
            "distributed-systems",
            "fastapi",
            "postgresql",
            "python",
        ],
        members=members_with_leave,
    )

    scores = {c.user_id: c for c in report.candidate_scores}
    sara = scores["100102"]
    assert sara.is_on_leave is True
    assert sara.excluded_reason == "On leave"
    assert sara.total_score == 0.0

    assert report.fallback_level == 1
    assert report.primary_responder is not None
    assert report.primary_responder.user_id == "100103"
    assert report.primary_responder.name == "Ken Platform"
    assert report.primary_responder.score == 32.0

    assert report.secondary_responder is not None
    assert report.secondary_responder.user_id == "100101"
    assert report.secondary_responder.name == "Dev Dave"
    assert report.secondary_responder.score == 82.0


def test_scoring_primitives():
    """Verify individual scoring components."""
    assert compute_availability_score(True) == 100.0
    assert compute_availability_score(False) == 20.0

    assert compute_seniority_score("lead") == 100.0
    assert compute_seniority_score("senior") == 80.0
    assert compute_seniority_score("mid") == 50.0
    assert compute_seniority_score("junior") == 25.0
    assert compute_seniority_score("intern") == 0.0

    score, matched = compute_skill_score(["python", "go"], ["python", "java"])
    assert score == 75.0  # (1/2) * 100 * 1.5 = 75.0
    assert matched == ["python"]

    score, matched = compute_skill_score([], ["python"])
    assert score == 0.0
    assert matched == []

    score, matched = compute_skill_score(["python"], [])
    assert score == 0.0
    assert matched == []

    raw, total = compute_composite_score(100.0, 80.0, 60.0, 0.5)
    # raw = 40 + 24 + 18 = 82.0; total = 41.0
    assert raw == 82.0
    assert total == 41.0


def test_missing_telegram_chat_id_exclusion():
    """Member without telegram_chat_id is excluded from dispatch."""
    members = [
        TeamMember(
            user_id="100101",
            team_id="team-payments",
            name="No Telegram Dave",
            seniority="mid",
            skills=["python"],
            telegram_chat_id=None,
            is_on_leave=False,
            on_call_status=True,
        )
    ]
    report = route_incident("checkout-service", members=members)
    scores = {c.user_id: c for c in report.candidate_scores}
    assert scores["100101"].excluded_reason == "Missing telegram_chat_id"
    assert scores["100101"].total_score == 0.0


def test_case_a_two_seniors_co_triage():
    """When primary team has multiple seniors and no juniors, two seniors co-triage."""
    members = [
        TeamMember("1", "team-payments", "Lead Alice", "lead", ["payments"], "chat_1", False, True),
        TeamMember("2", "team-payments", "Senior Bob", "senior", ["payments"], "chat_2", False, False),
    ]
    report = route_incident("checkout-service", members=members)
    assert report.fallback_level == 0
    assert report.primary_responder.user_id == "1"
    assert report.secondary_responder.user_id == "2"


def test_level_3_admin_escalation():
    """When all candidates are unavailable or on leave, escalate to Level 3 Admin."""
    members = [
        TeamMember("1", "team-payments", "Lead Alice", "lead", [], "chat_1", is_on_leave=True),
    ]
    report = route_incident("checkout-service", members=members)
    assert report.fallback_level == 3
    assert report.primary_responder is not None
    assert report.primary_responder.user_id == "10001"
    assert report.primary_responder.role == "Primary Responder (Emergency Admin Escalation)"


def test_api_route_endpoint(client: TestClient):
    """Verify POST /route returns valid report for default and custom requests."""
    response = client.post(
        "/route",
        json={
            "alert_service_id": "checkout-service",
            "blast_radius": [
                "checkout-service",
                "payment-gateway",
                "inventory-service",
                "bank-network",
                "frontend-proxy",
            ],
            "required_skills": [
                "payments",
                "distributed-systems",
                "fastapi",
                "postgresql",
                "python",
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["alert_service_id"] == "checkout-service"
    assert data["primary_team_id"] == "team-payments"
    assert data["primary_responder"]["user_id"] == "100102"
    assert data["secondary_responder"]["user_id"] == "100101"
    assert data["fallback_level"] == 0
    assert len(data["candidate_scores"]) == 3


def test_api_route_custom_directory(client: TestClient):
    """POST /route accepts custom service and team member lists."""
    response = client.post(
        "/route",
        json={
            "alert_service_id": "auth-service",
            "blast_radius": ["auth-service"],
            "services": [
                {
                    "id": "auth-service",
                    "name": "Auth Service",
                    "owning_team_id": "team-security",
                    "tier": "critical",
                    "skills": ["crypto", "oauth"],
                }
            ],
            "members": [
                {
                    "user_id": "200001",
                    "team_id": "team-security",
                    "name": "Security Lead",
                    "seniority": "lead",
                    "skills": ["crypto", "oauth"],
                    "telegram_chat_id": "chat_sec_lead",
                    "is_on_leave": False,
                    "on_call_status": True,
                },
                {
                    "user_id": "200002",
                    "team_id": "team-security",
                    "name": "Security Junior",
                    "seniority": "junior",
                    "skills": ["oauth"],
                    "telegram_chat_id": "chat_sec_jr",
                    "is_on_leave": False,
                    "on_call_status": False,
                },
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["primary_team_id"] == "team-security"
    assert data["primary_responder"]["user_id"] == "200001"
    assert data["secondary_responder"]["user_id"] == "200002"


def test_api_route_validation_error(client: TestClient):
    """POST /route validates input and returns 422 for missing required fields."""
    response = client.post("/route", json={})
    assert response.status_code == 422
