"""Core routing engine implementing leave filtering, scoring, and mixed-seniority pairing."""

from __future__ import annotations

from typing import Optional, Sequence

from .fixtures import SEEDED_MEMBERS, SEEDED_SERVICES, SERVICE_DOMAIN_SKILLS
from .models import CandidateScore, Responder, RouteReport, Service, TeamMember
from .scoring import (
    compute_availability_score,
    compute_composite_score,
    compute_seniority_score,
    compute_skill_score,
)


def _derive_domain_skills(
    target_service_id: str,
    blast_radius: Sequence[str],
    service_map: dict[str, Service],
    primary_team_id: str,
) -> list[str]:
    """Derives default required domain skills from the target service and primary team dependencies."""
    skills: set[str] = set()

    if target_service_id in service_map:
        skills.update(service_map[target_service_id].skills)
    elif target_service_id in SERVICE_DOMAIN_SKILLS:
        skills.update(SERVICE_DOMAIN_SKILLS[target_service_id])

    for s_id in blast_radius:
        svc = service_map.get(s_id)
        if svc and svc.owning_team_id == primary_team_id:
            skills.update(svc.skills)
        elif s_id in SERVICE_DOMAIN_SKILLS and svc and svc.owning_team_id == primary_team_id:
            skills.update(SERVICE_DOMAIN_SKILLS[s_id])

    return sorted(skills)


def _evaluate_candidate(
    m: TeamMember,
    primary_team_id: str,
    secondary_teams: set[str],
    domain_skills: list[str],
) -> CandidateScore:
    """Evaluates and scores a single candidate member against incident criteria."""
    pool = "senior" if m.seniority in ("lead", "senior") else "junior_mid"
    is_primary = m.team_id == primary_team_id
    is_secondary = m.team_id in secondary_teams
    in_topology = is_primary or is_secondary

    if is_primary:
        team_multiplier = 1.0
    elif is_secondary:
        team_multiplier = 0.5
    else:
        team_multiplier = 0.0

    excluded_reason = None
    if m.is_on_leave:
        excluded_reason = "On leave"
    elif not m.telegram_chat_id:
        excluded_reason = "Missing telegram_chat_id"
    elif not in_topology:
        excluded_reason = "Not in incident topology"

    avail_score = compute_availability_score(m.on_call_status)
    seniority_score = compute_seniority_score(m.seniority)
    skill_score, matched = compute_skill_score(m.skills, domain_skills)

    if excluded_reason is not None:
        raw_score = 0.0
        total_score = 0.0
    else:
        raw_score, total_score = compute_composite_score(
            avail_score, seniority_score, skill_score, team_multiplier
        )

    return CandidateScore(
        user_id=m.user_id,
        name=m.name,
        team_id=m.team_id,
        seniority=m.seniority,
        pool=pool,
        is_on_leave=m.is_on_leave,
        on_call_status=m.on_call_status,
        team_multiplier=team_multiplier,
        avail_score=avail_score,
        seniority_score=seniority_score,
        skill_score=skill_score,
        raw_score=raw_score,
        total_score=total_score,
        matched_skills=matched,
        excluded_reason=excluded_reason,
    )


