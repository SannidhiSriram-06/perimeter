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

MemberKey = tuple[str, str]
AdminInfo = tuple[str, str, Optional[str]]


def _to_responder(
    candidate: CandidateScore,
    role: str,
    member_by_id: dict[MemberKey, TeamMember],
) -> Responder:
    """Creates a Responder instance from a CandidateScore and member directory."""
    member = member_by_id.get((candidate.user_id, candidate.team_id))
    chat_id = member.telegram_chat_id if member is not None else None
    score = candidate.total_score if candidate.total_score > 0.0 else round(0.5 * candidate.raw_score, 1)
    return Responder(
        user_id=candidate.user_id,
        name=candidate.name,
        team_id=candidate.team_id,
        role=role,
        seniority=candidate.seniority,
        score=score,
        telegram_chat_id=chat_id,
    )


def _admin_escalation(
    admin_info: AdminInfo,
    role: str = "Primary Responder (Emergency Admin Escalation)",
) -> Responder:
    """Creates an emergency admin responder when team escalation fails."""
    admin_user_id, admin_name, admin_chat_id = admin_info
    return Responder(
        user_id=admin_user_id,
        name=admin_name,
        team_id="admin",
        role=role,
        seniority="lead",
        score=100.0,
        telegram_chat_id=admin_chat_id,
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
    elif not is_primary and not is_secondary:
        excluded_reason = "Not in incident topology"

    avail_score = compute_availability_score(m.on_call_status)
    seniority_score = compute_seniority_score(m.seniority)
    skill_score, matched = compute_skill_score(m.skills, domain_skills)

    raw_score, total_score = compute_composite_score(
        avail_score, seniority_score, skill_score, team_multiplier
    )

    if excluded_reason is not None:
        total_score = 0.0

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


def _score_candidates(
    members: Sequence[TeamMember],
    primary_team_id: str,
    secondary_teams: set[str],
    domain_skills: list[str],
) -> list[CandidateScore]:
    """Evaluates and scores all members in the directory."""
    return [
        _evaluate_candidate(m, primary_team_id, secondary_teams, domain_skills)
        for m in members
    ]


def _find_core_platform_lead(
    candidate_scores: list[CandidateScore],
    member_by_id: dict[MemberKey, TeamMember],
) -> Optional[CandidateScore]:
    """Finds the highest-scoring eligible on-call senior from Core Platform."""
    candidates = [
        c for c in candidate_scores
        if c.team_id == "team-core-platform"
        and c.pool == "senior"
        and c.on_call_status
        and not c.is_on_leave
        and c.excluded_reason not in ("On leave", "Missing telegram_chat_id")
        and member_by_id.get((c.user_id, c.team_id)) is not None
        and bool(member_by_id[(c.user_id, c.team_id)].telegram_chat_id)
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda x: (x.total_score, x.raw_score, x.avail_score, x.seniority_score), reverse=True)
    return candidates[0]


def _fallback_senior(
    secondary_seniors: list[CandidateScore],
    candidate_scores: list[CandidateScore],
    member_by_id: dict[MemberKey, TeamMember],
    admin_info: AdminInfo,
) -> tuple[Responder, int, str]:
    """Finds a senior lead across fallback tiers (Level 1 Secondary, Level 2 Core Platform, Level 3 Admin)."""
    if secondary_seniors:
        lead = _to_responder(
            secondary_seniors[0],
            "Primary Responder (Cross-Team Senior Lead Fallback)",
            member_by_id,
        )
        return lead, 1, f"Level 1 Fallback: Primary team lacked senior lead. {lead.name} paired."

    cp_lead_score = _find_core_platform_lead(candidate_scores, member_by_id)
    if cp_lead_score is not None:
        lead = _to_responder(
            cp_lead_score,
            "Primary Responder (Core Platform Fallback Lead)",
            member_by_id,
        )
        return lead, 2, f"Level 2 Fallback: Core Platform on-call {lead.name} assigned as lead."

    admin = _admin_escalation(admin_info)
    return admin, 3, "Level 3 Admin escalation: no seniors available across teams."


def _pair_primary_standard(
    primary_seniors: list[CandidateScore],
    primary_juniors: list[CandidateScore],
    member_by_id: dict[MemberKey, TeamMember],
) -> tuple[Responder, Responder, int, str]:
    """Pairs top senior with top junior/mid from primary team (Level 0)."""
    p_resp = _to_responder(primary_seniors[0], "Primary Responder (Lead)", member_by_id)
    s_resp = _to_responder(primary_juniors[0], "Secondary Responder (Mid / On-Call)", member_by_id)
    reason = f"Level 0 Primary Team match: {p_resp.name} (Lead) paired with {s_resp.name} (Mid/On-Call)."
    return p_resp, s_resp, 0, reason


def _pair_primary_juniors_only(
    primary_juniors: list[CandidateScore],
    secondary_seniors: list[CandidateScore],
    candidate_scores: list[CandidateScore],
    member_by_id: dict[MemberKey, TeamMember],
    admin_info: AdminInfo,
) -> tuple[Responder, Responder, int, str]:
    """Handles case when primary team has juniors but lacks seniors."""
    p_lead, fb_level, reason = _fallback_senior(
        secondary_seniors, candidate_scores, member_by_id, admin_info
    )

    if fb_level == 3 and len(primary_juniors) >= 2:
        j_lead = _to_responder(primary_juniors[0], "Primary Responder (Junior Co-Triage)", member_by_id)
        j_sec = _to_responder(primary_juniors[1], "Secondary Responder (Junior Co-Triage)", member_by_id)
        return j_lead, j_sec, 1, "Two junior/mid engineers co-triaging owning team."

    s_resp = _to_responder(
        primary_juniors[0],
        "Secondary Responder (Owning Team On-Call Mid)",
        member_by_id,
    )
    return p_lead, s_resp, fb_level, reason


def _pair_primary_seniors_cotriage(
    primary_seniors: list[CandidateScore],
    member_by_id: dict[MemberKey, TeamMember],
) -> tuple[Responder, Responder, int, str]:
    """Handles Case A: Two primary seniors co-triage when no juniors available."""
    p_resp = _to_responder(primary_seniors[0], "Primary Responder (Lead Commander)", member_by_id)
    s_resp = _to_responder(primary_seniors[1], "Secondary Responder (Co-Triage Senior)", member_by_id)
    reason = (
        f"Case A: No junior/mid available on primary team. "
        f"Two seniors co-triaging: {primary_seniors[0].name} and {primary_seniors[1].name}."
    )
    return p_resp, s_resp, 0, reason


def _pair_single_primary_senior(
    s1: CandidateScore,
    secondary_juniors: list[CandidateScore],
    secondary_seniors: list[CandidateScore],
    candidate_scores: list[CandidateScore],
    member_by_id: dict[MemberKey, TeamMember],
    admin_info: AdminInfo,
) -> tuple[Responder, Responder, int, str]:
    """Assigns secondary responder when exactly one senior exists on primary team and no primary juniors."""
    p_resp = _to_responder(s1, "Primary Responder (Lead Commander)", member_by_id)

    if secondary_juniors:
        s_resp = _to_responder(
            secondary_juniors[0],
            "Secondary Responder (Cross-Team Investigator)",
            member_by_id,
        )
        return p_resp, s_resp, 1, "Single primary senior paired with secondary responder."

    if secondary_seniors:
        s_resp = _to_responder(
            secondary_seniors[0],
            "Secondary Responder (Cross-Team Senior)",
            member_by_id,
        )
        return p_resp, s_resp, 1, "Single primary senior paired with secondary responder."

    cp_senior = _find_core_platform_lead(candidate_scores, member_by_id)
    if cp_senior is not None and (cp_senior.user_id, cp_senior.team_id) != (s1.user_id, s1.team_id):
        s_resp = _to_responder(
            cp_senior,
            "Secondary Responder (Core Platform Fallback)",
            member_by_id,
        )
        return p_resp, s_resp, 2, "Single primary senior paired with Core Platform responder."

    admin_resp = _admin_escalation(admin_info, role="Secondary Responder (Emergency Admin Escalation)")
    return p_resp, admin_resp, 3, "Single primary senior paired with emergency admin responder."


def _pair_secondary_or_admin(
    secondary_seniors: list[CandidateScore],
    secondary_juniors: list[CandidateScore],
    candidate_scores: list[CandidateScore],
    member_by_id: dict[MemberKey, TeamMember],
    admin_info: AdminInfo,
) -> tuple[Responder, Optional[Responder], int, str]:
    """Handles responder dispatch when all primary team candidates are exhausted."""
    if secondary_seniors and secondary_juniors:
        p_resp = _to_responder(
            secondary_seniors[0],
            "Primary Responder (Blast-Radius Team Lead)",
            member_by_id,
        )
        s_resp = _to_responder(
            secondary_juniors[0],
            "Secondary Responder (Blast-Radius Investigator)",
            member_by_id,
        )
        return p_resp, s_resp, 1, "Level 1 Fallback: Dispatched secondary team responders."

    if len(secondary_seniors) >= 2:
        p_resp = _to_responder(
            secondary_seniors[0],
            "Primary Responder (Blast-Radius Team Lead)",
            member_by_id,
        )
        s_resp = _to_responder(
            secondary_seniors[1],
            "Secondary Responder (Blast-Radius Co-Triage Senior)",
            member_by_id,
        )
        return p_resp, s_resp, 1, "Level 1 Fallback: Dispatched secondary team seniors co-triaging."

    if len(secondary_seniors) == 1:
        p_resp = _to_responder(
            secondary_seniors[0],
            "Primary Responder (Blast-Radius Team Lead)",
            member_by_id,
        )
        cp_senior = _find_core_platform_lead(candidate_scores, member_by_id)
        if cp_senior is not None and (cp_senior.user_id, cp_senior.team_id) != (secondary_seniors[0].user_id, secondary_seniors[0].team_id):
            s_resp = _to_responder(
                cp_senior,
                "Secondary Responder (Core Platform Fallback)",
                member_by_id,
            )
            return p_resp, s_resp, 2, "Level 2 Fallback: Single secondary senior paired with Core Platform."
        admin_resp = _admin_escalation(admin_info, role="Secondary Responder (Emergency Admin Escalation)")
        return p_resp, admin_resp, 3, "Level 3 Fallback: Single secondary senior paired with emergency admin."

    if secondary_juniors:
        p_lead, fb_level, reason = _fallback_senior(
            [], candidate_scores, member_by_id, admin_info
        )
        s_resp = _to_responder(
            secondary_juniors[0],
            "Secondary Responder (Blast-Radius Investigator)",
            member_by_id,
        )
        return p_lead, s_resp, fb_level, reason

    admin_resp = _admin_escalation(admin_info)
    return admin_resp, None, 3, "Level 3 Admin escalation: No eligible candidates across teams."


def _pick_pair(
    primary_seniors: list[CandidateScore],
    primary_juniors: list[CandidateScore],
    secondary_seniors: list[CandidateScore],
    secondary_juniors: list[CandidateScore],
    candidate_scores: list[CandidateScore],
    member_by_id: dict[MemberKey, TeamMember],
    admin_info: AdminInfo,
) -> tuple[Optional[Responder], Optional[Responder], int, str]:
    """Determines primary and secondary responders based on pool availability and fallback tiers."""
    if primary_seniors and primary_juniors:
        return _pair_primary_standard(primary_seniors, primary_juniors, member_by_id)

    if not primary_seniors and primary_juniors:
        return _pair_primary_juniors_only(
            primary_juniors, secondary_seniors, candidate_scores, member_by_id, admin_info
        )

    if len(primary_seniors) >= 2 and not primary_juniors:
        return _pair_primary_seniors_cotriage(primary_seniors, member_by_id)

    if len(primary_seniors) == 1 and not primary_juniors:
        return _pair_single_primary_senior(
            primary_seniors[0],
            secondary_juniors,
            secondary_seniors,
            candidate_scores,
            member_by_id,
            admin_info,
        )

    return _pair_secondary_or_admin(
        secondary_seniors,
        secondary_juniors,
        candidate_scores,
        member_by_id,
        admin_info,
    )


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
    member_by_id = {(m.user_id, m.team_id): m for m in mem_list}

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

    candidate_scores = _score_candidates(mem_list, primary_team_id, secondary_teams, domain_skills)

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

    admin_info: AdminInfo = (admin_user_id, admin_name, admin_telegram_chat_id)
    p_resp, s_resp, fb_level, reason = _pick_pair(
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
