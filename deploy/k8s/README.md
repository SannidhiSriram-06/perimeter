# Local Kubernetes (Minikube)

Brings up Prometheus, Alertmanager, Grafana and the OpenTelemetry Collector in Minikube, then sends sample spans through the collector.

Alertmanager sends firing alerts to the BFF webhook (`perimeter-bff.perimeter.svc.cluster.local:3001`) with a bearer token from the `perimeter-webhook` secret. The BFF is not deployed in the cluster yet, so deliveries fail and retry until it is.

## Prerequisites

- Docker Desktop running
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

## Stop

```bash
minikube stop
```

## Notes

- The sample job uses `telemetrygen`, not a real instrumented service. Replace it with the test microservices once they exist.
- The collector exports spans to its debug log only. Choose a trace backend before the demo.