def _select_primary_with_junior_fallback(
    secondary_seniors: list[CandidateScore],
    candidate_scores: list[CandidateScore],
    member_by_id: dict[str, TeamMember],
    primary_juniors: list[CandidateScore],
    admin_info: tuple[str, str, Optional[str]],
) -> tuple[Responder, Optional[Responder], int, str]:
    """Finds a lead responder when primary team has juniors but lacks seniors."""
    admin_user_id, admin_name, admin_chat_id = admin_info

    if secondary_seniors:
        fallback_senior = secondary_seniors[0]
        m_s = member_by_id[fallback_senior.user_id]
        resp = Responder(
            user_id=fallback_senior.user_id,
            name=fallback_senior.name,
            team_id=fallback_senior.team_id,
            role="Primary Responder (Cross-Team Senior Lead Fallback)",
            seniority=fallback_senior.seniority,
            score=fallback_senior.total_score,
            telegram_chat_id=m_s.telegram_chat_id,
        )
        return resp, None, 1, f"Level 1 Fallback: Primary team lacked senior lead. {resp.name} paired."

    core_platform_seniors = [
        c for c in candidate_scores
        if c.team_id == "team-core-platform" and c.pool == "senior" and not c.is_on_leave and c.on_call_status
    ]
    if core_platform_seniors:
        cp_pick = core_platform_seniors[0]
        m_cp = member_by_id[cp_pick.user_id]
        resp = Responder(
            user_id=cp_pick.user_id,
            name=cp_pick.name,
            team_id=cp_pick.team_id,
            role="Primary Responder (Core Platform Fallback Lead)",
            seniority=cp_pick.seniority,
            score=cp_pick.total_score,
            telegram_chat_id=m_cp.telegram_chat_id,
        )
        return resp, None, 2, f"Level 2 Fallback: Core Platform on-call {resp.name} assigned as lead."

    if len(primary_juniors) >= 2:
        j_lead = primary_juniors[0]
        m_lead = member_by_id[j_lead.user_id]
        resp = Responder(
            user_id=j_lead.user_id,
            name=j_lead.name,
            team_id=j_lead.team_id,
            role="Primary Responder (Junior Co-Triage)",
            seniority=j_lead.seniority,
            score=j_lead.total_score,
            telegram_chat_id=m_lead.telegram_chat_id,
        )
        return resp, None, 1, "Two junior/mid engineers co-triaging owning team."

    admin_resp = Responder(
        user_id=admin_user_id,
        name=admin_name,
        team_id="admin",
        role="Primary Responder (Emergency Admin Escalation)",
        seniority="lead",
        score=100.0,
        telegram_chat_id=admin_chat_id,
    )
    return admin_resp, None, 3, "Level 3 Admin escalation: no seniors available across teams."


def _resolve_secondary_when_single_senior(
    s1: CandidateScore,
    secondary_juniors: list[CandidateScore],
    secondary_seniors: list[CandidateScore],
    member_by_id: dict[str, TeamMember],
) -> tuple[Optional[Responder], int]:
    """Assigns secondary responder when exactly one senior is available on primary team."""
    if secondary_juniors:
        j2 = secondary_juniors[0]
        m2 = member_by_id[j2.user_id]
        resp = Responder(
            user_id=j2.user_id,
            name=j2.name,
            team_id=j2.team_id,
            role="Secondary Responder (Cross-Team Investigator)",
            seniority=j2.seniority,
            score=j2.total_score,
            telegram_chat_id=m2.telegram_chat_id,
        )
        return resp, 1

    if secondary_seniors:
        s2 = secondary_seniors[0]
        m2 = member_by_id[s2.user_id]
        resp = Responder(
            user_id=s2.user_id,
            name=s2.name,
            team_id=s2.team_id,
            role="Secondary Responder (Cross-Team Senior)",
            seniority=s2.seniority,
            score=s2.total_score,
            telegram_chat_id=m2.telegram_chat_id,
        )
        return resp, 1

    return None, 0


