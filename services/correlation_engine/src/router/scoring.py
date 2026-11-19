"""Scoring formulation and weighting functions for candidate responders."""

from __future__ import annotations

from typing import Sequence

W_AVAIL = 0.40
W_SENIORITY = 0.30
W_SKILL = 0.30

AVAIL_ON_CALL = 100.0
AVAIL_OFF_SHIFT = 20.0

SENIORITY_SCORES: dict[str, float] = {
    "lead": 100.0,
    "senior": 80.0,
    "mid": 50.0,
    "junior": 25.0,
}


def compute_availability_score(on_call_status: bool) -> float:
    """Calculates availability score based on scheduled on-call rotation."""
    return AVAIL_ON_CALL if on_call_status else AVAIL_OFF_SHIFT


def compute_seniority_score(seniority: str) -> float:
    """Calculates seniority score reflecting incident command and decision authority."""
    return SENIORITY_SCORES.get(seniority.lower(), 0.0)


def compute_skill_score(
    member_skills: Sequence[str],
    domain_skills: Sequence[str],
) -> tuple[float, list[str]]:
    """Calculates skill match percentage scaled to reward relevant competencies.

    Formula: min(100.0, (|K_m ∩ K_incident| / max(1, |K_incident|)) * 100 * 1.5)
    Returns:
        tuple of (skill_score, matched_skills_list)
    """
    if not domain_skills:
        return 0.0, []

    member_set = {s.strip().lower() for s in member_skills if s.strip()}
    domain_set = {s.strip().lower() for s in domain_skills if s.strip()}

    if not domain_set:
        return 0.0, []

    matched = sorted(member_set & domain_set)
    overlap_ratio = len(matched) / len(domain_set)
    score = min(100.0, overlap_ratio * 100.0 * 1.5)
    return round(score, 1), matched


def compute_composite_score(
    avail_score: float,
    seniority_score: float,
    skill_score: float,
    team_multiplier: float,
) -> tuple[float, float]:
    """Calculates raw weighted score and final composite score with team multiplier.

    Returns:
        tuple of (raw_score, total_score)
    """
    raw = (W_AVAIL * avail_score) + (W_SENIORITY * seniority_score) + (W_SKILL * skill_score)
    total = round(team_multiplier * raw, 1)
    return round(raw, 1), total
