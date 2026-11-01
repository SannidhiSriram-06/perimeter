"""Fact-checking validator: every rule in docs/llm-output-schema.md, using its worked example."""

import copy
from typing import Any, Dict

import pytest

from src.llm import DraftRejected, validate_draft

from tests.conftest import KNOWN


def check(context, draft):
    return validate_draft(draft, context, known_services=KNOWN)


def claim(draft: Dict[str, Any], **fields: Any) -> Dict[str, Any]:
    """Replace the draft's claims with a single claim built from `fields`."""
    draft["claims"] = [{"id": "x", "text": "t", "evidence_ids": ["span-pg-03"], **fields}]
    draft["postmortem"]["timeline"] = []
    return draft


def only(result):
    return result.claims[0]


# --- the worked example ---------------------------------------------------------------------------


def test_worked_example_is_fully_supported(context, draft) -> None:
    result = check(context, draft)
    assert [c.supported for c in result.claims] == [True, True, True]
    assert result.issues == []
    assert result.ok


def test_validator_does_not_modify_its_inputs(context, draft) -> None:
    before = copy.deepcopy((context, draft))
    check(context, draft)
    assert (context, draft) == before


# --- structure check ------------------------------------------------------------------------------


def test_schema_violation_rejects_the_draft(context, draft) -> None:
    del draft["postmortem"]
    with pytest.raises(DraftRejected):
        check(context, draft)


def test_unknown_field_rejects_the_draft(context, draft) -> None:
    draft["extra"] = 1
    with pytest.raises(DraftRejected):
        check(context, draft)


def test_bad_claim_type_rejects_the_draft(context, draft) -> None:
    draft["claims"][0]["type"] = "vibes"
    with pytest.raises(DraftRejected):
        check(context, draft)


def test_draft_for_another_incident_is_rejected(context, draft) -> None:
    draft["incident_id"] = "inc-9999"
    with pytest.raises(DraftRejected):
        check(context, draft)


def test_too_many_claims_rejects_the_draft(context, draft) -> None:
    draft["claims"] = [dict(draft["claims"][0], id=f"c{i}") for i in range(31)]
    draft["postmortem"]["timeline"] = []
    with pytest.raises(DraftRejected):
        check(context, draft)


# --- evidence ids ---------------------------------------------------------------------------------


def test_claim_citing_unknown_evidence_is_unsupported(context, draft) -> None:
    draft["claims"][1]["evidence_ids"] = ["span-made-up"]
    result = check(context, draft)
    assert not result.claims[1].supported
    assert "span-made-up" in result.claims[1].reasons[0]


def test_every_cited_id_must_exist_not_just_one(context, draft) -> None:
    draft["claims"][1]["evidence_ids"] = ["span-bn-04", "span-made-up"]
    assert not check(context, draft).claims[1].supported


# --- service_ref ----------------------------------------------------------------------------------


def test_service_ref_inside_blast_radius_is_supported(context, draft) -> None:
    claim(draft, type="service_ref", service="bank-network")
    assert only(check(context, draft)).supported


def test_service_ref_outside_blast_radius_is_unsupported(context, draft) -> None:
    claim(draft, type="service_ref", service="recommendation-engine")
    assert not only(check(context, draft)).supported


def test_service_ref_without_a_service_is_unsupported(context, draft) -> None:
    claim(draft, type="service_ref")
    assert not only(check(context, draft)).supported


# --- causal_edge ----------------------------------------------------------------------------------


def test_causal_edge_in_the_wrong_direction_is_unsupported(context, draft) -> None:
    claim(draft, type="causal_edge", source="bank-network", target="payment-gateway", evidence_ids=["edge-2"])
    assert not only(check(context, draft)).supported


def test_causal_edge_that_does_not_exist_is_unsupported(context, draft) -> None:
    claim(draft, type="causal_edge", source="payment-gateway", target="inventory-service", evidence_ids=["edge-2"])
    assert not only(check(context, draft)).supported


# --- latency --------------------------------------------------------------------------------------


@pytest.mark.parametrize("value, ok", [(4200, True), (4400, True), (4000, True), (3900, False), (4500, False)])
def test_latency_must_be_within_five_percent(context, draft, value, ok) -> None:
    claim(draft, type="latency", service="payment-gateway", value=value, unit="ms")
    assert only(check(context, draft)).supported is ok


def test_latency_in_seconds_is_converted(context, draft) -> None:
    claim(draft, type="latency", service="payment-gateway", value=4.2, unit="s")
    assert only(check(context, draft)).supported