def _dispatch_responders(
    primary_seniors: list[CandidateScore],
    primary_juniors: list[CandidateScore],
    secondary_seniors: list[CandidateScore],
    secondary_juniors: list[CandidateScore],
    candidate_scores: list[CandidateScore],
    member_by_id: dict[str, TeamMember],
    admin_info: tuple[str, str, Optional[str]],
) -> tuple[Optional[Responder], Optional[Responder], int, str]:
    """Determines primary and secondary responders based on pool availability and fallback tiers."""
    admin_user_id, admin_name, admin_chat_id = admin_info

    # Level 0: Standard Mixed-Seniority Pairing on Primary Team
    if primary_seniors and primary_juniors:
        s_pick = primary_seniors[0]
        j_pick = primary_juniors[0]
        m_s = member_by_id[s_pick.user_id]
        m_j = member_by_id[j_pick.user_id]
        p_resp = Responder(
            user_id=s_pick.user_id,
            name=s_pick.name,
            team_id=s_pick.team_id,
            role="Primary Responder (Lead)",
            seniority=s_pick.seniority,
            score=s_pick.total_score,
            telegram_chat_id=m_s.telegram_chat_id,
        )
        s_resp = Responder(
            user_id=j_pick.user_id,
            name=j_pick.name,
            team_id=j_pick.team_id,
            role="Secondary Responder (Mid / On-Call)",
            seniority=j_pick.seniority,
            score=j_pick.total_score,
            telegram_chat_id=m_j.telegram_chat_id,
        )
        reason = f"Level 0 Primary Team match: {p_resp.name} (Lead) paired with {s_resp.name} (Mid/On-Call)."
        return p_resp, s_resp, 0, reason

    # Case: Primary has juniors but no seniors (Example 8.2 Fallback Scenario)
    if not primary_seniors and primary_juniors:
        j_pick = primary_juniors[0]
        m_j = member_by_id[j_pick.user_id]
        s_resp = Responder(
            user_id=j_pick.user_id,
            name=j_pick.name,
            team_id=j_pick.team_id,
            role="Secondary Responder (Owning Team On-Call Mid)",
            seniority=j_pick.seniority,
            score=j_pick.total_score,
            telegram_chat_id=m_j.telegram_chat_id,
        )
        p_resp, alt_s_resp, fb_level, reason = _select_primary_with_junior_fallback(
            secondary_seniors, candidate_scores, member_by_id, primary_juniors, admin_info
        )
        return p_resp, alt_s_resp or s_resp, fb_level, reason

    # Case: Primary team has multiple seniors, no juniors
    if len(primary_seniors) >= 2 and not primary_juniors:
        s1, s2 = primary_seniors[0], primary_seniors[1]
        m1, m2 = member_by_id[s1.user_id], member_by_id[s2.user_id]
        p_resp = Responder(
            user_id=s1.user_id,
            name=s1.name,
            team_id=s1.team_id,
            role="Primary Responder (Lead Commander)",
            seniority=s1.seniority,
            score=s1.total_score,
            telegram_chat_id=m1.telegram_chat_id,
        )
        s_resp = Responder(
            user_id=s2.user_id,
            name=s2.name,
            team_id=s2.team_id,
            role="Secondary Responder (Co-Triage Senior)",
            seniority=s2.seniority,
            score=s2.total_score,
            telegram_chat_id=m2.telegram_chat_id,
        )
        reason = f"Case A: No junior/mid available on primary team. Two seniors co-triaging: {s1.name} and {s2.name}."
        return p_resp, s_resp, 0, reason

    # Case: Exactly 1 primary senior, no primary juniors
    if len(primary_seniors) == 1 and not primary_juniors:
        s1 = primary_seniors[0]
        m1 = member_by_id[s1.user_id]
        p_resp = Responder(
            user_id=s1.user_id,
            name=s1.name,
            team_id=s1.team_id,
            role="Primary Responder (Lead Commander)",
            seniority=s1.seniority,
            score=s1.total_score,
            telegram_chat_id=m1.telegram_chat_id,
        )
        s_resp, fb_level = _resolve_secondary_when_single_senior(
            s1, secondary_juniors, secondary_seniors, member_by_id
        )
        return p_resp, s_resp, fb_level, "Single primary senior paired with secondary responder."

    # All primary candidates exhausted: secondary team pairing or admin escalation
    if secondary_seniors and secondary_juniors:
        s_sec, j_sec = secondary_seniors[0], secondary_juniors[0]
        m_s, m_j = member_by_id[s_sec.user_id], member_by_id[j_sec.user_id]
        p_resp = Responder(
            user_id=s_sec.user_id,
            name=s_sec.name,
            team_id=s_sec.team_id,
            role="Primary Responder (Blast-Radius Team Lead)",
            seniority=s_sec.seniority,
            score=s_sec.total_score,
            telegram_chat_id=m_s.telegram_chat_id,
        )
        s_resp = Responder(
            user_id=j_sec.user_id,
            name=j_sec.name,
            team_id=j_sec.team_id,
            role="Secondary Responder (Blast-Radius Investigator)",
            seniority=j_sec.seniority,
            score=j_sec.total_score,
            telegram_chat_id=m_j.telegram_chat_id,
        )
        return p_resp, s_resp, 1, "Level 1 Fallback: Dispatched secondary team responders."

    admin_resp = Responder(
        user_id=admin_user_id,
        name=admin_name,
        team_id="admin",
        role="Primary Responder (Emergency Admin Escalation)",
        seniority="lead",
        score=100.0,
        telegram_chat_id=admin_chat_id,
    )
    return admin_resp, None, 3, "Level 3 Admin escalation: No eligible candidates across teams."


