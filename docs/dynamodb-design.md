# DynamoDB Schema & Access Pattern Design for Event Streams

## 1. Overview & Requirements
Perimeter ingests high-volume telemetry (logs, metrics, and distributed trace spans) directly within the local environment/cluster. In accordance with Perimeter architecture rules, **raw telemetry data never leaves the cluster**. 

The **Signal Compressor** component requires fast, bounded queries to retrieve recent telemetry for services identified during blast-radius calculation. Specifically, it must answer the critical access pattern:
> **"Fetch all events (logs, metrics, spans) for a given set of services in the last 15 minutes."**

---

## 2. Table Design: Single-Table Architecture

- **Table Name**: `perimeter-event-stream`
- **Billing Mode**: On-Demand (`PAY_PER_REQUEST`)
- **TTL Attribute**: `ttl` (Unix epoch seconds) to automatically purge raw events after retention expires (e.g., 24–48 hours) without leaving the cluster.

### Primary Keys:
| Attribute | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| **PK** (Partition Key) | `String` | Service-partition identifier formatted as `SERVICE#<service_name>` | `SERVICE#checkout-service` |
| **SK** (Sort Key) | `String` | Timestamp and event unique identifier formatted as `TS#<ISO8601>#<event_id>` | `TS#2026-10-30T22:30:00.000Z#span-7f3b89` |

### Attributes:
- `service_name` (`String`): Identifier of the microservice (e.g. `checkout-service`).
- `timestamp` (`Number` or `String`): Event generation timestamp (Unix epoch milliseconds or ISO 8601).
- `event_type` (`String`): Type of telemetry item (`LOG` | `METRIC` | `SPAN`).
- `trace_id` (`String`, optional): OpenTelemetry Trace ID (for distributed tracing correlation).
- `span_id` (`String`, optional): OpenTelemetry Span ID.
- `parent_span_id` (`String`, optional): Parent span reference.
- `status_code` (`Number`, optional): HTTP or gRPC response status (e.g., `500`, `200`).
- `duration_ms` (`Number`, optional): Execution or latency measurement.
- `severity` (`String`, optional): Log level (`INFO`, `WARN`, `ERROR`, `FATAL`).
- `payload` (`Map` / `String`): Compact JSON payload or message context.
- `ttl` (`Number`): Epoch timestamp in seconds for automatic data retention pruning.

---

## 3. Secondary Indexes (GSI)

### Global Secondary Index: `GSI_TraceCorrelation`
For trace-level diagnostics across multi-service hops:
- **Partition Key (GSI_PK)**: `TRACE#<trace_id>`
- **Sort Key (GSI_SK)**: `TS#<timestamp>`
- **Projection**: `ALL` or `KEYS_ONLY` with essential latency & status attributes.

---

## 4. Primary Access Pattern & Query Strategy

### Access Pattern: "Fetch all events for service X in the last 15 minutes"

Because the Primary Key partitions directly on `SERVICE#<service_name>`, the signal compressor can perform direct, isolated `Query` operations without performing full table scans.

#### Query Specification:
```json
{
  "TableName": "perimeter-event-stream",
  "KeyConditionExpression": "PK = :pk AND SK BETWEEN :start_ts AND :end_ts",
  "ExpressionAttributeValues": {
    ":pk": {"S": "SERVICE#checkout-service"},
    ":start_ts": {"S": "TS#2026-10-30T22:15:00.000Z"},
    ":end_ts": {"S": "TS#2026-10-30T22:30:00.000Z"}
  },
  "ScanIndexForward": true
}
```

### Multi-Service Blast Radius Fetching:
When the correlation engine identifies a blast radius involving multiple services (e.g., `["checkout-service", "payment-gateway", "bank-network"]`):

1. **Parallel Queries (Recommended)**:
   The Signal Compressor issues concurrent `Query` calls (one per service in the blast radius) using asynchronous I/O (`asyncio` / `aiobotocore` in Python).
   - Each query scans strictly the target service partition for the 15-minute window (`SK BETWEEN :t_minus_15 AND :now`).
   - Results are streamed and merged in memory with low latency.

2. **Batch / Filter Options**:
   If filtering by event category (e.g., only `event_type = 'SPAN'` or error logs `severity = 'ERROR'`), use a `FilterExpression`:
   ```text
   FilterExpression = "event_type = :event_type OR severity = :err_level"
   ```

---

## 5. Retention & Privacy Guardrails
1. **Cluster Boundary**: DynamoDB Local / AWS DynamoDB VPC endpoint strictly routes internal VPC telemetry.
2. **TTL Auto-Purge**: Telemetry expires after 48 hours via DynamoDB Native TTL on attribute `ttl`, keeping storage lean and fully meeting retention rules.
