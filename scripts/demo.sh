#!/usr/bin/env bash
# One-command demo of the real pipeline: starts Postgres, the correlation engine and the BFF in Docker,
# sends a Prometheus-style alert to the webhook, and prints the incident that was stored.
#
# Current scope: the engine builds its graph from the mock OpenTelemetry fixtures (no live traces yet),
# and the alert is a hand-made one, not injected by Chaos Mesh.
# Needs Docker. Creates .env with random secrets on first run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  cp .env.example .env
  for key in POSTGRES_PASSWORD AUTH_SECRET WEBHOOK_SECRET; do
    sed -i.bak "s|^${key}=.*|${key}=$(openssl rand -hex 16)|" .env
  done
  password="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)"
  sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=postgres://perimeter:${password}@localhost:5432/perimeter_db|" .env
  rm -f .env.bak
  echo "Created .env with random secrets."
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

compose=(docker compose --env-file .env -f deploy/docker-compose.yml)
"${compose[@]}" up -d --build --wait

echo
echo "Sending an alert for checkout-service..."
curl -fsS -X POST "http://127.0.0.1:${BFF_PORT:-3001}/api/v1/alerts/webhook" \
  -H "authorization: Bearer ${WEBHOOK_SECRET}" \
  -H 'content-type: application/json' \
  -d '{"alerts":[{"status":"firing","labels":{"alertname":"CheckoutServiceHighLatency","service":"checkout-service","severity":"critical"}}]}'

echo
echo
echo "Stored incident:"
"${compose[@]}" exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT title, status, alert_service_id, blast_radius FROM incidents ORDER BY created_at DESC LIMIT 1"

echo "Stop the stack with: docker compose --env-file .env -f deploy/docker-compose.yml down"
