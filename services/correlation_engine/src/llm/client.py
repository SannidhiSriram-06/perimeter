"""LLM clients: the Groq API wrapper and a scripted stand-in for tests and the demo pipeline."""

import os
from typing import Any, Callable, List, Optional, Protocol, Tuple, Union

from .schema import strict_json_schema

DEFAULT_MODEL = "openai/gpt-oss-120b"
# The free tier allows 8K tokens per minute for this model (30 requests/min, 200K tokens/day). The prompt plus this
# ceiling has to fit under that, and reasoning tokens count against it, so it stays small.
MAX_COMPLETION_TOKENS = 4096


class LLMError(Exception):
    """The model could not produce a response (truncation, rate limit, network, credentials)."""


class LLMClient(Protocol):
    def complete(self, system: str, user: str) -> str:
        """Return the model's raw text answer."""


class GroqClient:
    """Calls a Groq-hosted model once and returns the JSON text.

    Runs at temperature 0 with the answer constrained to the Draft schema (strict structured outputs). Credentials
    come from the GROQ_API_KEY environment variable; the model can be changed with PERIMETER_LLM_MODEL.
    """

    def __init__(
        self,
        client: Any = None,
        model: Optional[str] = None,
        reasoning_effort: str = "low",
        max_completion_tokens: int = MAX_COMPLETION_TOKENS,
    ) -> None:
        self._sdk = client  # created on first use so importing this module never needs credentials
        self.model = model or os.environ.get("PERIMETER_LLM_MODEL", DEFAULT_MODEL)
        self.reasoning_effort = reasoning_effort
        self.max_completion_tokens = max_completion_tokens

    def complete(self, system: str, user: str) -> str:
        try:
            if self._sdk is None:
                from groq import Groq

                self._sdk = Groq()
            response = self._sdk.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=0,
                max_completion_tokens=self.max_completion_tokens,
                reasoning_effort=self.reasoning_effort,
                include_reasoning=False,
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": "root_cause_draft", "strict": True, "schema": strict_json_schema()},
                },
            )
        except Exception as err:
            raise LLMError(_describe(err)) from err

        choice = response.choices[0]
        if choice.finish_reason == "length":
            raise LLMError("response was cut off at max_completion_tokens")
        content = choice.message.content
        if not content:
            raise LLMError("response contained no content")
        return content


def _describe(err: Exception) -> str:
    """The error text, plus how long Groq says to wait when a rate limit was hit."""
    retry_after = getattr(getattr(err, "response", None), "headers", {}).get("retry-after")
    return f"{err} (retry after {retry_after}s)" if retry_after else str(err)


class ScriptedClient:
    """Returns a fixed string, or whatever a function builds from the prompt. Records every call."""

    def __init__(self, response: Union[str, Callable[[str, str], str]]) -> None:
        self._response = response
        self.calls: List[Tuple[str, str]] = []

    def complete(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        return self._response(system, user) if callable(self._response) else self._response
