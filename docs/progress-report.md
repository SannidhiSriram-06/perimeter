# Perimeter progress report

**As of 8 November 2026, week 8 of 12** · `develop` @ `e2e34d7` · Repository: github.com/SannidhiSriram-06/perimeter

This report updates the PDF dated 3 November (`docs/reports/Progress_Report_2026-11-03_Week7.pdf`). That PDF is a snapshot and is not edited; this file is the current version. The detailed, tested findings are in [audit-report.md](audit-report.md).

## Summary

An alert posted to the webhook now flows all the way through: stored incident, blast radius, compressed evidence, one Groq call, fact-checked draft saved on the incident, and a team-scoped incidents API. **It runs on mock telemetry only**, there is **no dashboard content, no on-call router and no Telegram bot yet**, and the accuracy scores are offline dry-run scores, not measurements. Roughly **40%** of the proposal's scope is built.

## What changed since 3 November

| Date | Merged | What it did |
| :--- | :--- | :--- |
| 5 Nov | #58 | React + Vite dashboard shell: login, role-guarded routes, placeholder Admin and Team pages |
| 5 Nov | #59 | Backend rejects malformed password hashes instead of verifying them (audit N-05) |
| 5 Nov | #60 | Claim text shown to reviewers is rendered from the validated fields, not written by the model (audit N-04) |
| 5 Nov | #61 | Signal compressor: scores spans, logs and metrics by anomaly and call-graph proximity, trims to a token budget (default about 3,000 tokens); `/draft` uses it |
| 6 Nov | #64 | Mock logs and metrics are re-timed to the alert; the draft prompt forbids null timeline times |
| 6 Nov | #66, #67 | Removed a stray backup file; release merge of `develop` into `main` |

The 3 November report listed the signal compressor and the dashboard skeleton as open. Both are now merged. Audit finding N-02 (the `both` direction pulled in healthy siblings) was also fixed by that date.

## Where the work stands

| Area | Built | Still open |
| :--- | :--- | :--- |
| Correlation engine | BFS graph with upstream, downstream and both; span loader; `/correlate`; `/draft`; mock spans, logs and metrics | Real trace source; OTLP adapter; span typing, auth and size cap |
| AI draft layer | Compressor; prompt; Groq client with strict JSON schema; fact-checking validator (all claim types); draft wired into the webhook | Spacing and retry for the free-tier rate limit; analysis of why 7 of 10 stored drafts are flagged; event-store-backed evidence |
| Backend and IAM | Scrypt login; role lookup on every request; rate limits; Team Directory; webhook with bearer secret; team-scoped incidents API | De-duplication and resolve handling for alerts; edit-and-finalize endpoint; JSONB draft column; single team-membership source |
| Data | PostgreSQL schema and dev seed; MongoDB event store design | Event store and fetcher; migrations; audit table |
| Infrastructure and CI | Three images, Compose stack, demo script; Minikube observability; CI with coverage gate, lint and scans | Deploy BFF and engine in the cluster; end-to-end CI job; Terraform, Helm for the services, ArgoCD, Vault, RDS, DynamoDB, EKS |
| Evaluation | Four scenarios and ground truth; three Chaos Mesh manifests; scorer; execution harness with dry-run | Deploy instrumented test services; live chaos run; measured accuracy |
| Dashboard | Vite shell, login, route guards, 8 tests | Incident list, blast-radius view, claims with evidence, leave management, directory |
| On-call routing | Schema fields only | Router (scoring by skill, seniority, availability) and Telegram bot |
| Final delivery | | Integration, demo, evaluation write-up, papers and patent draft |

## The alert path today

1. **Alert.** A Prometheus-style JSON batch is posted to `POST /api/v1/alerts/webhook` with `Authorization: Bearer <WEBHOOK_SECRET>`.
2. **Correlate.** The BFF asks the engine for the blast radius in the `both` direction. For `checkout-service` that is `checkout-service, payment-gateway, inventory-service, bank-network, frontend-proxy`.
3. **Store.** An incident row is written before any model call; it is `correlation_failed` if the engine is down. The webhook answers 202 with the incident IDs.
4. **Draft (background).** The BFF calls the engine's `/draft`. The engine compresses the evidence, makes one Groq call at temperature 0 into a strict JSON schema, and validates every claim against the evidence it cites.
5. **Save.** `ok` and `flagged` drafts are saved on the incident with their validation result; `rejected` and `llm_error` leave the draft empty.
6. **Read.** `GET /api/v1/incidents` returns admins every incident and team members only incidents on services their team owns.

## Test and quality numbers (8 November)

| Suite | Result |
| :--- | :--- |
| Correlation engine (`pytest tests/`, includes 16 chaos-harness tests) | 177 passed, coverage 99% (gate 85%) |
| Backend (against Postgres 16 with the seed) | 45 passed |
| Dashboard (vitest) | 8 passed |
| `ruff`, `bandit`, `pip-audit`, `npm audit` | clean |
| `./scripts/demo.sh` | passes: images build, containers healthy, alert stored with a five-service blast radius |

Source size: about 5,700 non-blank lines of `.py`, `.ts`, `.sql`, `.sh`, `.yml` and `.yaml` (same counting rule as the 3 November report, which gave 5,247).

## Known issues and risks

- **Mock data everywhere.** Spans, logs and metrics come from fixtures. No claim of real-trace correlation or accuracy can be made yet.
- **Duplicate incidents.** Every re-delivered alert creates a new incident and a new model call; resolved alerts are ignored (audit N-01).
- **Model rate limits.** One draft requests about 4,100 tokens; the free tier allows 8,000 per minute. A second alert within a minute can lose its draft (N-27).
- **Draft quality unmeasured.** 3 of 10 stored drafts were fully supported, 7 flagged, and one live response failed the schema (N-29).
- **Speed unmeasured.** The proposal's "under 90 seconds from alert to reviewed draft" has not been timed.
- **Local databases.** Everything uses local PostgreSQL; the move to RDS and DynamoDB is still ahead.
- **Self-injected faults are not production traffic.** All evaluation results will come from a controlled environment, as the proposal states.

## Next steps, in order

1. Migrations, then alert de-duplication and resolve handling; JSONB draft column.
2. Draft queue with retry on rate limits; tally flag reasons across stored drafts.
3. `PATCH` endpoint to edit and finalize a draft, then the dashboard screens from the wireframes.
4. On-call router and Telegram bot (nothing exists yet).
5. Event store and fetcher; deploy the BFF and engine in Minikube; deploy instrumented test services and run the chaos scenarios live for a real accuracy figure.
6. Cloud move (Terraform, Helm, ArgoCD, Vault, RDS, DynamoDB, EKS), integration, demo and write-up.
