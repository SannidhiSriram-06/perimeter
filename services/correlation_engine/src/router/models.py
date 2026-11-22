"""Data models for the Perimeter on-call router."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

Seniority = Literal["junior", "mid", "senior", "lead"]
PoolType = Literal["senior", "junior_mid"]


@dataclass
class Service:
    """Microservice definition and team ownership."""

    id: str
    name: str
    owning_team_id: str
    tier: str = "medium"
    skills: list[str] = field(default_factory=list)


@dataclass
class TeamMember:
    """Team member record from the Team Directory."""

    user_id: str
    team_id: str
    name: str = ""
    seniority: Seniority = "mid"
    skills: list[str] = field(default_factory=list)
    telegram_chat_id: Optional[str] = None
    is_on_leave: bool = False
    on_call_status: bool = False


@dataclass
class CandidateScore:
    """Evaluation breakdown and composite score for a potential responder."""

    user_id: str
    name: str
    team_id: str
    seniority: str
    pool: PoolType
    is_on_leave: bool
    on_call_status: bool
    team_multiplier: float
    avail_score: float
    seniority_score: float
    skill_score: float
    raw_score: float
    total_score: float
    matched_skills: list[str] = field(default_factory=list)
    excluded_reason: Optional[str] = None


@dataclass
class Responder:
    """A responder selected to be paged for an incident."""

    user_id: str
    name: str
    team_id: str
    role: str
    seniority: str
    score: float
    telegram_chat_id: Optional[str] = None


@dataclass
class RouteReport:
    """Final dispatch recommendation and scoring summary for an incident."""

    alert_service_id: str
    primary_team_id: str
    blast_radius: list[str]
    required_skills: list[str]
    primary_responder: Optional[Responder]
    secondary_responder: Optional[Responder]
    fallback_level: int
    candidate_scores: list[CandidateScore]
    reasoning: str
    incident_id: Optional[str] = None
    root_cause_service: Optional[str] = None
