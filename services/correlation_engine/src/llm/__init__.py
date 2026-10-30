"""LLM draft contract, prompt, client and the fact-checking validator."""

from .client import DEFAULT_MODEL, GroqClient, LLMClient, LLMError, ScriptedClient
from .draft import DraftOutcome, generate_draft
from .prompt import SYSTEM_PROMPT, build_prompt
from .schema import Draft
from .validator import ClaimResult, DraftIssue, DraftRejected, ValidationResult, validate_draft

__all__ = [
    "GroqClient",
    "ClaimResult",
    "DEFAULT_MODEL",
    "Draft",
    "DraftIssue",
    "DraftOutcome",
    "DraftRejected",
    "LLMClient",
    "LLMError",
    "SYSTEM_PROMPT",
    "ScriptedClient",
    "ValidationResult",
    "build_prompt",
    "generate_draft",
    "validate_draft",
]
