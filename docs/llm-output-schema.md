# LLM output contract and validator claim types

This page defines what goes into the single LLM call and what must come back. It is the contract between the signal compressor (input), the LLM step, and the fact-checking validator (output check). Nothing here is built yet.

## Rules for the call

- One call per incident. Temperature 0. Output must be JSON that matches the schema below, nothing else.
- The call goes to Groq (free tier) with `openai/gpt-oss-120b` and strict structured outputs. Strict mode needs every field present, so fields that do not apply to a claim type are sent as `null`. The free tier allows 8K tokens per minute for this model, which is why the context object has a token budget.
- The model sees only the **context object**. It never sees raw logs, the database, or other incidents.
- Every statement of fact in the output is a **claim** that cites evidence IDs from the context object. Free text without a claim is allowed only in `narrative` fields and carries no factual weight.
- The validator never edits the output. It marks each claim `supported` or `unsupported` and the dashboard shows the flags to the human reviewer.

## Context object (input)

Built by the signal compressor from the blast radius. All IDs are stable strings so the validator can look them up.

```json
{
  "incident_id": "inc-0001",
  "alert": {
    "alertname": "CheckoutServiceHighLatency",
    "service": "checkout-service",
    "fired_at": "2026-10-12T16:00:00Z"
  },
  "blast_radius": ["checkout-service", "payment-gateway", "bank-network", "inventory-service"],
  "trace_edges": [
    {"id": "edge-1", "source": "checkout-service", "target": "payment-gateway"},
    {"id": "edge-2", "source": "payment-gateway", "target": "bank-network"},
    {"id": "edge-3", "source": "checkout-service", "target": "inventory-service"}
  ],
  "evidence": [
    {"id": "span-co-02", "kind": "span", "service": "checkout-service", "duration_ms": 4350.0, "status_code": 500, "message": "Payment processing failed in payment-gateway"},
    {"id": "span-pg-03", "kind": "span", "service": "payment-gateway", "duration_ms": 4200.0, "status_code": 500, "message": "Upstream bank network connection timed out"},
    {"id": "span-bn-04", "kind": "span", "service": "bank-network", "duration_ms": 4000.0, "status_code": 504, "message": "Gateway Timeout: socket read timeout after 4000ms"},
    {"id": "span-inv-06", "kind": "span", "service": "inventory-service", "duration_ms": 48.0, "status_code": 200, "message": "OK"}
  ]
}
```

`evidence.kind` is `span`, `log` or `metric`. Logs carry `timestamp` and `message`; metrics carry `name`, `value` and `timestamp`. The compressor keeps the total under the token budget; the validator receives the same object, so it checks against exactly what the model saw.

The pipeline builds this object without the signal compressor for now: one slowest span per service in the blast radius plus the trace edges between them, with no logs or metrics. The compressor replaces that step later; the shape does not change.

Blast radius size: the alert webhook asks the engine for `both` directions, so an alert on `checkout-service` covers five services in the mock graph (callers like `frontend-proxy` and callees down to `bank-network`). The proposal's walkthrough lists three services; it is a simplified illustration and the mock graph, the benchmark's ground truth and the chaos scenarios all use the fuller six-service topology.

Services outside `blast_radius` (for example `recommendation-engine` in the mock data, which has errors but no trace edge to checkout) are not in the context at all.

