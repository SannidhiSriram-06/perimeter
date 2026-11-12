"""Synthetic traffic generator for Perimeter test microservices.

Generates steady HTTP POST traffic to frontend-proxy at a configurable interval,
simulating customer checkouts and stimulating the OpenTelemetry trace pipeline.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [loadgen]: %(message)s",
)
logger = logging.getLogger("loadgen")

DEFAULT_FRONTEND_URL = os.getenv(
    "FRONTEND_URL", "http://frontend-proxy.perimeter-test.svc.cluster.local:8080/api/checkout"
)
DEFAULT_INTERVAL_SECONDS = float(os.getenv("INTERVAL_SECONDS", "2.0"))
DEFAULT_MAX_REQUESTS = int(os.getenv("MAX_REQUESTS", "0"))


def run_loadgen(
    url: str = DEFAULT_FRONTEND_URL,
    interval: float = DEFAULT_INTERVAL_SECONDS,
    max_requests: int = DEFAULT_MAX_REQUESTS,
    timeout: float = 10.0,
) -> int:
    """Sends steady checkout requests to frontend-proxy.

    Returns the number of completed requests.
    """
    logger.info("Starting load generator targeting %s every %.1fs", url, interval)
    count = 0

    while True:
        count += 1
        payload = json.dumps(
            {
                "order_id": f"ord-gen-{count:06d}",
                "customer_id": f"cust-{(count % 50) + 1:04d}",
                "amount": 49.99 + (count % 20),
                "timestamp": time.time(),
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "perimeter-loadgen/1.0",
            },
            method="POST",
        )

        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                elapsed_ms = (time.time() - start) * 1000.0
                logger.info(
                    "Request #%d -> status %d (%.1f ms)",
                    count,
                    resp.status,
                    elapsed_ms,
                )
        except urllib.error.HTTPError as err:
            elapsed_ms = (time.time() - start) * 1000.0
            logger.warning(
                "Request #%d -> HTTP %d: %s (%.1f ms)",
                count,
                err.code,
                err.reason,
                elapsed_ms,
            )
        except Exception as exc:
            elapsed_ms = (time.time() - start) * 1000.0
            logger.error("Request #%d failed: %s (%.1f ms)", count, exc, elapsed_ms)

        if 0 < max_requests <= count:
            logger.info("Completed %d requested requests. Stopping.", count)
            break

        time.sleep(interval)

    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Perimeter Load Generator")
    parser.add_argument("--url", default=DEFAULT_FRONTEND_URL, help="Frontend proxy URL")
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_SECONDS,
        help="Interval between requests in seconds",
    )
    parser.add_argument(
        "--max-requests",
        type=int,
        default=DEFAULT_MAX_REQUESTS,
        help="Maximum requests to send (0 = infinite)",
    )
    args = parser.parse_args()

    try:
        run_loadgen(
            url=args.url,
            interval=args.interval,
            max_requests=args.max_requests,
        )
    except KeyboardInterrupt:
        logger.info("Load generator stopped by user.")
        sys.exit(0)


if __name__ == "__main__":
    main()