def route_incident(
    alert_service_id: str,
    blast_radius: Sequence[str] = (),
    root_cause_service: Optional[str] = None,
    required_skills: Optional[Sequence[str]] = None,
    services: Optional[Sequence[Service]] = None,
    members: Optional[Sequence[TeamMember]] = None,
    incident_id: Optional[str] = None,
    admin_user_id: str = "10001",
    admin_name: str = "Alex Admin",
    admin_telegram_chat_id: Optional[str] = "chat_admin",
) -> RouteReport:
    """Evaluates candidates and assigns optimal primary and secondary responders for an incident."""
    svc_list = list(services) if services is not None else SEEDED_SERVICES
    mem_list = list(members) if members is not None else SEEDED_MEMBERS
    service_map = {s.id: s for s in svc_list}
    member_by_id = {m.user_id: m for m in mem_list}

    target_service_id = root_cause_service or alert_service_id
    target_service = service_map.get(target_service_id) or service_map.get(alert_service_id)
    primary_team_id = target_service.owning_team_id if target_service else "unknown"

    secondary_teams = {
        service_map[s_id].owning_team_id
        for s_id in blast_radius
        if s_id in service_map and service_map[s_id].owning_team_id != primary_team_id
    }

    if required_skills is not None:
        domain_skills = [s.strip().lower() for s in required_skills if s.strip()]
    else:
        domain_skills = _derive_domain_skills(target_service_id, blast_radius, service_map, primary_team_id)

    candidate_scores = [
        _evaluate_candidate(m, primary_team_id, secondary_teams, domain_skills)
        for m in mem_list
    ]

    eligible = [c for c in candidate_scores if not c.excluded_reason]

    primary_seniors = sorted(
        [c for c in eligible if c.team_id == primary_team_id and c.pool == "senior"],
        key=lambda x: (x.total_score, x.avail_score, x.seniority_score),
        reverse=True,
    )
    primary_juniors = sorted(
        [c for c in eligible if c.team_id == primary_team_id and c.pool == "junior_mid"],
        key=lambda x: (x.total_score, x.avail_score, x.seniority_score),
        reverse=True,
    )
    secondary_seniors = sorted(
        [c for c in eligible if c.team_id in secondary_teams and c.pool == "senior"],
        key=lambda x: (x.total_score, x.avail_score, x.seniority_score),
        reverse=True,
    )
    secondary_juniors = sorted(
        [c for c in eligible if c.team_id in secondary_teams and c.pool == "junior_mid"],
        key=lambda x: (x.total_score, x.avail_score, x.seniority_score),
        reverse=True,
    )

    admin_info = (admin_user_id, admin_name, admin_telegram_chat_id)
    p_resp, s_resp, fb_level, reason = _dispatch_responders(
        primary_seniors,
        primary_juniors,
        secondary_seniors,
        secondary_juniors,
        candidate_scores,
        member_by_id,
        admin_info,
    )

    return RouteReport(
        alert_service_id=alert_service_id,
        primary_team_id=primary_team_id,
        blast_radius=list(blast_radius),
        required_skills=domain_skills,
        primary_responder=p_resp,
        secondary_responder=s_resp,
        fallback_level=fb_level,
        candidate_scores=candidate_scores,
        reasoning=reason,
        incident_id=incident_id,
        root_cause_service=root_cause_service,
    )