## Output schema (JSON Schema, draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["incident_id", "hypothesis", "claims", "postmortem"],
  "properties": {
    "incident_id": {"type": "string"},
    "hypothesis": {
      "type": "object",
      "additionalProperties": false,
      "required": ["root_cause_service", "cascade_path", "summary", "confidence"],
      "properties": {
        "root_cause_service": {"type": "string"},
        "cascade_path": {"type": "array", "items": {"type": "string"}, "minItems": 1},
        "summary": {"type": "string", "maxLength": 500},
        "confidence": {"enum": ["low", "medium", "high"]}
      }
    },
    "claims": {
      "type": "array",
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "type", "text", "evidence_ids"],
        "properties": {
          "id": {"type": "string"},
          "type": {"enum": ["service_ref", "causal_edge", "metric_value", "latency", "status_code", "timestamp"]},
          "text": {"type": "string", "maxLength": 300},
          "evidence_ids": {"type": "array", "items": {"type": "string"}},
          "service": {"type": "string"},
          "source": {"type": "string"},
          "target": {"type": "string"},
          "value": {"type": "number"},
          "unit": {"enum": ["ms", "s", "count", "percent"]},
          "status_code": {"type": "integer"},
          "timestamp": {"type": "string", "format": "date-time"}
        }
      }
    },
    "postmortem": {
      "type": "object",
      "additionalProperties": false,
      "required": ["summary", "impact", "timeline", "contributing_factors", "next_steps"],
      "properties": {
        "summary": {"type": "string", "maxLength": 800},
        "impact": {"type": "string", "maxLength": 500},
        "timeline": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["time", "event", "claim_ids"],
            "properties": {
              "time": {"type": "string", "format": "date-time"},
              "event": {"type": "string", "maxLength": 300},
              "claim_ids": {"type": "array", "items": {"type": "string"}}
            }
          }
        },
        "contributing_factors": {"type": "array", "items": {"type": "string", "maxLength": 300}},
        "next_steps": {"type": "array", "items": {"type": "string", "maxLength": 300}}
      }
    }
  }
}
```

Structure checks happen first: if the JSON does not match the schema, the draft is rejected and the incident shows "draft failed validation" with the raw response kept for debugging. There are no retries with a higher temperature.

## Claim types the validator checks

Each claim is checked against the context object only. A claim is `supported` when every rule for its type passes, and it cites only evidence IDs that exist in the context.

| Type | What the claim says | Rule for "supported" |
| :--- | :--- | :--- |
| `service_ref` | A service was involved | `service` is in `blast_radius` |
| `causal_edge` | A called B | An edge with that `source` and `target` is in `trace_edges` |
| `latency` | A service took N ms | Cited span is for that `service`, and `value` matches its `duration_ms` within 5% |
| `status_code` | A service returned code N | Cited span is for that `service` and has that `status_code` |
| `metric_value` | A metric had value N | Cited metric evidence has the same `name` and `value` within 5% |
| `timestamp` | Something happened at time T | `timestamp` is within the incident window (fired_at minus 15 minutes to fired_at plus 15 minutes) and within 5 seconds of a cited log or metric timestamp |

Extra rules that apply to the whole draft:

1. `hypothesis.root_cause_service` and every entry in `cascade_path` must be in `blast_radius`.
2. Consecutive services in `cascade_path` must be connected by a `trace_edges` entry.
3. Every `postmortem.timeline[].claim_ids` entry must refer to a claim in `claims`, and that claim must be `supported` for the timeline row to show without a warning. A row with no `claim_ids` also gets the warning, and a claim with no `evidence_ids` is unsupported. The model API ignores `minItems`, so these are flagged instead of rejecting the whole draft.
4. Any service name in free text that is not in `blast_radius` is flagged (simple string match against the known service list).

## Worked example

Output for the context above (mock checkout cascade):

```json
{
  "incident_id": "inc-0001",
  "hypothesis": {
    "root_cause_service": "bank-network",
    "cascade_path": ["checkout-service", "payment-gateway", "bank-network"],
    "summary": "bank-network timed out after 4000ms, which stalled payment-gateway and then checkout-service.",
    "confidence": "medium"
  },
  "claims": [
    {"id": "c1", "type": "causal_edge", "text": "payment-gateway calls bank-network", "evidence_ids": ["edge-2"], "source": "payment-gateway", "target": "bank-network"},
    {"id": "c2", "type": "status_code", "text": "bank-network returned 504", "evidence_ids": ["span-bn-04"], "service": "bank-network", "status_code": 504},
    {"id": "c3", "type": "latency", "text": "payment-gateway took 4200ms", "evidence_ids": ["span-pg-03"], "service": "payment-gateway", "value": 4200, "unit": "ms"}
  ],
  "postmortem": {
    "summary": "Checkout requests failed because the bank network connection timed out.",
    "impact": "Checkout requests returned HTTP 500 during the incident window.",
    "timeline": [
      {"time": "2026-10-12T16:00:00Z", "event": "Latency alert fired on checkout-service", "claim_ids": ["c3"]}
    ],
    "contributing_factors": ["No fallback or shorter timeout on the payment-gateway to bank-network call"],
    "next_steps": ["Add a circuit breaker on the bank-network call", "Alert on bank-network 504 rate"]
  }
}
```

Validator result: `c1`, `c2` and `c3` are supported (edge exists, span codes and durations match). If the model had written "recommendation-engine caused the failure", rule 1 and rule 4 flag it, because that service is outside the blast radius.

## Not decided yet

- Whether the 5% tolerance is right. The chaos benchmark (Goutham's work) will show how often correct drafts get flagged.
- Whether `confidence` should be dropped. A self-reported confidence is not evidence, so the dashboard should not rely on it.
- The exact token budget for the context object. That comes from the signal compressor.
