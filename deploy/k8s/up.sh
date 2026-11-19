#!/usr/bin/env bash
# Starts Minikube and installs the observability stack. Safe to re-run.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NS=perimeter

# Pinned so a re-run never silently upgrades (audit N-20). Bump deliberately.
PROMETHEUS_STACK_VERSION=93.4.1
OTEL_COLLECTOR_CHART_VERSION=0.180.0

minikube status >/dev/null 2>&1 || minikube start --cpus=4 --memory=6144

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts >/dev/null
helm repo update >/dev/null

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

# Random Grafana admin password, created once and kept only in the cluster.
kubectl -n "$NS" get secret perimeter-grafana-admin >/dev/null 2>&1 ||
  kubectl -n "$NS" create secret generic perimeter-grafana-admin \
    --from-literal=admin-user=admin --from-literal=admin-password="$(openssl rand -hex 16)"

# Bearer token Alertmanager sends to the BFF webhook. Give the BFF the same value as WEBHOOK_SECRET.
kubectl -n "$NS" get secret perimeter-webhook >/dev/null 2>&1 ||
  kubectl -n "$NS" create secret generic perimeter-webhook --from-literal=token="$(openssl rand -hex 24)"

# Secrets for Perimeter's own services, created once and kept only in the cluster. GROQ_API_KEY is optional: without
# it incidents are stored with no root-cause draft. To change it later, delete the secret and re-run this script.
kubectl -n "$NS" get secret perimeter-app >/dev/null 2>&1 ||
  kubectl -n "$NS" create secret generic perimeter-app \
    --from-literal=POSTGRES_PASSWORD="$(openssl rand -hex 16)" \
    --from-literal=AUTH_SECRET="$(openssl rand -hex 32)" \
    --from-literal=GROQ_API_KEY="${GROQ_API_KEY:-}"

# Schema and dev seed for the in-cluster PostgreSQL. It runs only when the volume is empty (first start).
kubectl -n "$NS" create configmap perimeter-db-init --from-file=init.sql="$ROOT/deploy/db/init.sql" \
  --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install perimeter-monitoring prometheus-community/kube-prometheus-stack \
  --version "$PROMETHEUS_STACK_VERSION" --namespace "$NS" -f "$HERE/values/prometheus-values.yaml" --wait --timeout 10m

helm upgrade --install perimeter-otel-collector open-telemetry/opentelemetry-collector \
  --version "$OTEL_COLLECTOR_CHART_VERSION" --namespace "$NS" -f "$HERE/values/otel-collector-values.yaml" --wait --timeout 5m

# Build the two images straight into Minikube's image store, install the chart, then restart so a rebuilt :dev image
# is picked up.
minikube image build -t perimeter/bff:dev "$ROOT/services/bff-server"
minikube image build -t perimeter/engine:dev "$ROOT/services/correlation_engine"
helm upgrade --install perimeter "$ROOT/deploy/helm/perimeter" --namespace "$NS" --wait --timeout 5m
kubectl -n "$NS" rollout restart deploy/perimeter-bff deploy/perimeter-engine
kubectl -n "$NS" rollout status deploy/perimeter-engine --timeout=120s
kubectl -n "$NS" rollout status deploy/perimeter-bff --timeout=120s

kubectl -n "$NS" delete job sample-traces --ignore-not-found
kubectl apply -f "$HERE/sample/telemetrygen-job.yaml"
kubectl -n "$NS" wait --for=condition=complete job/sample-traces --timeout=120s

echo
echo "Spans received by the collector (last 20 lines):"
kubectl -n "$NS" logs deploy/perimeter-otel-collector-opentelemetry-collector --tail=20 | grep -E 'Span|checkout-service' || true
echo
echo "Perimeter pods:"
kubectl -n "$NS" get pods -l 'app in (perimeter-bff,perimeter-engine,perimeter-postgres)'
echo "BFF: kubectl -n $NS port-forward svc/perimeter-bff 3001:3001   (see deploy/k8s/README.md to fire a test alert)"
echo "Grafana: kubectl -n $NS port-forward svc/perimeter-monitoring-grafana 3000:80  (user admin)"
echo "Webhook secret for the BFF (WEBHOOK_SECRET): kubectl -n $NS get secret perimeter-webhook -o jsonpath='{.data.token}' | base64 -d; echo"
echo "Password: kubectl -n $NS get secret perimeter-grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d; echo"
