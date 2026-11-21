# Project Perimeter: Live Chaos Run & Execution Report

> [!IMPORTANT]
> **Controlled Synthetic Test Environment Notice**:
> All chaos engineering experiments, pod failures, and evaluation benchmarks documented herein are designed and executed strictly within a controlled synthetic test environment (local Minikube / isolated staging Kubernetes cluster). They never target or originate from production environments.

---

## 1. Executive Summary

As part of Milestone 4 (Evaluation & Live Chaos), this report documents the execution of synthetic fault injection scenario **`chaos-sc-01`** (`PodChaos`: pod kill on `payment-gateway`) against the Perimeter test microservice topology.

### Scenario Objective
* **Fault Injected**: `PodChaos` (`action: pod-kill`, `gracePeriod: 0s`) via Chaos Mesh.
* **Target Service**: `payment-gateway` (`namespace: perimeter-test`, selector: `app=payment-gateway`).
* **Expected Blast Radius**:
  - `upstream`: `["payment-gateway", "checkout-service", "frontend-proxy"]`
  - `both`: `["payment-gateway", "checkout-service", "bank-network", "frontend-proxy"]`
* **Negative Controls**: `inventory-service` (healthy sibling callee), `recommendation-engine` (decoupled background noise).

---

## 2. Execution Status & Environment Blockage

During local execution of the live harness:
```bash
python3 evaluation/run_chaos.py --scenario chaos-sc-01
```

### Result: Blocked at Cluster Connection
```text
[LIVE] Running scenario: chaos-sc-01-payment-gateway-upstream
Target: payment-gateway | Direction: upstream | Expected: ['payment-gateway', 'checkout-service', 'frontend-proxy']
OSError: kubectl command not found. Install kubectl and configure Minikube cluster or run with --dry-run for offline verification.
```

* **Root Cause**: The current host machine environment does not have `kubectl`, `helm`, `minikube`, or a running Docker daemon installed.
* **Safety Mechanism**: The harness correctly detected the absence of `kubectl` and safely aborted execution without leaving dangling resources or corrupted state.

---

## 3. Important Architectural Note: Trace Ingestion vs. Collector Spans

> [!NOTE]
> **Trace Export & Graph Building Scope**:
> In the current Kubernetes deployment (`deploy/k8s/values/otel-collector-values.yaml`), the OpenTelemetry Collector receives OTLP spans from the test microservices on port `4318` (HTTP) / `4317` (gRPC) and exports them exclusively to **debug logs** (`exporters: [debug]`, `verbosity: detailed`).
> 
> Because a persistent distributed trace backend (such as Jaeger or Grafana Tempo) has not yet been deployed to the cluster, the Correlation Engine currently builds its dependency graph from the synthetic trace fixtures (`services/correlation_engine/src/mock/fixtures.py`), while live microservices stream real spans to the collector logs. A persistent trace store integration will be landed in the upcoming storage milestone.

---

## 4. Runbook: Manual Verification on Minikube

To execute this scenario on a workstation with Docker Desktop and Minikube available:

### Step 1: Start Minikube & Observability Stack
```bash
# Start Minikube cluster and install Prometheus, Grafana, and OTel Collector
./deploy/k8s/up.sh
```

### Step 2: Install Chaos Mesh
```bash
helm repo add chaos-mesh https://charts.chaos-mesh.org
helm repo update
helm upgrade --install chaos-mesh chaos-mesh/chaos-mesh \
  -n chaos-mesh --create-namespace \
  --set chaosDaemon.runtime=docker \
  --set chaosDaemon.socketPath=/var/run/docker.sock
```

### Step 3: Deploy Test Microservices
```bash
# Build test microservice image inside Minikube's Docker daemon
eval $(minikube docker-env)
docker build -t perimeter/test-services:latest services/test-services/

# Apply manifests to perimeter-test namespace
kubectl apply -k deploy/k8s/test-services/

# Confirm pods are running
kubectl get pods -n perimeter-test
```

### Step 4: Run Live Chaos Scenario
```bash
# Execute live fault injection and score against ground truth
python3 evaluation/run_chaos.py --scenario chaos-sc-01 --wait 10
```

### Step 5: Verify Collector Spans & Chaos Cleanup
```bash
# Inspect OTel Collector span receipt
kubectl -n perimeter logs deploy/perimeter-otel-collector-opentelemetry-collector --tail=50 | grep -E 'payment-gateway|checkout-service'

# Confirm Chaos Mesh deleted the fault resource
kubectl get podchaos -n perimeter-test
```

---

## 5. Offline Simulation & Ground-Truth Verification

For offline validation and continuous integration, `evaluation/run_chaos.py --dry-run --scenario chaos-sc-01` executes the scenario against the exact topological call graph:

```text
============================================================================
HARNESS SUMMARY: 2/2 Scenarios Passed
============================================================================
- chaos-sc-01-payment-gateway-upstream:
    Precision: 1.00 (3/3)
    Recall:    1.00 (3/3)
    F1 Score:  1.00
    Passed:    True (threshold: 0.8)

- chaos-sc-01-payment-gateway-both:
    Precision: 1.00 (4/4)
    Recall:    1.00 (4/4)
    F1 Score:  1.00
    Passed:    True (threshold: 0.8)
```

Generated dry-run benchmark output files are produced locally upon test execution under `evaluation/benchmark/results/` (excluded from git tracking per repository `.gitignore` policy):
* `evaluation/benchmark/results/chaos_result_chaos-sc-01-payment-gateway-upstream.json`
* `evaluation/benchmark/results/chaos_result_chaos-sc-01-payment-gateway-both.json`
* `evaluation/benchmark/results/chaos_run_dryrun_summary.json`
