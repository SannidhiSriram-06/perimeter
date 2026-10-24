# Perimeter

[![CI](https://github.com/SannidhiSriram-06/perimeter/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/SannidhiSriram-06/perimeter/actions/workflows/ci.yml)
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
    class BFF,Graph built
    class Comp,LLM,Check,Dash,Router,Tele planned
```

Green components exist in the repository today. Grey components are planned. See [project_architecture_and_roadmap.md](project_architecture_and_roadmap.md) for the full design.

## Status

| Component | Status |
| :--- | :--- |
| Service dependency graph and BFS blast radius | Built, tested |
| Mock OpenTelemetry traces and alert fixtures | Built |
| Alert webhook endpoint (BFF) | Built, accepts and logs alerts |
| Local PostgreSQL schema and seed data | Built |
| CI: engine tests, BFF build, compose validation | Built |
| Signal compressor (rank and trim to token budget) | Planned |
| LLM root-cause draft and fact-checking validator | Planned |
| IAM role lookup (5-digit admin, 6-digit team) | Planned |
| React dashboards | Planned |
| On-call router and Telegram bot | Planned |
| Chaos fault injection and accuracy benchmark | Planned |
| Terraform, Helm, ArgoCD deployment | Planned |

## Quick start

Requirements: Python 3.11+, Node.js 20+, Docker with Compose.

Run the correlation engine tests:

```bash
cd services/correlation-engine
pip install -r requirements.txt
python3 -m pytest tests/
```

Run the demo (mock telemetry summary):

```bash
./scripts/demo.sh
```

Start the local PostgreSQL stack:

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up -d
```

See [deploy/README.md](deploy/README.md) for the database details.

Build the alert webhook service:

```bash
cd services/bff-server
npm ci
npm run build
```

## Repository layout

```
services/
  correlation-engine/   Python: graph, BFS blast radius, mock telemetry
  bff-server/           Node.js: alert webhook and API gateway
deploy/
  docker-compose.yml    Local PostgreSQL
  db/init.sql           Schema and seed data
scripts/
  demo.sh               One-command demo
.github/                CI workflow and CODEOWNERS
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch model, pull request rules and commit format.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

MIT. See [LICENSE](LICENSE).

*Academic note:* Perimeter is an engineering capstone project. Its accuracy claims are measured in a controlled, self-injected fault environment, not in production.
