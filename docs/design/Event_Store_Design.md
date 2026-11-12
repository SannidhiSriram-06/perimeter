# Event Store Design: Local MongoDB Event Stream for Telemetry

## 1. Overview & Architecture Direction
Perimeter is designed for self-hosted local and cluster execution. **Raw telemetry events (logs, metrics, and trace spans) never leave the local environment or cluster boundary.** 

Relational data (incidents, team directory, and IAM authentication) remains strictly in **PostgreSQL** (or SQLite in lightweight tests). High-throughput raw event streams are stored in a local **MongoDB** instance (`events` collection) running within the local Docker Compose / cluster stack and bound only to `localhost` / internal Docker network.

The **Signal Compressor** queries this event store to extract bounded telemetry for services in a blast radius during incident triage:
> **Core Query Pattern**: *"Fetch all telemetry events for a given set of services in the 15-minute window preceding or during an incident."*

---

## 2. Document Schema: `events` Collection

Each document in the `events` collection represents an individual telemetry signal (log record, span, or metric measurement).

```json
{
  "_id": {"$oid": "6722d4f8e1b2c3d4e5f6a7b8"},
  "service": "checkout-service",
  "ts": {"$date": "2026-10-30T22:15:00.000Z"},
  "event_type": "span",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "parent_span_id": "5fb397be34d23b0f",
  "status_code": 500,
  "duration_ms": 4200,
  "severity": "ERROR",
  "payload": {
    "http.method": "POST",
    "http.route": "/checkout",
    "error.message": "Upstream timeout calling payment-gateway"
  },
  "incident_ids": ["c3d9a1f0-2810-4e52-b892-749e7bdfa112"]
}
```

### Field Definitions:
- `service` (`string`, required): Identifier of the microservice (e.g. `checkout-service`).
- `ts` (`Date`, required): BSON UTC timestamp of event occurrence.
- `event_type` (`string`, required): Category of telemetry (`"span"` | `"log"` | `"metric"`).
- `trace_id` (`string`, optional): OpenTelemetry Trace ID for cross-service distributed trace correlation.
- `span_id` (`string`, optional): OpenTelemetry Span ID.
- `parent_span_id` (`string`, optional): Parent span ID for tree reconstruction.
- `status_code` (`int`, optional): Response code (e.g., `200`, `500`).
- `duration_ms` (`double` / `int`, optional): Latency or duration in milliseconds.
- `severity` (`string`, optional): Log severity (`"INFO"`, `"WARN"`, `"ERROR"`, `"FATAL"`).
- `payload` (`object`, required): JSON context (attributes, message, tags, stack traces).
- `incident_ids` (`array of strings`, indexed): List of UUIDs of incidents to which this event has been correlated or attributed.

---

## 3. Indexes & Access Patterns

To guarantee sub-millisecond retrieval without in-memory sorting or collection scans, the following indexes are declared:

### 1. Compound Index for Blast Radius & Time Range
```javascript
db.events.createIndex(
  { service: 1, ts: -1 },
  { name: "idx_service_ts" }
);
```
- **Purpose**: Powers the core 15-minute signal compressor query for one or more services.

### 2. TTL Index for In-Cluster Data Retention
```javascript
db.events.createIndex(
  { ts: 1 },
  { expireAfterSeconds: 172800, name: "idx_ttl_retention" }
);
```
- **Retention Policy**: Targets an approximate 48-hour (172,800s) retention window.
- **Important**: MongoDB TTL background threads run periodically (typically once per minute), meaning document eviction is asynchronous rather than instantaneous to the second. Therefore, all read queries must explicitly filter by time range (`$gte`, `$lte`) rather than assuming older data is immediately purged.

### 3. Trace ID Index for Distributed Trace Inspection
```javascript
db.events.createIndex(
  { trace_id: 1 },
  { name: "idx_trace_id", sparse: true }
);
```
- **Purpose**: Allows jumping directly from a root-cause hypothesis back to all spans in an end-to-end trace across microservices.

### 4. Incident Correlation Index
```javascript
db.events.createIndex(
  { incident_ids: 1, ts: -1 },
  { name: "idx_incident_events" }
);
```
- **Purpose**: Fast retrieval of all raw events linked to a specific incident ID.

---

## 4. Query Specifications for the Signal Compressor

### A. Fetch 15-Minute Window for a Single Service
```javascript
const tStart = new Date(Date.now() - 15 * 60 * 1000);
const tEnd = new Date();

db.events.find({
  service: "checkout-service",
  ts: { $gte: tStart, $lte: tEnd }
}).sort({ ts: -1 });
```

### B. Fetch 15-Minute Window for All Services in a Blast Radius
When the BFS engine returns a blast radius (e.g., `["frontend-proxy", "checkout-service", "payment-gateway", "bank-network"]`):
```javascript
const blastRadius = ["frontend-proxy", "checkout-service", "payment-gateway", "bank-network"];
const tStart = new Date(Date.now() - 15 * 60 * 1000);
const tEnd = new Date();

db.events.find({
  service: { $in: blastRadius },
  ts: { $gte: tStart, $lte: tEnd }
}).sort({ service: 1, ts: -1 });
```

### C. Fetch Events Linked Directly to an Incident
```javascript
db.events.find({
  incident_ids: "c3d9a1f0-2810-4e52-b892-749e7bdfa112"
}).sort({ ts: -1 });
```

---

## 5. Linking Events to Incidents

Incidents live in **PostgreSQL** with a UUID primary key (`incidents.id`). Telemetry events link to incidents in MongoDB through the `incident_ids` array:
1. **At Triage Time**: When an alert fires and an incident record is created in PostgreSQL (`INSERT INTO incidents (id, title, alert_service_id, blast_radius, ...) VALUES ($1, ...)`), the Signal Compressor executes query **4.B** for the blast-radius services over the 15-minute window.
2. **Correlation Tagging**: Any events selected as evidence or root-cause signals are tagged with the PostgreSQL incident ID:
   ```javascript
   db.events.updateMany(
     { _id: { $in: selectedEventIds } },
     { $addToSet: { incident_ids: incidentId } }
   );
   ```
3. **Subsequent Retrieval**: The BFF or Incident Review dashboard can call query **4.C** (`incident_ids: incidentId`) to immediately display the raw audit trail behind any generated report.

---

## 6. Sizing, In-Cluster Security & Volume Estimates

### Privacy & Boundary:
- The MongoDB container runs strictly within the local Docker Compose stack (`perimeter-network`), bound only to `127.0.0.1:27017` on the developer machine and unreachable outside the host.
- Raw events never leave the cluster boundary; only token-budgeted, fact-checked postmortem drafts leave for reviewer presentation.

### Volume & Memory Estimation for Demo Benchmark:
- In our test cluster (6 microservices), baseline activity plus synthetic chaos injection generates roughly **60–120 events per service per minute** (mostly spans and error logs).
- For 6 services over a 15-minute triage window:
  - Total events in active window = $6 \times 100 \times 15 = 9,000\text{ documents}$.
  - Average document size = $\approx 800\text{ bytes}$.
  - Working set size for 15 minutes = $\approx 7.2\text{ MB}$.
- Over 48 hours before TTL eviction:
  - $\approx 1.7\text{ million documents}$ totaling $\approx 1.4\text{ GB}$ of uncompressed storage.
  - The compound index `{ service: 1, ts: -1 }` requires $\approx 45\text{ MB}$ of RAM, easily fitting within lightweight local Docker development resources.
