# Perimeter BFF Server

Backend-For-Frontend (BFF) server for Project Perimeter, providing alert ingestion webhooks and UI orchestration.

## Prerequisites

- **Node.js**: v18.0.0 or higher
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

Receives Prometheus Alertmanager webhook notifications. Each firing alert is sent to the correlation engine (`CORRELATION_URL`, default `http://localhost:8000`) and stored as a row in `incidents` with its blast radius. If the engine is down the incident is still stored with status `correlation_failed`.

- **Method**: `POST`
- **Path**: `/api/v1/alerts/webhook`
- **Headers**: `Content-Type: application/json`
- **Response**: `202 Accepted` (or `400 Bad Request` if `alerts` array is missing)

**Example Request:**
```bash
curl -X POST http://localhost:3001/api/v1/alerts/webhook \
  -H "Content-Type: application/json" \
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
  "alert_count": 1
}
```

## Auth and Team Directory

Requires `DATABASE_URL` and `AUTH_SECRET`, and uses `CORRELATION_URL`, `WEBHOOK_SECRET`, `CORS_ORIGIN` and `TRUST_PROXY` (see `.env.example`). The database must have `deploy/db/init.sql` loaded.

| Method | Path | Who | Purpose |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/auth/login` | anyone | Body `{ "id": "10001", "password": "..." }`. Returns a token. Unknown IDs, malformed IDs and wrong passwords all get the same 401. The seed password for every demo user is `perimeter-dev` (dev only). |
| GET | `/api/v1/teams` | signed in | Admins see all teams. Team members see their own team. |
| GET | `/api/v1/teams/:teamId/members` | admin or that team | Members of a team. |
| GET | `/api/v1/members/:userId` | admin or same team | Returns `{ member: {...} }`. If the user is in several teams, pass `?team_id=` or get 409. |
| PATCH | `/api/v1/members/:userId/status` | admin only | Update `is_on_leave`, `on_call_status`, `seniority`, `skills`. Returns `{ member: {...} }`. Add `team_id` in the body when the user is in several teams (409 otherwise). |

Send the token as `Authorization: Bearer <token>`. The role is read from the database on every request, not trusted from the token.

## Tests

```bash
npm test                                         # unit tests only
TEST_DATABASE_URL=postgres://... npm test        # also runs API tests against a seeded database
```
