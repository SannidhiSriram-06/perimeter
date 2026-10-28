#!/usr/bin/env bash
# Starts Minikube and installs the observability stack. Safe to re-run.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NS=perimeter

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

helm upgrade --install perimeter-monitoring prometheus-community/kube-prometheus-stack \
  --namespace "$NS" -f "$HERE/values/prometheus-values.yaml" --wait --timeout 10m

helm upgrade --install perimeter-otel-collector open-telemetry/opentelemetry-collector \
  --namespace "$NS" -f "$HERE/values/otel-collector-values.yaml" --wait --timeout 5m

kubectl -n "$NS" delete job sample-traces --ignore-not-found
kubectl apply -f "$HERE/sample/telemetrygen-job.yaml"
kubectl -n "$NS" wait --for=condition=complete job/sample-traces --timeout=120s

echo
echo "Spans received by the collector (last 20 lines):"
kubectl -n "$NS" logs deploy/perimeter-otel-collector-opentelemetry-collector --tail=20 | grep -E 'Span|checkout-service' || true
echo
echo "Grafana: kubectl -n $NS port-forward svc/perimeter-monitoring-grafana 3000:80  (user admin)"
echo "Webhook secret for the BFF (WEBHOOK_SECRET): kubectl -n $NS get secret perimeter-webhook -o jsonpath='{.data.token}' | base64 -d; echo"
echo "Password: kubectl -n $NS get secret perimeter-grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d; echo"
