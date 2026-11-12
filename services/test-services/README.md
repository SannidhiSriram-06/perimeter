# Perimeter Test Microservices

Lightweight, hand-instrumented Python microservices designed to evaluate Project Perimeter's Breadth-First Search (BFS) blast radius correlation engine and Chaos Mesh fault-injection scenarios.

All microservices run from a single unified container image with service behavior and call topologies driven by environment variables.

---

## 1. Call Topology & Service Roles

| Service Name | Tier | Owning Team | Upstream Caller | Downstream Callees |
| :--- | :--- | :--- | :--- | :--- |
| `frontend-proxy` | High | `team-core-platform` | External Client / Loadgen | `checkout-service` |
| `checkout-service` | High | `team-payments` | `frontend-proxy` | `inventory-service`, `payment-gateway` |
| `payment-gateway` | Critical | `team-payments` | `checkout-service` | `bank-network` |
| `bank-network` | Critical | `team-payments` | `payment-gateway` | *(leaf external switch)* |
| `inventory-service` | High | `team-core-platform` | `checkout-service` | *(leaf)* |
| `recommendation-engine` | Medium | `team-core-platform` | *(isolated)* | *(isolated background)* |

---

## 2. Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `SERVICE_NAME` | `frontend-proxy` | Selects which service identity and routing behavior to assume |
| `PORT` | `8080` | Port to bind HTTP server |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | *(none)* | OpenTelemetry Collector endpoint (e.g. `http://perimeter-otel-collector-opentelemetry-collector.perimeter.svc.cluster.local:4318/v1/traces`) |
| `CHECKOUT_SERVICE_URL` | `http://checkout-service:8080/checkout` | Target endpoint for `frontend-proxy` calls |
| `INVENTORY_SERVICE_URL` | `http://inventory-service:8080/reserve` | Target endpoint for inventory checks |
| `PAYMENT_GATEWAY_URL` | `http://payment-gateway:8080/charge` | Target endpoint for payment authorization |
| `BANK_NETWORK_URL` | `http://bank-network:8080/authorize` | Target endpoint for bank clearing switch |
| `INDUCED_DELAY_MS` | `0.0` | Simulated processing latency in milliseconds (e.g. bank switch lag) |
| `INDUCED_STATUS_CODE` | `0` | If $> 0$, forces response HTTP status code (e.g. 504 for timeout, 503 for unavailable) |

---

## 3. Running Locally

```bash
# Start bank-network leaf
SERVICE_NAME=bank-network uvicorn services.test_services.app:app --port 8083

# Start payment-gateway targeting bank-network
SERVICE_NAME=payment-gateway BANK_NETWORK_URL=http://localhost:8083/authorize uvicorn services.test_services.app:app --port 8082

# Start inventory-service leaf
SERVICE_NAME=inventory-service uvicorn services.test_services.app:app --port 8084

# Start checkout-service targeting payment and inventory
SERVICE_NAME=checkout-service PAYMENT_GATEWAY_URL=http://localhost:8082/charge INVENTORY_SERVICE_URL=http://localhost:8084/reserve uvicorn services.test_services.app:app --port 8081

# Start frontend-proxy targeting checkout
SERVICE_NAME=frontend-proxy CHECKOUT_SERVICE_URL=http://localhost:8081/checkout uvicorn services.test_services.app:app --port 8080

# Send a test request
curl -X POST http://localhost:8080/api/checkout -H "Content-Type: application/json" -d '{"order_id": "test-123"}'
```

---

## 4. Kubernetes Deployment

Manifests are located in `deploy/k8s/test-services/`:
```bash
kubectl apply -k deploy/k8s/test-services/
```
All pods run in namespace `perimeter-test` with labels matching `evaluation/chaos/*.yaml` selectors (`app=payment-gateway`, `app=bank-network`, etc.).