def test_latency_needs_a_span_for_that_service(context, draft) -> None:
    # The cited span belongs to payment-gateway, not bank-network, even though 4200 matches it.
    claim(draft, type="latency", service="bank-network", value=4200, unit="ms")
    assert not only(check(context, draft)).supported


def test_latency_with_a_non_time_unit_is_unsupported(context, draft) -> None:
    claim(draft, type="latency", service="payment-gateway", value=4200, unit="count")
    assert not only(check(context, draft)).supported


# --- status_code ----------------------------------------------------------------------------------


def test_status_code_must_match_the_cited_span(context, draft) -> None:
    claim(draft, type="status_code", service="payment-gateway", status_code=500)
    assert only(check(context, draft)).supported
    claim(draft, type="status_code", service="payment-gateway", status_code=504)
    assert not only(check(context, draft)).supported


def test_status_code_needs_a_span_for_that_service(context, draft) -> None:
    claim(draft, type="status_code", service="bank-network", status_code=500)
    assert not only(check(context, draft)).supported


# --- metric_value ---------------------------------------------------------------------------------


def test_metric_value_within_tolerance_is_supported(context, draft) -> None:
    claim(draft, type="metric_value", value=4.4, evidence_ids=["met-1"])
    assert only(check(context, draft)).supported


def test_metric_value_off_by_more_than_five_percent_is_unsupported(context, draft) -> None:
    claim(draft, type="metric_value", value=5.0, evidence_ids=["met-1"])
    assert not only(check(context, draft)).supported


def test_metric_value_must_cite_a_metric(context, draft) -> None:
    claim(draft, type="metric_value", value=4350, evidence_ids=["span-co-02"])
    assert not only(check(context, draft)).supported


# --- timestamp ------------------------------------------------------------------------------------


def test_timestamp_near_a_cited_log_is_supported(context, draft) -> None:
    claim(draft, type="timestamp", timestamp="2026-10-12T16:00:05Z", evidence_ids=["log-1"])
    assert only(check(context, draft)).supported


def test_timestamp_more_than_five_seconds_from_evidence_is_unsupported(context, draft) -> None:
    claim(draft, type="timestamp", timestamp="2026-10-12T16:00:09Z", evidence_ids=["log-1"])
    assert not only(check(context, draft)).supported


def test_timestamp_outside_the_incident_window_is_unsupported(context, draft) -> None:
    # Matches a (bogus) log exactly, but 20 minutes after the alert fired.
    context["evidence"].append({"id": "log-late", "kind": "log", "service": "bank-network", "timestamp": "2026-10-12T16:20:00Z", "message": "x"})
    claim(draft, type="timestamp", timestamp="2026-10-12T16:20:00Z", evidence_ids=["log-late"])
    assert not only(check(context, draft)).supported


def test_timestamp_cannot_cite_a_span(context, draft) -> None:
    claim(draft, type="timestamp", timestamp="2026-10-12T16:00:00Z", evidence_ids=["span-pg-03"])
    assert not only(check(context, draft)).supported


# --- whole-draft rules ----------------------------------------------------------------------------


def rules(result):
    return {issue.rule for issue in result.issues}


def test_rule1_root_cause_outside_blast_radius(context, draft) -> None:
    draft["hypothesis"]["root_cause_service"] = "recommendation-engine"
    result = check(context, draft)
    assert "root_cause_in_blast_radius" in rules(result)
    assert not result.ok


def test_rule1_cascade_path_outside_blast_radius(context, draft) -> None:
    draft["hypothesis"]["cascade_path"] = ["checkout-service", "recommendation-engine"]
    assert "cascade_path_in_blast_radius" in rules(check(context, draft))


def test_rule2_cascade_path_steps_must_share_an_edge(context, draft) -> None:
    draft["hypothesis"]["cascade_path"] = ["checkout-service", "bank-network"]
    assert "cascade_path_connected" in rules(check(context, draft))


def test_rule2_accepts_a_path_that_walks_edges_backwards(context, draft) -> None:
    draft["hypothesis"]["cascade_path"] = ["bank-network", "payment-gateway", "checkout-service"]
    assert "cascade_path_connected" not in rules(check(context, draft))


def test_rule3_timeline_pointing_at_a_missing_claim(context, draft) -> None:
    draft["postmortem"]["timeline"][0]["claim_ids"] = ["c99"]
    result = check(context, draft)
    assert "timeline_claim_exists" in rules(result)
    assert not result.ok


