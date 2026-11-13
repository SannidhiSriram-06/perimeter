# Perimeter BFF Server

Backend-For-Frontend (BFF) server for Project Perimeter: alert ingestion, IAM login, the Team Directory and the incidents API. The dashboard talks only to this service.

## Prerequisites

- **Node.js**: 20 or higher (CI and the Dockerfile use 20)
- **npm**: v9.0.0 or higher

## Installation

Install dependencies:

```bash
cd services/bff-server
npm install
```

## Running the Server

### Development Mode

Run with live reloading using `ts-node-dev`:

```bash
npm run dev
```

The server will listen on `http://localhost:3001` by default (or the port specified in `PORT` environment variable).

### Production Build & Run

Compile TypeScript to JavaScript and run:

```bash
npm run build
npm start
```

## API Endpoints

### 1. Health Check

Checks if the BFF service is up and responsive.

- **Method**: `GET`
- **Path**: `/health`
- **Response**: `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2026-10-12T10:14:00.000Z",
  "service": "perimeter-bff"
}
```

**Example Request:**
```bash
curl -X GET http://localhost:3001/health
```

### 2. Alert Webhook Ingestion

Receives Prometheus Alertmanager webhook notifications. Each firing alert is sent to the correlation engine (`CORRELATION_URL`, default `http://localhost:8000`) for its blast radius (`both` directions) and stored as a row in `incidents`. If the engine is down the incident is still stored with status `correlation_failed` and an empty blast radius. After the response is sent, the BFF asks the engine's `/draft` for a root-cause draft and saves it in `incidents.root_cause_draft` as JSON text `{status, draft, validation}` (only `ok` and `flagged` drafts are saved; without `GROQ_API_KEY` on the engine there is no draft).

- **Method**: `POST`
- **Path**: `/api/v1/alerts/webhook`
- **Headers**: `Content-Type: application/json` and `Authorization: Bearer <WEBHOOK_SECRET>` (401 without it)
- **Limits**: body up to 1 MB, at most 100 alerts per request (400 otherwise)
- **Response**: `202 Accepted` with the new incident IDs

**Known limits:** resolved alerts are ignored and a re-delivered firing alert creates another incident and another draft (no de-duplication yet); an alert for a service unknown to the engine is stored `open` with an empty blast radius.

**Example Request:**
```bash
curl -X POST http://localhost:3001/api/v1/alerts/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -d '{
    "version": "4",
    "status": "firing",
    "alerts": [
      {
        "status": "firing",
        "labels": {
          "alertname": "HighLatency",
          "service": "checkout-service",
          "severity": "critical"
        },
        "annotations": {
          "summary": "High latency detected on checkout-service"
        }
      }
    ]
  }'
```

**Example Response:**
```json
{
  "status": "accepted",
  "alert_count": 1,
  "incident_ids": ["21237a51-7560-47a9-8c9a-56e3b554c4dc"]
}
```

## Auth and Team Directory

Requires `DATABASE_URL`, `AUTH_SECRET` and `WEBHOOK_SECRET` (each secret must be at least 32 random characters; placeholders such as `change_me...` are refused at startup), and uses `CORRELATION_URL`, `WEBHOOK_SECRET`, `CORS_ORIGIN` and `TRUST_PROXY` (see `.env.example`). The database must have `deploy/db/init.sql` loaded.

| Method | Path | Who | Purpose |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/auth/login` | anyone | Body `{ "id": "10001", "password": "..." }`. Returns a token. Unknown IDs, malformed IDs and wrong passwords all get the same 401. The seed password for every demo user is `perimeter-dev` (dev only). |
| GET | `/api/v1/teams` | signed in | Admins see all teams. Team members see their own team. |
| GET | `/api/v1/teams/:teamId/members` | admin or that team | Members of a team. |
| GET | `/api/v1/members/:userId` | admin or same team | Returns `{ member: {...} }`. If the user is in several teams, pass `?team_id=` or get 409. |
| PATCH | `/api/v1/members/:userId/status` | admin only | Update `is_on_leave`, `on_call_status`, `seniority`, `skills`. Returns `{ member: {...} }`. Add `team_id` in the body when the user is in several teams (409 otherwise). |
| GET | `/api/v1/incidents` | signed in | Newest 100 incidents with `blast_radius`, `root_cause_draft` and `service_name`. Admins see all. Team members see only incidents whose alerting service their team owns; incidents on unknown services are admin-only. |
| GET | `/api/v1/evaluation/results` | admin only | Reads evaluation benchmark and chaos execution summary records from `EVALUATION_RESULTS_DIR` (default: `evaluation/benchmark/results`). Team members get 403. Corrupt or unreadable files are skipped. |

Send the token as `Authorization: Bearer <token>`. The role is never trusted from the token: it is read from the database and cached for 30 seconds per process, so a changed or deleted user loses access within 30 seconds. Tokens last 8 hours and cannot be revoked. Limits per IP and 15 minutes: 10 failed logins, 600 API requests.

## Tests

```bash
npm test                                         # unit tests; the Postgres tests are skipped with a warning
TEST_DATABASE_URL=postgres://... npm test        # also runs the API tests against a database loaded from deploy/db/init.sql (45 tests)
```

In CI (`CI=true`) a missing `TEST_DATABASE_URL` fails the run instead of skipping.
