# Local Kubernetes (Minikube)

Brings up Prometheus, Alertmanager, Grafana and the OpenTelemetry Collector in Minikube, deploys Perimeter itself (the BFF, the correlation engine and a dev PostgreSQL, from the Helm chart in `deploy/helm/perimeter`), then sends sample spans through the collector.

Alertmanager sends firing alerts to the BFF webhook (`perimeter-bff.perimeter.svc.cluster.local:3001`) with a bearer token from the `perimeter-webhook` secret. The BFF reads the same secret as `WEBHOOK_SECRET`, so the two always match.

What the script does for Perimeter: it creates a `perimeter-app` secret once (random database password and `AUTH_SECRET`, plus `GROQ_API_KEY` if set in your shell), loads `deploy/db/init.sql` into a ConfigMap, builds `perimeter/bff:dev` and `perimeter/engine:dev` into Minikube, installs the chart and waits for the pods. No secret is stored in git. The database is a **dev** PostgreSQL with the dev seed (every seeded user has the password `perimeter-dev`), so do not expose it outside your machine.

## Prerequisites

- Docker Desktop running
- Optional: `export GROQ_API_KEY=...` before the first run to get root-cause drafts. Without it incidents are stored with no draft. To change it later: `kubectl -n perimeter delete secret perimeter-app`, then run the script again (this also resets the database password, so delete the Postgres volume: `kubectl -n perimeter delete pvc data-perimeter-postgres-0`).
- `minikube`, `kubectl`, `helm` (`brew install minikube kubernetes-cli helm`)

## Start

```bash
./deploy/k8s/up.sh
```

The script is safe to re-run. It starts Minikube if it's stopped, installs or upgrades both Helm releases, and runs the sample trace job.

## Check it works

1. The script prints spans from the collector. Look for `checkout-service` in the output.
2. Open Grafana:

   ```bash
   kubectl -n perimeter port-forward svc/perimeter-monitoring-grafana 3000:80
   ```

   Then go to http://localhost:3000 (user `admin`). `up.sh` generates the password; read it with:

   ```bash
   kubectl -n perimeter get secret perimeter-grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d; echo
   ```

   Prometheus targets are under Explore.

## Fire a test alert through Alertmanager

```bash
kubectl -n perimeter port-forward svc/perimeter-monitoring-kube-prom-alertmanager 9093:9093 &
curl -s -X POST http://localhost:9093/api/v2/alerts -H 'content-type: application/json' \
  -d '[{"labels":{"alertname":"CheckoutServiceHighLatency","service":"checkout-service","severity":"critical"}}]'
```

After about 10 seconds (the route's `group_wait`) Alertmanager posts to the BFF. Check that an incident was stored:

```bash
kubectl -n perimeter exec perimeter-postgres-0 -- psql -U perimeter -d perimeter_db \
  -c "SELECT title, status, alert_service_id, blast_radius FROM incidents ORDER BY created_at DESC LIMIT 1"
kubectl -n perimeter logs deploy/perimeter-bff --tail=5
```

You should see `CheckoutServiceHighLatency on checkout-service | open | checkout-service | [...]`. With `GROQ_API_KEY` set, `root_cause_draft` is filled in a few seconds later.

To reach the BFF from your machine: `kubectl -n perimeter port-forward svc/perimeter-bff 3001:3001`.

## Stop

```bash
minikube stop
```

## Notes

- The sample job uses `telemetrygen`, not a real instrumented service. Replace it with the test microservices once they exist.
- The collector exports spans to its debug log only. Choose a trace backend before the demo.
- The engine still builds its graph from the mock fixtures, so the blast radius in the stored incident comes from mock data, not from the sample spans.
- Chart versions (kube-prometheus-stack, OpenTelemetry Collector) and the collector image tag are pinned in `up.sh` and `values/otel-collector-values.yaml`. Bump them deliberately.