def test_rule3_timeline_row_with_an_unsupported_claim_is_warned_not_dropped(context, draft) -> None:
    draft["claims"][2]["value"] = 1
    result = check(context, draft)
    assert result.timeline_warnings == [0]
    assert len(draft["postmortem"]["timeline"]) == 1
    assert not result.ok


def test_rule3_clean_timeline_has_no_warnings(context, draft) -> None:
    assert check(context, draft).timeline_warnings == []


def test_rule4_unrelated_service_in_free_text_is_flagged(context, draft) -> None:
    draft["postmortem"]["summary"] = "recommendation-engine caused the failure."
    result = check(context, draft)
    assert "unknown_service_in_text" in rules(result)
    assert "recommendation-engine" in result.issues[0].message


@pytest.mark.parametrize(
    "path",
    ["hypothesis.summary", "postmortem.impact", "postmortem.next_steps", "postmortem.contributing_factors", "claims.text", "timeline.event"],
)
def test_rule4_checks_every_free_text_field(context, draft, path) -> None:
    bad = "blame recommendation-engine"
    if path == "hypothesis.summary":
        draft["hypothesis"]["summary"] = bad
    elif path == "postmortem.impact":
        draft["postmortem"]["impact"] = bad
    elif path == "postmortem.next_steps":
        draft["postmortem"]["next_steps"] = [bad]
    elif path == "postmortem.contributing_factors":
        draft["postmortem"]["contributing_factors"] = [bad]
    elif path == "claims.text":
        draft["claims"][0]["text"] = bad
    else:
        draft["postmortem"]["timeline"][0]["event"] = bad
    assert "unknown_service_in_text" in rules(check(context, draft))


def test_rule4_needs_the_whole_name_not_a_prefix(context, draft) -> None:
    draft["postmortem"]["summary"] = "bank-network-proxy was slow"  # not a known service
    draft["postmortem"]["impact"] = "the recommendation-engine-v2 pool"  # contains a known name inside a longer one
    assert "unknown_service_in_text" not in rules(check(context, draft))


def test_rule4_is_skipped_without_a_known_service_list(context, draft) -> None:
    draft["postmortem"]["summary"] = "recommendation-engine caused the failure."
    assert validate_draft(draft, context).issues == []


# --- malformed or missing data ----------------------------------------------------------------------------


def test_timestamp_claim_without_a_timestamp_is_unsupported(context, draft) -> None:
    claim(draft, type="timestamp", evidence_ids=["log-1"])
    assert not only(check(context, draft)).supported


def test_metric_claim_without_a_value_is_unsupported(context, draft) -> None:
    claim(draft, type="metric_value", evidence_ids=["met-1"])
    assert not only(check(context, draft)).supported


def test_evidence_with_a_bad_timestamp_never_supports_a_claim(context, draft) -> None:
    context["evidence"].append({"id": "log-bad", "kind": "log", "service": "bank-network", "timestamp": "not a date", "message": "x"})
    context["evidence"].append({"id": "log-none", "kind": "log", "service": "bank-network", "message": "x"})
    claim(draft, type="timestamp", timestamp="2026-10-12T16:00:00Z", evidence_ids=["log-bad", "log-none"])
    assert not only(check(context, draft)).supported


def test_without_an_alert_time_no_timestamp_claim_can_be_supported(context, draft) -> None:
    del context["alert"]["fired_at"]
    claim(draft, type="timestamp", timestamp="2026-10-12T16:00:02Z", evidence_ids=["log-1"])
    assert not only(check(context, draft)).supported


def test_a_timestamp_without_a_zone_is_read_as_utc(context, draft) -> None:
    claim(draft, type="timestamp", timestamp="2026-10-12T16:00:03", evidence_ids=["log-1"])
    assert only(check(context, draft)).supported


# --- empty citation lists: flagged, not rejected (the model API ignores minItems) ----------------------


def test_timeline_row_without_claim_ids_is_a_warning_not_a_rejection(context, draft) -> None:
    draft["postmortem"]["timeline"][0]["claim_ids"] = []
    result = check(context, draft)
    assert result.timeline_warnings == [0]
    assert not result.ok


def test_claim_without_evidence_is_unsupported(context, draft) -> None:
    draft["claims"][2]["evidence_ids"] = []
    result = check(context, draft)
    assert only_claim(result, "c3").supported is False
    assert "no evidence" in only_claim(result, "c3").reasons[0]


def only_claim(result, claim_id):
    return next(c for c in result.claims if c.id == claim_id)
