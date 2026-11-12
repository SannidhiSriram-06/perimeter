# Perimeter codebase audit

**Date:** 2026-11-08 · **Commit:** `develop` @ `e2e34d7` (`main` @ `f6fc3f2` is the release merge of this same code) · **Replaces:** the audit of 2026-10-30 (`develop` @ `4d5f5ed`)

**Method:** read every source file in `services/`, `evaluation/`, `deploy/` and `scripts/`, ran every test suite and scanner, started the real stack with `./scripts/demo.sh`, and reproduced suspicious behaviour against the live engine, BFF and PostgreSQL. No source file was changed by the audit. Finding IDs (N-01 …) continue the 30 Oct numbering, so old references still work.

---

## 1. Verdict

**6 / 10. The pipeline runs end to end on mock data, but it is not yet a product.** (30 Oct: 5.5.)

1. **The core chain is real now.** One alert posted to the webhook produces a stored incident with a blast radius, then (in the background) a compressed context, one Groq call, a fact-checked draft saved on the incident, and a team-scoped `GET /api/v1/incidents`. On 30 Oct only the first step worked.
2. **Everything it reasons about is mock data.** The engine builds its graph, logs and metrics from hard-coded fixtures whenever the request carries none, and the BFF never sends any (N-03). So "traces the real dependency chain" is still not true.
3. **The visible product is missing.** No dashboard screens, no on-call router, no Telegram bot, no edit-and-finalize flow, no event store, no cloud deployment, no live chaos run, no real accuracy figure.
4. **Two High correctness bugs remain in code that exists:** duplicate incidents on every alert re-delivery with `resolved` ignored (N-01), and unknown services stored as a silent empty `open` incident (N-09). A new operational finding: one draft asks Groq for about 4.1K tokens, so the free tier (8K per minute) rejects bursts, and nothing retries (N-27).
5. **Fixed since 30 Oct:** N-02 (`both` over-broad), N-04 (validator ignored claim text), N-05 (malformed hash verified). All three have tests.

There are **no Critical findings**. Nothing found is remotely exploitable on the documented localhost-only setup.

Overall about **40%** of the proposal's scope is built and working (30 Oct estimate: 30%). The built part is the foundation and the hardest-to-fake core; the remaining 60% is what a user sees.

## 2. Checks run (real output, 8 Nov, macOS, Python 3.12, Node 26)

| Check | Result |
| :--- | :--- |
| Engine tests, `pytest tests/` | `177 passed` (includes the 16 chaos-harness tests via the hook in `tests/test_run_chaos.py`) |
| Evaluation tests, `pytest evaluation/tests` | `16 passed` (the same 16 tests, run directly) |
| Engine coverage | `TOTAL 605 statements, 3 missed, 99%` (CI gate: 85%) |
| `ruff check` | `All checks passed!` |
| `bandit -q -r src` | no findings |
| `pip-audit -r requirements.txt` | `No known vulnerabilities found` |
| BFF tests against Postgres 16 loaded from `init.sql` | `tests 45, pass 45, fail 0, skipped 0` |
| `npm audit --omit=dev` (BFF) | `found 0 vulnerabilities` |
| Dashboard `npm test` (vitest) | `8 passed` (2 files) |
| Dashboard `npm run build` | type-check and build OK, 185 kB JS |
| `./scripts/demo.sh` | exit 0: three images built, three containers healthy, alert accepted (202), incident stored with blast radius `checkout-service, payment-gateway, inventory-service, bank-network, frontend-proxy` |
| Secret scan of tracked files | no key, token or private-key patterns |

**Not run:** `shellcheck`, `actionlint` (not installed; CI runs them), Trivy image scan, Minikube/Helm (`deploy/k8s/up.sh`), Node 20 (CI and the Dockerfile use 20; I ran Node 26), SonarCloud/CodeQL results, GitHub branch-protection settings.

**Live probes** (stack from `demo.sh`):

