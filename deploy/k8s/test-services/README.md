# Kubernetes Manifests: Perimeter Test Microservices

Deployments, Services, and Load Generator for Project Perimeter test microservices in namespace `perimeter-test`.

---

## 1. Structure

* `namespace.yaml`: Defines isolated `perimeter-test` namespace.
* `services.yaml`: Deployments and ClusterIP Services for:
  - `frontend-proxy` (port 8080)
  - `checkout-service` (port 8080)
  - `payment-gateway` (port 8080)
  - `bank-network` (port 8080)
  - `inventory-service` (port 8080)
  - `recommendation-engine` (port 8080)
* `loadgen.yaml`: Continuous traffic generator sending requests to `frontend-proxy`.
* `kustomization.yaml`: Kustomize aggregation overlay.

---

## 2. Deploying to Minikube

```bash
# 1. Build test microservices image inside Minikube's Docker daemon
eval $(minikube docker-env)
docker build -t perimeter/test-services:latest services/test-services/

# 2. Apply all test service manifests
kubectl apply -k deploy/k8s/test-services/

# 3. Verify running pods
kubectl get pods -n perimeter-test

# 4. Check payment-gateway pod specifically
kubectl get pods -n perimeter-test -l app=payment-gateway

# 5. Check spans received by OTel Collector
kubectl -n perimeter logs deploy/perimeter-otel-collector-opentelemetry-collector --tail=50 | grep -E 'checkout-service|payment-gateway|bank-network'
```

---

## 3. Chaos Mesh Selectors Alignment

All deployments provide labels matching `evaluation/chaos/*.yaml` selectors:
* `01-pod-kill-payment-gateway.yaml`: `namespaces: [perimeter-test]`, `app: payment-gateway`
* `02-network-latency-bank-network.yaml`: `namespaces: [perimeter-test]`, `app: bank-network`
* `03-stress-recommendation-engine.yaml`: `namespaces: [perimeter-test]`, `app: recommendation-engine`
