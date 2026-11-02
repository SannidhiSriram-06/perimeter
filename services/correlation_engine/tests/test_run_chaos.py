"""Integration test hook running the Chaos Harness test suite within correlation_engine tests."""

from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Import TestChaosHarness from evaluation.tests.test_run_chaos
from evaluation.tests.test_run_chaos import TestChaosHarness  # noqa: E402, F401
