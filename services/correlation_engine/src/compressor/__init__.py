"""Signal compressor: ranks spans, logs and metrics from a blast radius and trims them to a token budget."""

from .compressor import DEFAULT_TOKEN_BUDGET, compress, estimate_tokens

__all__ = ["DEFAULT_TOKEN_BUDGET", "compress", "estimate_tokens"]
