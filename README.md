# Perimeter

[![CI](https://github.com/SannidhiSriram-06/perimeter/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SannidhiSriram-06/perimeter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Self-hosted incident correlation and on-call routing for Kubernetes. Perimeter traces the real dependency chain behind an alert, drafts a root-cause report for a human to review, and pages the right responders. It runs entirely inside your cluster, so telemetry never leaves your infrastructure.

> Watching every edge of your infrastructure, from inside it.

## Why

- **Faster triage.** Engineers often spend 20–40 minutes digging through logs, metrics and traces for an incident. Perimeter walks OpenTelemetry trace edges from the alerting service, so only causally linked services are considered.
- **Auditable.** Blast-radius scoping is a deterministic graph traversal. Every "why we looked at this service" decision can be traced.
- **Data sovereignty.** No per-seat SaaS tier. Bring your own LLM key, or use a self-hosted model.

## How it works

```mermaid
flowchart LR
    Prom[Prometheus alert] --> BFF[Alert webhook<br/>BFF]
    OTel[OpenTelemetry spans] --> Graph[Blast-radius BFS]
    Graph --> Comp[Signal compressor]
    BFF --> Comp
    Comp --> LLM[LLM draft]
    LLM --> Check[Fact checker]
    Check --> Dash[Dashboard review]
    Router[On-call router] --> Tele[Telegram]

    classDef built fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef planned fill:#f1f5f9,stroke:#64748b,stroke-dasharray:4 3,color:#334155
    class BFF,Graph,Comp,LLM,Check,Dash,Router built
    class Tele planned
```

Green components exist in the repository today and run end to end on mock telemetry. The dashboard covers draft review, the team directory and a team incident view; the on-call router scores and pairs responders but is not yet wired into the alert flow. Grey components are planned (Telegram paging of real incidents). See [docs/design/Event_Store_Design.md](docs/design/Event_Store_Design.md) for the planned event store.

## Status

Last updated 2026-11-23 (`main` @ `a58fff1`). Everything the engine reasons about is still **mock telemetry**: there is no trace store or event store yet, so benchmark "passes" are mock against mock and are not accuracy results.

| Component | Status |
| :--- | :--- |
| Service dependency graph and BFS blast radius (upstream, downstream, both) | Built, tested |
| Mock OpenTelemetry spans, logs, metrics and alert fixtures | Built |
| Alert webhook (BFF): secret-protected, calls the engine, stores incidents, starts the draft | Built, tested. Known gaps: no de-duplication or resolve handling, no retry |
| Correlation engine HTTP API (`POST /correlate`, `POST /draft`, `POST /route`, `GET /health`) | Built, tested. No auth on engine endpoints |
| Signal compressor (rank evidence, trim to a token budget) | Built, tested. Runs on fixture logs and metrics |
| LLM root-cause draft and fact-checking validator | Built, tested; run against Groq (`openai/gpt-oss-120b`, needs `GROQ_API_KEY`). Claim text is rendered from the checked fields. Free-tier rate limits can leave an incident without a draft |
| On-call router: scoring, mixed-seniority pairing, `POST /route` | Built, tested. Not yet called by the alert flow |
| IAM login (scrypt) and role-scoped Team Directory API (BFF) | Built, tested against Postgres |
| Incidents API (list, edit and finalize a draft) and services API | Built, tested |
| Evaluation results API (admin) | Built |
| PostgreSQL schema, seed data and incident-review migration | Built |
| Docker images and a full local Compose stack (Postgres, engine, BFF) | Built; `./scripts/demo.sh` passes |
| Minikube: Prometheus, Alertmanager, Grafana, OTel Collector, plus the BFF, engine and a dev Postgres via the `perimeter` Helm chart | Built. End-to-end alert delivery in the cluster not verified; no Prometheus alert rules yet |
| CI: tests with coverage gate, lint, security scans, image builds | Built |
| Chaos scenarios, ground truth, benchmark scorer, execution harness | Built; only the offline dry-run has produced results. A live run was attempted and stopped (see [the report](docs/evaluation/Live_Chaos_Execution_Report.md)) |
| Six instrumented test microservices and load generator | Built |
| React dashboard: login, role guards, evaluation results, draft edit-and-finalize, team directory and leave, team incident view | Built, tested. No admin incident list or blast-radius graph yet; the review page is reached by URL |
| Telegram bot | Test sender only (`scripts/telegram_hello.py`); paging of real incidents is planned |
| Raw event store (MongoDB design merged) and event fetcher | Planned (design only) |
| Live chaos run feeding real spans to the engine; measured accuracy | Planned |
| Terraform, ArgoCD, Vault, ECR, RDS and DynamoDB deployment | Planned |

## Quick start

Requirements: Python 3.11+, Node.js 20+, Docker with Compose.

Run the correlation engine tests (includes the chaos harness tests):

```bash
cd services/correlation_engine
pip install -r requirements-dev.txt
python3 -m pytest tests/
```

Run the backend tests (they need PostgreSQL loaded from `deploy/db/init.sql`; see [deploy/README.md](deploy/README.md)) and the dashboard tests:

```bash
cd services/bff-server && npm ci && TEST_DATABASE_URL=postgres://perimeter:<password>@localhost:5432/perimeter_db npm test
cd services/dashboard && npm ci && npm test
```

Score the chaos scenarios offline: `python evaluation/run_chaos.py --scenario all --dry-run`.

Test the on-call Telegram dispatcher: `python scripts/telegram_hello.py` (see [docs/telegram-bot.md](docs/telegram-bot.md) for BotFather setup).

Run the demo. It starts Postgres, the correlation engine and the BFF in Docker, sends an alert to the webhook, and prints the stored incident with its blast radius. It reuses an existing `.env` and database volume, so on a machine with real dev data it adds a row there. With `GROQ_API_KEY` set, a draft is added to the incident a few seconds later:

```bash
./scripts/demo.sh
```

Print the mock telemetry summary without Docker: `cd services/correlation_engine && python -m src.mock`.

Start the stack yourself (the demo does this and also fills `.env` with random secrets):

```bash
cp .env.example .env   # then replace the change_me values
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

Demo logins use the seeded users (`10001` admin, `100101` team member) with the dev-only password `perimeter-dev`. See [deploy/README.md](deploy/README.md) for the database details.

### Run everything locally and open the dashboard

```bash
./scripts/demo.sh                      # Postgres, engine and BFF in Docker, plus one test alert
cd services/dashboard && npm ci && npm run dev    # dashboard at http://localhost:5173
```

| What | URL |
| :--- | :--- |
| Dashboard | http://localhost:5173 (use `localhost`, not `127.0.0.1`, because of CORS) |
| BFF API | http://localhost:3001 |
| Correlation engine | http://localhost:8000 (`/docs` for the interactive API) |

Log in with ID `10001` (admin) or `100101` (team member), password `perimeter-dev`. Admin pages: `/admin` (home), `/admin/directory`, `/admin/evaluation`, `/admin/incidents/<incident id>/review`. Team members land on `/team`. The incident id is printed by the webhook call in `demo.sh`. Stop everything with `docker compose --env-file .env -f deploy/docker-compose.yml down`.

Build the alert webhook service:

```bash
cd services/bff-server
npm ci
npm run build
```

## Repository layout

```
services/
  correlation_engine/   Python (FastAPI): graph + BFS (src/graph), compressor (src/compressor), LLM draft + validator (src/llm), on-call router (src/router), mock telemetry (src/mock), HTTP API (src/api.py), tests, Dockerfile
  bff-server/           Node.js: alert webhook (src/alerts), IAM login (src/auth), Team Directory (src/teams), incidents (src/incidents), services (src/services), evaluation (src/evaluation), tests, Dockerfile
  dashboard/            React + Vite + TypeScript: login, role guards, admin (directory, evaluation, draft review) and team pages, tests
  test-services/        Six instrumented FastAPI services and a load generator for chaos runs
evaluation/
  chaos/                Chaos Mesh manifests (pod kill, network delay, stress)
  benchmark/            Ground truth, scorer, offline results
  run_chaos.py          Chaos execution harness (dry-run works offline; live mode needs a cluster)
deploy/
  docker-compose.yml    Local stack: PostgreSQL, correlation engine, BFF
  db/init.sql           Schema and dev seed data
  k8s/                  Minikube bootstrap (up.sh, Helm values, test services)
  helm/perimeter/       Helm chart: BFF, engine and dev Postgres for Minikube
docs/
  llm-output-schema.md  Contract between the model, the validator and the dashboard
  router-scoring.md     On-call router scoring spec
  telegram-bot.md       Telegram bot configuration and dispatch guide
  design/               Event_Store_Design.md
  evaluation/           Chaos_Scenarios.md, Live_Chaos_Execution_Report.md
  wireframes/           Dashboard wireframes (SVG)
scripts/
  demo.sh               One-command demo
  telegram_hello.py     On-call Telegram bot hello dispatcher
.github/                CI workflows and CODEOWNERS
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch model, pull request rules and commit format.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

MIT. See [LICENSE](LICENSE).

*Academic note:* Perimeter is an engineering capstone project. Its accuracy claims are measured in a controlled, self-injected fault environment, not in production.
