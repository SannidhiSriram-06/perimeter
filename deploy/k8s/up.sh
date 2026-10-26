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
echo "Grafana: kubectl -n $NS port-forward svc/perimeter-monitoring-grafana 3000:80  (admin / perimeter-dev)"
