"""Prompt builder, Groq client wrapper (against a fake SDK client) and the draft pipeline step."""

import json
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from src.llm import (
    GroqClient,
    LLMError,
    ScriptedClient,
    build_prompt,
    generate_draft,
)
from src.llm.schema import strict_json_schema
from tests.conftest import KNOWN


# --- prompt ---------------------------------------------------------------------------------------


def test_prompt_contains_the_whole_context_and_the_ground_rules(context) -> None:
    system, user = build_prompt(context)
    assert json.loads(user.split("<context>")[1].split("</context>")[0]) == context
    for rule in ("evidence_ids", "blast_radius", "JSON"):
        assert rule in system


def test_prompt_is_deterministic(context) -> None:
    assert build_prompt(context) == build_prompt(dict(reversed(list(context.items()))))


# --- Groq wrapper -----------------------------------------------------------------------------------


class FakeGroq:
    """Stands in for groq.Groq(): records the request, returns a canned response."""

    def __init__(self, content: Optional[str] = "{}", finish_reason: str = "stop") -> None:
        self.calls: List[Dict[str, Any]] = []
        message = SimpleNamespace(content=content)
        self._response = SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish_reason)])
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self._response


def test_client_pins_temperature_zero_and_sends_the_strict_schema() -> None:
    sdk = FakeGroq('{"a": 1}')
    out = GroqClient(client=sdk).complete("sys", "usr")
    assert out == '{"a": 1}'
    call = sdk.calls[0]
    assert call["model"] == "openai/gpt-oss-120b"
    assert call["temperature"] == 0
    assert call["messages"] == [{"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}]
    assert call["include_reasoning"] is False
    assert call["reasoning_effort"] == "low"
    # The free tier allows 8K tokens a minute, so the ceiling must leave room for the prompt.
    assert call["max_completion_tokens"] <= 4096
    fmt = call["response_format"]
    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["strict"] is True
    assert fmt["json_schema"]["schema"] == strict_json_schema()


def test_model_and_effort_are_configurable(monkeypatch) -> None:
    sdk = FakeGroq()
    GroqClient(client=sdk, reasoning_effort="high").complete("s", "u")
    assert sdk.calls[0]["reasoning_effort"] == "high"
    monkeypatch.setenv("PERIMETER_LLM_MODEL", "openai/gpt-oss-20b")
    GroqClient(client=sdk).complete("s", "u")
    assert sdk.calls[1]["model"] == "openai/gpt-oss-20b"


def test_truncated_response_raises() -> None:
    with pytest.raises(LLMError, match="max_completion_tokens"):
        GroqClient(client=FakeGroq('{"a"', finish_reason="length")).complete("s", "u")


@pytest.mark.parametrize("content", [None, ""])
def test_empty_response_raises(content) -> None:
    with pytest.raises(LLMError, match="no content"):
        GroqClient(client=FakeGroq(content)).complete("s", "u")


def test_sdk_errors_become_llm_errors() -> None:
    sdk = FakeGroq()

    def boom(**_: Any) -> Any:
        raise RuntimeError("network down")

    sdk.chat = SimpleNamespace(completions=SimpleNamespace(create=boom))
    with pytest.raises(LLMError, match="network down"):
        GroqClient(client=sdk).complete("s", "u")


def test_rate_limit_error_reports_how_long_to_wait() -> None:
    class RateLimited(Exception):
        response = SimpleNamespace(headers={"retry-after": "12"})

    sdk = FakeGroq()

    def limited(**_: Any) -> Any:
        raise RateLimited("429 Too Many Requests")

    sdk.chat = SimpleNamespace(completions=SimpleNamespace(create=limited))
    with pytest.raises(LLMError, match=r"429.*retry after 12s"):
        GroqClient(client=sdk).complete("s", "u")


def test_missing_api_key_surfaces_as_llm_error(monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(LLMError):
        GroqClient().complete("s", "u")


# --- strict schema --------------------------------------------------------------------------------


def objects(node: Any):
    if isinstance(node, dict):
        if "properties" in node:
            yield node
        for value in node.values():
            yield from objects(value)
    elif isinstance(node, list):
        for item in node:
            yield from objects(item)


def test_strict_schema_requires_every_property_and_forbids_extras() -> None:
    found = list(objects(strict_json_schema()))
    assert len(found) == 5  # draft, hypothesis, claim, postmortem, timeline entry
    for obj in found:
        assert obj["required"] == list(obj["properties"])
        assert obj["additionalProperties"] is False


def test_strict_schema_drops_keywords_groq_does_not_document() -> None:
    text = json.dumps(strict_json_schema())
    for keyword in ("maxLength", "minLength", "minItems", "maxItems", '"format"', '"default"', '"title"'):
        assert keyword not in text


def test_strict_schema_keeps_the_claim_types_and_nullable_fields() -> None:
    schema = strict_json_schema()
    claim = schema["$defs"]["Claim"]["properties"]
    assert "causal_edge" in claim["type"]["enum"]
    assert {"type": "null"} in claim["status_code"]["anyOf"]


def test_a_strict_answer_with_nulls_validates(context, draft) -> None:
    # In strict mode the model must send every field, so unused claim fields arrive as null.
    for c in draft["claims"]:
        for field in ("service", "source", "target", "value", "unit", "status_code", "timestamp"):
            c.setdefault(field, None)
    outcome, _ = run(context, json.dumps(draft))
    assert outcome.status == "ok"


# --- generate_draft -------------------------------------------------------------------------------


def run(context, response):
    client = ScriptedClient(response)
    return generate_draft(context, client, known_services=KNOWN), client


def test_good_draft_is_ok_and_calls_the_model_once(context, draft) -> None:
    outcome, client = run(context, json.dumps(draft))
    assert outcome.status == "ok"
    assert outcome.validation.ok
    assert outcome.draft["incident_id"] == "inc-0001"
    assert len(client.calls) == 1
    assert client.calls[0][1].count("<context>") == 1


def test_hallucinated_draft_is_flagged_not_rejected(context, draft) -> None:
    draft["claims"][1]["status_code"] = 500
    outcome, _ = run(context, json.dumps(draft))
    assert outcome.status == "flagged"
    assert not outcome.validation.claims[1].supported
    assert outcome.draft is not None


def test_invalid_json_is_rejected_and_the_raw_text_is_kept(context) -> None:
    outcome, client = run(context, "Sure! Here is the postmortem: {")
    assert outcome.status == "rejected"
    assert outcome.raw == "Sure! Here is the postmortem: {"
    assert outcome.draft is None and outcome.validation is None
    assert len(client.calls) == 1  # no retry


def test_schema_violation_is_rejected_and_the_raw_text_is_kept(context, draft) -> None:
    del draft["postmortem"]
    raw = json.dumps(draft)
    outcome, _ = run(context, raw)
    assert outcome.status == "rejected"
    assert outcome.raw == raw
    assert "schema" in outcome.error


def test_json_that_is_not_an_object_is_rejected(context) -> None:
    outcome, _ = run(context, "[1, 2]")
    assert outcome.status == "rejected"


def test_llm_failure_is_reported_not_raised(context) -> None:
    def fail(system: str, user: str) -> str:
        raise LLMError("model refused")

    outcome = generate_draft(context, ScriptedClient(fail), known_services=KNOWN)
    assert outcome.status == "llm_error"
    assert outcome.error == "model refused"
    assert outcome.raw is None
