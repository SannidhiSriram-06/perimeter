"""Smoke test for the mock telemetry CLI (`python -m src.mock`), which scripts/demo.sh runs."""

from src.mock.__main__ import main


def test_cli_prints_summary_and_exits_zero(capsys) -> None:
    assert main() == 0
    out = capsys.readouterr().out
    assert "Total Spans:" in out
    assert "recommendation-engine" in out
    assert "[OK] Mock telemetry fixtures verified successfully." in out
