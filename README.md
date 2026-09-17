# Perimeter 🛡️

> **Self-Hosted, Auditable Incident Correlation & On-Call Intelligence for Kubernetes**  
> *Watching every edge of your infrastructure, from inside it.*

[![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-F5A800?logo=opentelemetry&logoColor=white)](https://opentelemetry.io/)
[![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?logo=prometheus&logoColor=white)](https://prometheus.io/)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://python.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)

---

## 📌 Problem Overview

When a microservice fails in production, two critical bottlenecks emerge:

1. **20–40 minutes wasted on manual triage**: Engineers dig through siloed logs, metrics, and distributed traces. Traditional tools correlate based on broad time windows, dragging in unrelated noisy signals rather than tracing real causal chains.
2. **Static, blunt escalation lists**: Paging systems follow static rosters that ignore actual service ownership, skill profiles, seniority, and availability/leave status.

### The SaaS Bottleneck
Commercial solutions (PagerDuty Advance, Datadog Watchdog, Dynatrace Davis AI) are closed-source, carry steep per-seat **"AI taxes"** (~$415+/user/month on top of base tiers), and are **SaaS-only**. For regulated industries (BFSI, government, healthcare), routing raw production telemetry to external cloud services violates data sovereignty mandates.

---

## 💡 Solution: Perimeter

**Perimeter** is a self-hosted, data-sovereign alternative that runs 100% inside your Kubernetes cluster:

- 🔍 **Deterministic Blast-Radius Scoping**: Walks OpenTelemetry trace edges using Breadth-First Search (BFS) starting from the alerting service, isolating only causally linked microservices.
- 📉 **Budget-Aware Signal Compression**: Ranks telemetry by anomaly severity and graph proximity, trimming hundreds of signals into a compact context (~40 high-value items) fitting strict LLM token budgets.
- 🤖 **Auditable AI Postmortems**: Calls an LLM (`temperature=0`, strict JSON schema) to generate a first-pass root-cause hypothesis and postmortem draft.
- 🛡️ **Zero-Hallucination Fact Checker**: Deterministically validates that every service, metric, and anomaly cited by the LLM exists in the provided context before publishing.
- 📱 **Intelligent On-Call Router**: Evaluates team ownership, skills, seniority, and leave status to page a balanced responder pair (e.g., 1 Senior SRE + 1 Junior engineer) via Telegram.
- ⏱️ **Sub-90-Second Resolution Loop**: From Prometheus alert to a verified, human-actionable root-cause draft.

---

## 🏗️ Architecture

```
                                  +-------------------+
                                  |    K8s Cluster    |
                                  |  (Microservices)  |
                                  +---------+---------+
                                            |
                      +---------------------+---------------------+
                      |                                           |
             [OpenTelemetry Spans]                     [Prometheus Alerts/Metrics]
                      |                                           |
                      v                                           v
       +-------------------------------+           +-------------------------------+
       |    Dependency Graph Builder   |           |         Alert Webhook         |
       |  (Deterministic BFS Traversal)|           |           (Node BFF)          |
       +---------------+---------------+           +---------------+---------------+
                       |                                           |
                       +---------------------+---------------------+
                                             |
                                             v
                              +-------------------------------+
                              |        Signal Compressor      |
                              |   (Rank & Trim under Budget)  |
                              +---------------+---------------+
                                             |
                       +---------------------+---------------------+
                       |                                           |
                       v                                           v
        +-----------------------------+             +-----------------------------+
        |        LLM API Engine       |             |        On-Call Router       |
        |  (Schema-Constrained Root-  |             |  (Skills / Seniority /      |
        |   Cause & Postmortem Draft) |             |   Availability / Leave)     |
        +--------------+--------------+             +--------------+--------------+
                       |                                           |
                       v                                           v
        +-----------------------------+             +-----------------------------+
        |    Fact-Checking Validator  |             |      Telegram Alert Bot     |
        | (Anti-Hallucination Filter) |             |  (Dispatches top responders)|
        +--------------+--------------+             +-----------------------------+
                       |
                       v
        +-----------------------------+
        |      React Dashboard        |
        |  - 5-digit: Admin View      |
        |  - 6-digit: Team View       |
        +-----------------------------+
```

---

## ⚡ Target 90-Second Incident Lifecycle Walkthrough

*The following sequence outlines the target design benchmark from alert firing to verified postmortem:*

| Time | Event |
| :--- | :--- |
| **`T+00s`** | Prometheus fires alert: `checkout-service` P95 latency > 2s. |
| **`T+02s`** | Graph Builder performs BFS across trace edges: identifies blast radius (`checkout-service` → `payment-gateway` → `inventory-service`). Unrelated failing services are pruned. |
| **`T+04s`** | Signal Compressor ranks telemetry signals (logs, anomalous metric deviations, and trace spans) down to a high-value context (~40 signals) fitted to the LLM token budget. |
| **`T+07s`** | LLM generates structured root-cause hypothesis; Fact-Checking Validator confirms all mentioned services exist in telemetry context. |
| **`T+08s`** | On-Call Router scores Team Directory and dispatches Telegram notification to a primary SRE owner and an available junior engineer. |
| **`T+55s`** | Responder opens React Dashboard, reviews evidence, makes any minor edits, and marks the postmortem final.

---

## 🧰 Tech Stack

| Layer | Core Technologies | Planned & Extended Integrations |
| :--- | :--- | :--- |
| **Compute & Orchestration** | Kubernetes (Minikube local dev, AWS EKS), Docker | Helm |
| **Service Graph & Traces** | OpenTelemetry (Distributed Traces & Spans) | Istio / Service Mesh topology |
| **Metrics & Alerting** | Prometheus, Alertmanager, Grafana | CloudWatch |
| **Core Correlation Engine** | Python (NetworkX / Graph BFS, NumPy anomaly scoring) | Pydantic, vLLM / Ollama |
| **Backend & BFF** | Node.js / Fastify or Express (REST API, Webhooks, Telegram Bot) | TypeScript, Prisma/Kysely |
| **Frontend UI** | React (Vite), TailwindCSS (Role-based Admin & Team views) | Cytoscape / Graph visualization |
| **Databases** | PostgreSQL (IAM, Team Directory, Incidents) | Local Event Store / DynamoDB |
| **Chaos & Validation** | Chaos Mesh (Synthetic Fault Injection) | Automated Evaluation Harness |
| **CI/CD & IaC** | GitHub Actions | Terraform |

---

## 🔐 IAM & Authorization Model

Perimeter implements server-side role resolution for every request:
- **Admin Role (5-digit ID)**: Complete cluster visibility, cross-service inspection, team directory management, and leave tracking.
- **Team Member Role (6-digit ID)**: Scoped visibility; users inspect only services and incidents owned by their team.
- **Enumeration Protection**: Generic authentication error on failure; never reveals whether an ID pattern or identity exists.

---

## 🚀 Delivery Roadmap

For detailed sprint breakdowns and task ownership, refer to [project_architecture_and_roadmap.md](./project_architecture_and_roadmap.md).

- **Sprint 1 (Days 1–5)**: Full Team Kickoff, Monorepo Setup, PostgreSQL Schema, Mock Telemetry.
- **Sprint 2 (Days 6–18)**: Core Module Builds (BFS Graph Engine, Signal Compressor, IAM/BFF, Chaos Harness).
- **Sprint 3 (Days 19–30)**: Integration & End-to-End Pipeline Wireup (Alert → BFS → LLM → Telegram → UI).
- **Sprint 4 (Days 31–40)**: Chaos Fault Injection & Ground-Truth Accuracy Benchmarking.
- **Final Sprint (Days 41–45)**: EKS Live Demonstration, Evaluation Write-up, and Capstone Deliverables.

---

## 📄 Academic Note

This project is developed as an engineering capstone project focusing on auditable, data-sovereign telemetry correlation, graph-bounded blast-radius scoping, and automated on-call incident intelligence.
