#!/usr/bin/env bash
# One-command demo: prints the mock telemetry summary and sample alert.
#
# Current scope: uses the mock OpenTelemetry fixtures, not live fault injection.
# Chaos Mesh injection is not built yet; this script will call it once it lands.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/services/correlation-engine"
VENV="$ENGINE/.venv"

if [ ! -d "$VENV" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet -r "$ENGINE/requirements.txt"
fi

cd "$ENGINE"
"$VENV/bin/python" -m src.mock
