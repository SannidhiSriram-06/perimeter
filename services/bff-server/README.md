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

Receives Prometheus Alertmanager webhook notifications and logs alerts for downstream processing.

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
