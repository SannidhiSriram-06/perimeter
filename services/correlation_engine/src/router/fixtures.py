"""Default fixtures for services and team directory based on seeded database."""

from __future__ import annotations

from .models import Service, TeamMember

# Implicit domain skills mapped to services from router specification
SERVICE_DOMAIN_SKILLS: dict[str, list[str]] = {
    "checkout-service": ["python", "fastapi", "postgresql", "payments"],
    "payment-gateway": ["go", "distributed-systems", "payments"],
    "bank-network": ["go", "networking", "security", "payments"],
    "frontend-proxy": ["kubernetes", "networking", "opentelemetry"],
    "inventory-service": ["postgresql", "python", "grpc"],
    "recommendation-engine": ["python", "machine-learning"],
}

# Seeded microservices matching deploy/db/init.sql
SEEDED_SERVICES: list[Service] = [
    Service(
        id="frontend-proxy",
        name="Frontend Proxy",
        owning_team_id="team-core-platform",
        tier="critical",
        skills=SERVICE_DOMAIN_SKILLS["frontend-proxy"],
    ),
    Service(
        id="checkout-service",
        name="Checkout Service",
        owning_team_id="team-payments",
        tier="high",
        skills=SERVICE_DOMAIN_SKILLS["checkout-service"],
    ),
    Service(
        id="payment-gateway",
        name="Payment Gateway",
        owning_team_id="team-payments",
        tier="critical",
        skills=SERVICE_DOMAIN_SKILLS["payment-gateway"],
    ),
    Service(
        id="bank-network",
        name="Bank Network Gateway",
        owning_team_id="team-payments",
        tier="critical",
        skills=SERVICE_DOMAIN_SKILLS["bank-network"],
    ),
    Service(
        id="inventory-service",
        name="Inventory Service",
        owning_team_id="team-core-platform",
        tier="high",
        skills=SERVICE_DOMAIN_SKILLS["inventory-service"],
    ),
    Service(
        id="recommendation-engine",
        name="Recommendation Engine",
        owning_team_id="team-core-platform",
        tier="low",
        skills=SERVICE_DOMAIN_SKILLS["recommendation-engine"],
    ),
]

# Seeded team directory members matching deploy/db/init.sql
SEEDED_MEMBERS: list[TeamMember] = [
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
        is_on_leave=False,
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