| Probe | Result |
| :--- | :--- |
| Same firing alert (same `fingerprint`) posted 3 times | 3 incident rows; a `resolved` alert afterwards left all 3 `open` (N-01) |
| Alert for service `nope` | row stored `open`, `alert_service_id` NULL, `blast_radius []`, no draft (N-09) |
| `GET /health` | `X-Powered-By: Express`, no security headers (N-17) |
| Malformed JSON to `/auth/login` | 400 echoing `Expected property name or '}' in JSON at position 1` (N-17) |
| Engine `/correlate` with `parent_span_id: ["x"]`, `span_id: ["a"]`, `service_name: {"x":1}` | HTTP 500 for all three (N-10) |
| `both` direction: `bank-network` | `bank-network, payment-gateway, checkout-service, frontend-proxy`; `inventory-service` correctly absent (N-02 fixed) |
| `both` direction: `recommendation-engine` | itself only (chaos scenario 4 holds) |
| Drafts in the local dev database | 10 stored drafts: 3 `ok`, 7 `flagged`. Logs show one `rejected` draft (model output failed the JSON schema) and one Groq `429` (tokens per minute: limit 8000, used 6726, requested 4118) (N-27) |

## 3. Status of every finding from the 30 Oct audit

| ID | Sev | Status | Note |
| :--- | :--- | :--- | :--- |
| N-01 duplicate incidents, resolved ignored | High | **Open, confirmed again** | No `fingerprint` column anywhere in `init.sql` or `alerts/routes.ts` |
| N-02 `both` pulls in healthy siblings | High | **Fixed** | `service_graph.py:113-122` unions two single-direction runs; `test_direction.py` covers it |
| N-03 blast radius from mock fixtures | High | **Open** | `api.py:39` and `api.py:63-70` fall back to mock spans, logs and metrics; the BFF sends none |
| N-04 validator ignored claim text | High | **Fixed** | `render_claim_text` in `validator.py`; `draft.py` overwrites model text with rendered text (#60) |
| N-05 malformed hash verifies | Medium | **Fixed** | hex and length checks in `password.ts` (#59) |
| N-06 dev seed in every DB | Medium | Open | users and the `perimeter-dev` password live in `init.sql` |
| N-07 login lockout / shared IP | Medium | Open | unchanged; `TRUST_PROXY` still defaults to 0 |
| N-08 no retry after engine failure | Medium | Open | |
| N-09 unknown service stored as empty `open` | Medium | **Open, confirmed again** | |
| N-10 malformed spans give 500; no auth or size cap on the engine | Medium | **Open, confirmed again** | `/draft` is also unauthenticated and spends the Groq quota |
| N-11 two sources of truth for team membership | Medium | **Partly addressed** | `GET /incidents` now exists and is team-scoped (via `services.owning_team_id`, tested); authorization still reads `users.team_id`; `blast_radius` still lists other teams' service names |
| N-12 edges keep only `call_count`; no OTLP adapter | Medium | **Partly addressed** | The compressor ranks from spans directly (duration, status), so latency and errors reach the model. Graph edges still hold only `call_count`; OTLP payloads still do not load |
| N-13 no migrations | Medium | Open | `init.sql` is still the only schema file |
| N-14 weak "admin updates a member" test | Medium | Open | asserts only status 200 (`api.test.ts:97-109`) |
| N-15 no end-to-end CI job | Medium | Open | `demo.sh` ran fine locally, but CI only validates the compose file |
| N-16 prompt injection through log text | Medium | Open | `prompt.py` still embeds service-written messages |
| N-17 `X-Powered-By`, no headers, parser text echoed | Low | **Open, confirmed again** | |
| N-18 stale docs | Low | **Fixed in this update** | README, BFF README, SECURITY, roadmap, deploy and team docs rewritten (8 Nov) |
| N-19 CLI test asserts an unconditional string | Low | Open | `test_mock_cli.py:11` |
| N-20 unpinned Helm charts and images | Low | Open | `up.sh` has no `--version` |
| N-21 `.env` world-readable | Low | **Open, confirmed again** | mode `-rw-r--r--` on this machine; `chmod 600 .env` |
| N-22 Actions pinned by tag | Low | Open | |
| N-23 wall-clock assertion | Low | Open | `test_spans.py:72` |
| N-24 no BFF coverage gate or linter | Low | Open | |
| N-25 8 h tokens, no revocation | Low | Open | |
| N-26 `TIMESTAMP` without zone, free-text status, no audit table | Low | Open | |

## 4. New findings (8 Nov)

| ID | Sev | Category | Location | Problem | Fix | Effort |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| N-27 | **High** | Reliability / AI | `compressor.py:24`, `alerts/routes.ts:saveDraft`, `api.py:draft` | The default context budget is about 3,000 tokens, but the whole request (system prompt, schema, context, answer room) asked Groq for 4,118 tokens. The free tier allows 8,000 per minute, so about one draft per minute fits. Every alert starts its own draft with no queue, no backoff and no retry: a second alert inside a minute got a `429` and its incident has no draft forever. | A single-worker draft queue that spaces calls, retries on `429` after the advised delay, and a lower default budget; later, a self-hosted model | M |
| N-28 | Medium | Core pipeline | `api.py:63-70` | Logs and metrics also fall back to mock fixtures (re-timed to the alert), so a draft for any real alert is written from fictional evidence. Same root cause as N-03; listed separately because the draft is the visible output. | Event store and fetcher; refuse to draft without a source unless `PERIMETER_USE_MOCK=1` | L |
| N-29 | Medium | AI quality | `draft.py`, logs | One live draft was rejected because the model's JSON failed the schema (`1 validation error for Draft`), and 7 of 10 stored drafts are `flagged`. There are no retries by design. Not yet analysed: which rule trips most. | Tally flag reasons across stored drafts; tune the prompt; report the rate in the evaluation | M |
| N-30 | Medium | Data | `alerts/routes.ts`, `incidents/routes.ts` | `root_cause_draft` is a TEXT column holding a JSON string `{status, draft, validation}`. It cannot be queried or indexed, and the API returns it unparsed. | `JSONB` column with the next migration (N-13) | S |
| N-31 | Medium | Scope | `services/bff-server/src` | No endpoint lets an admin edit the hypothesis or mark an incident final, and incident `status` has no lifecycle. The proposal's walkthrough ends there. | `PATCH /incidents/:id` (admin) with status check; test | M |
| N-32 | Low | Docs / UX | `services/dashboard/src/pages` | `AdminHome` and `TeamHome` are placeholders. Login and route guards work and are tested. | Build the screens from `docs/wireframes/README.md` | L |
| N-33 | Low | Ops | `deploy/docker-compose.yml`, `scripts/demo.sh` | `demo.sh` reuses an existing `.env` and the persistent database volume, so running it on a developer machine writes into real dev data and uses the real `GROQ_API_KEY`. (This audit did exactly that and removed its 5 test rows.) | Use a separate compose project name and volume for the demo, or print a warning | S |

## 5. Details for the open High findings

### N-01: duplicate incidents, resolved alerts ignored
`services/bff-server/src/alerts/routes.ts:95-125`. Every non-resolved alert runs `INSERT INTO incidents` and a draft. Alertmanager re-sends a firing alert every `repeat_interval` (4 h in `prometheus-values.yaml`) and each re-send spends a model call. The `resolved` notification is filtered out, so incidents never close.
**Fix:** add `fingerprint text` plus `CREATE UNIQUE INDEX uq_open_incident ON incidents(fingerprint) WHERE status = 'open'`; firing does `INSERT … ON CONFLICT DO NOTHING RETURNING id` and drafts only when a row was inserted; resolved does `UPDATE … SET status = 'resolved'`. Needs a migration first (N-13).

### N-03 / N-28: mock fixtures behind every answer
`services/correlation_engine/src/api.py:39,63-70`. Fixtures are documented as a shortcut, but nothing marks a result as mock-derived.
**Fix until a trace store exists:** return 503 when no spans are supplied unless `PERIMETER_USE_MOCK=1`, and set that flag in `docker-compose.yml` and the tests so the demo still works.

### N-27: draft burst limit
Seen live: `Rate limit reached for model openai/gpt-oss-120b … TPM: Limit 8000, Used 6726, Requested 4118`. The webhook returns 202 first, so the alert is safe; only the draft is lost. The progress report already names the compressor as the fix; the compressor is built, and the remaining gap is spacing and retrying calls.

## 6. Proposal versus code

| Component (proposal) | State in code | % |
| :--- | :--- | :--- |
| Dependency graph + BFS blast radius | BFS, cycle-safe, three directions, span loader. Missing: real trace source, OTLP adapter, edge metadata | 75 |
| Mock telemetry and alert fixtures | Spans, logs, metrics; logs and metrics re-timed to the alert | 90 |
| Alert ingestion (webhook → engine → DB → draft) | Auth, store, blast radius, background draft. Missing: dedup, resolve, retry, unknown-service handling | 55 |
| Correlation engine HTTP API | `/health`, `/correlate`, `/draft`. Missing: span typing, auth, size cap | 65 |
| IAM auth service | scrypt login, server-side role lookup, generic errors, rate limits. Missing: revocation, single membership source | 75 |
| Team Directory (data + API) | Schema, read, admin update. Not used by any router yet | 70 |
| PostgreSQL schema | Users, teams, members, services, incidents. Missing: fingerprint, JSONB draft, audit table, migrations | 55 |
| Raw event store (DynamoDB per proposal; MongoDB per design) | Design only (`docs/design/Event_Store_Design.md`) | 10 |
| Signal compressor | Scoring, ranking, budget trimming, 23 tests. Runs on fixture logs and metrics | 80 |
| LLM call (Groq, schema-constrained) | Prompt, client, strict schema, live calls made. Rate-limit handling missing | 75 |
| Fact-checking validator | All claim types and draft rules; claim text rendered from checked fields; 65 tests | 95 |
| End-to-end pipeline | Alert → radius → compress → draft → validate → store, automatic, on mock data | 70 |
| On-call router | Nothing | 0 |
| Telegram bot | Nothing (placeholders in `.env.example`) | 0 |
| React dashboards | Vite shell, login, role guards, placeholder pages; 8 tests | 10 |
| Edit and finalize | Nothing | 0 |
| Chaos harness | 3 Chaos Mesh manifests, 4 scenarios, execution harness; dry-run only | 60 |
| Accuracy benchmark | Scorer, ground truth, offline results (mock against mock) | 70 |
| Containers + compose | Three images, compose stack, non-root, health checks; demo passes | 85 |
| Minikube observability | Prometheus, Alertmanager, Grafana, OTel Collector. BFF and engine not deployed there | 65 |
| CI/CD | Tests, lint, scans, image build, coverage gate. No registry push, no ArgoCD | 50 |
| Terraform / Vault / ArgoCD / ECR / RDS / DynamoDB | Nothing | 0 |
| Docs, contracts, governance | README, roadmap, security, deploy, schema, wireframes, this report | 90 |

## 7. Remediation order

**Fix now (small):** N-21 (`chmod 600 .env`), N-17 (`app.disable('x-powered-by')`, generic 400), N-09 (status `no_blast_radius`), N-14, N-19.
**Next:** N-13 migrations → N-01 dedup/resolve → N-30 JSONB draft. In parallel N-27 draft queue with 429 retry, then N-31 edit/finalize endpoint so the dashboard can be built.
**Then:** the dashboard screens (N-32), the on-call router and Telegram bot (0% today), N-11 single membership source, N-15 end-to-end CI job.
**Later:** N-03/N-28 real trace and event sources, live chaos run and measured accuracy, N-10 hardening, cloud move.

## 8. What is done well

- **Auth is careful:** scrypt with random salts, dummy hash for unknown IDs, `timingSafeEqual` for tokens and the webhook secret, generic 401s, role read from the database (30 s cache).
- **The validator is the project's strongest piece:** every claim type has a rule and a test, model-written claim text is replaced by text built from checked fields, and failures are flagged and saved instead of discarded.
- **Honest labelling:** `shortcut:` comments, README status table and the offline-score caveats say plainly what is faked.
- **Tests are real:** 177 + 45 + 8 passing, the BFF tests run against a real Postgres and CI fails rather than skips them, coverage gate at 85% (actual 99%).
- **Supply chain and containers:** hash-pinned engine lockfile, non-root images, health checks, `npm audit` and `pip-audit` clean.
- **SQL is parameterised everywhere.**

## 9. Unverified items and assumptions

- **Live model quality.** Drafts were produced by Groq `openai/gpt-oss-120b` (stored drafts exist), but no accuracy was measured; N-29 is a count of flags, not an error analysis.
- **The "under 90 seconds" claim** is untimed.
- **Free-tier limits** were observed in one error message, not from Groq's documentation.
- **Alertmanager → BFF delivery** in a cluster: the BFF is not deployed there; not testable.
- **GitHub settings** (branch protection, CODEOWNERS validity, CodeQL) were not inspected.
- **Side effects of this audit:** I started Docker Desktop; ran a throwaway Postgres container (removed); ran `demo.sh`, which used the existing `.env` and local database volume, inserted 5 incident rows and made a few Groq calls. I deleted those 5 rows; the other 14 incidents were left untouched, and the stack is stopped (volume kept).
