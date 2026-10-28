# Team update: what changed and how to get running

Read this before you start your Thursday tasks. A big change landed in `develop` (PR #39). Some things you may already have open or half-done now work differently.

## 1. What changed (the short version)

| Before | Now |
| :--- | :--- |
| Login with just an ID | Login needs `id` **and** `password` (seed password for every demo user: `perimeter-dev`, dev only) |
| Webhook open to anyone, only logged alerts | Webhook needs `Authorization: Bearer <WEBHOOK_SECRET>`, calls the correlation engine, and saves an **incident** in Postgres |
| Engine was only a Python library | Engine has an HTTP API: `POST /correlate` (port 8000) |
| Only Postgres in Docker | Postgres, engine and BFF all run in Docker (`./scripts/demo.sh`) |
| `services/correlation-engine` | **`services/correlation_engine`** (underscore) |
| `requirements.txt` had test tools | `requirements.txt` = runtime only, `requirements-dev.txt` = tests |
| `GET /members/:id` returned `{ member: [ ... ] }` | Returns `{ member: { ... } }` (one object) |
| Postgres password in the compose file | Password comes from your own `.env` file |
| CORS open to every site | Only `http://localhost:5173` (the Vite dev server) unless `CORS_ORIGIN` says otherwise |

## 2. Get set up (10 minutes)

1. Update your copy:

   ```bash
   git switch develop
   git pull --ff-only
   ```

   If you have a branch with work in progress, rebase it: `git switch your-branch && git rebase develop`. If you edited anything under `services/correlation-engine/`, git follows the rename, but check with `git status`.

2. Run the whole thing once to see it work (needs Docker Desktop running):

   ```bash
   ./scripts/demo.sh
   ```

   It creates a `.env` with random secrets, starts the stack, sends a fake alert and prints the stored incident, for example:

   ```
   CheckoutServiceHighLatency on checkout-service | open | checkout-service | ["checkout-service", "payment-gateway", ...]
   ```

   Stop it with `docker compose --env-file .env -f deploy/docker-compose.yml down` (add `-v` to also wipe the database).

3. Never commit `.env`. It is in `.gitignore`. Secrets in this repo are placeholders only.

## 3. Everyday commands

| I want to... | Run |
| :--- | :--- |
| Run the engine tests | `cd services/correlation_engine && pip install -r requirements-dev.txt && python3 -m pytest` |
| Run the engine API by itself | `cd services/correlation_engine && uvicorn src.api:app --port 8000` |
| See the mock telemetry summary | `cd services/correlation_engine && python -m src.mock` |
| Run the BFF tests (with the database) | start Postgres (step 2), then `cd services/bff-server && npm ci && TEST_DATABASE_URL=postgres://perimeter:<your POSTGRES_PASSWORD>@localhost:5432/perimeter_db npm test` |
| Run the BFF tests without a database | `cd services/bff-server && npm test` (the Postgres tests are skipped with a warning; CI never skips them) |
| Log in as the admin | `POST /api/v1/auth/login` with `{"id":"10001","password":"perimeter-dev"}` |
| Log in as a team member | `{"id":"100101","password":"perimeter-dev"}` |
| Send a test alert | `POST /api/v1/alerts/webhook` with header `Authorization: Bearer <WEBHOOK_SECRET from your .env>` and body `{"alerts":[{"status":"firing","labels":{"alertname":"Test","service":"checkout-service"}}]}` |

The BFF README (`services/bff-server/README.md`) lists every endpoint.

## 3b. Rules that now apply

- Pull requests go into `develop` and need one approval from someone else. CI must be green: tests (engine coverage must stay at 85% or more), lint (ruff, shellcheck, actionlint), security scans, Docker image builds.
- Use commit messages like `feat(router): score responders by skill`.
- Add a test with every change. The checks fail PRs that lower engine coverage.

## 4. Your Thursday tasks, updated

The tasks in `TEAM_ROLES.txt` still stand, but some got easier or changed. Anything not listed below is unchanged.

**David (Data)**
- Task 2 (seed all six services) is **already done**: `deploy/db/init.sql` now has all six mock services. Your job is to check it: load it into a fresh database, confirm each service has the owning team you expect, and fix anything that looks wrong.
- Task 1 (DynamoDB design) is still yours. The incident row in Postgres now holds `blast_radius` as JSON; say in your doc how raw events link to an incident ID.

**Jyothi (Backend and IAM)**
- Task 1 (review IAM): you now review a **password** login (`src/auth/password.ts`, `src/auth/routes.ts`), a 30-second role cache (`src/auth/middleware.ts`) and the webhook secret (`src/alerts/routes.ts`). Open your issue for anything unclear or unsafe.
- Task 2 (cross-team 403 test): this is **already covered** in `src/__tests__/api.test.ts` (a team member gets 403 for another team's member and for another team's member list). Replace it with a new test: the login response contains only `token` and `role`, and no endpoint ever returns `password_hash`.

**Manmitha (Frontend)**
- The login page must send `id` and `password` (`perimeter-dev` for the demo users). The API allows browser calls only from `http://localhost:5173`, so keep Vite on that port.
- The member endpoints return one object under `member`, not an array.

**Vivek (Router and bot)**
- The router can read what you need from Postgres: `incidents.blast_radius` (list of service names), `services.owning_team_id`, and `team_members` (skills, seniority, `is_on_leave`). Run the demo to see a real incident row.
- Your scoring spec should say which services in the blast radius belong to which team. The seed now has all six.

**Goutham (Testing and evaluation)**
- Your scoring function can call the engine for the found blast radius: `POST http://localhost:8000/correlate` with `{"service": "bank-network", "direction": "upstream"}`. `direction` is `downstream` (callees), `upstream` (callers) or `both`.
- Your scenarios should name a direction for each expected blast radius.

**Sriram (Lead)**
- Task 1 is done (PRs merged). Task 2 is done (`docs/llm-output-schema.md`).

## 5. Known limits (so nobody is surprised)

- The engine builds its graph from the **mock** spans when a request has none. There is no real trace store yet.
- The demo password and the seed data are for development only. Never load `deploy/db/init.sql` into a shared or real database.
- Kubernetes: Alertmanager is on and points at the BFF, but the BFF is not deployed in Minikube yet, so alert delivery there fails and retries.
- Rate limits are counted per process (in memory).
- Not built yet: signal compressor, the LLM call and validator, dashboards, router and Telegram bot, chaos harness, Terraform, ArgoCD, Vault.

## 6. If something breaks

- `docker compose ... up` says a variable is missing: you have no `.env`, or it lacks `POSTGRES_PASSWORD`, `AUTH_SECRET` or `WEBHOOK_SECRET`. Run `./scripts/demo.sh` once, or copy `.env.example` to `.env` and replace the `change_me` values.
- Login returns 401: check the password (`perimeter-dev`), and that your database was created from the new `init.sql` (run `down -v`, then `up` again).
- `ModuleNotFoundError` in the engine: you are in the old folder name or the wrong directory. Use `services/correlation_engine` and run commands from inside it.
- Webhook returns 401: the `Authorization: Bearer ...` value must match `WEBHOOK_SECRET` in your `.env`.
- Still stuck: post the exact command and error in the group chat by Wednesday so we can pair on it.
