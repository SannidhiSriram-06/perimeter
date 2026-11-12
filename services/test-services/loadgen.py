"""Synthetic traffic generator for Perimeter test microservices.

Generates steady HTTP POST traffic to frontend-proxy at a configurable interval,
simulating customer checkouts and stimulating the OpenTelemetry trace pipeline.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from urllib.parse import urlparse

import httpx

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
ALLOWED_URL_SCHEMES = ("http", "https")


def validate_url(url: str) -> str:
    """Validates URL scheme and host structure to guard against SSRF (SonarCloud S8703)."""
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ALLOWED_URL_SCHEMES:
        raise ValueError(
            f"Invalid URL scheme '{parsed.scheme}'. Only http and https URLs are allowed."
        )
    if not parsed.netloc:
        raise ValueError(f"Invalid URL '{url}': Host and network location must not be empty.")
    return url


def run_loadgen(
    url: str = DEFAULT_FRONTEND_URL,
    interval: float = DEFAULT_INTERVAL_SECONDS,
    max_requests: int = DEFAULT_MAX_REQUESTS,
    timeout: float = 10.0,
) -> int:
    """Sends steady checkout requests to frontend-proxy using httpx.

    Returns the number of completed requests.
    """
    valid_url = validate_url(url)
    logger.info("Starting load generator targeting %s every %.1fs", valid_url, interval)
    count = 0

    with httpx.Client(timeout=timeout) as client:
        while True:
            count += 1
            payload = {
                "order_id": f"ord-gen-{count:06d}",
                "customer_id": f"cust-{(count % 50) + 1:04d}",
                "amount": 49.99 + (count % 20),
                "timestamp": time.time(),
            }

            start = time.time()
            try:
                resp = client.post(
                    valid_url,
                    json=payload,
                    headers={
                        "User-Agent": "perimeter-loadgen/1.0",
                        "Content-Type": "application/json",
                    },
                )
                elapsed_ms = (time.time() - start) * 1000.0
                if resp.is_error:
                    logger.warning(
                        "Request #%d -> HTTP %d (%.1f ms)",
                        count,
                        resp.status_code,
                        elapsed_ms,
                    )
                else:
                    logger.info(
                        "Request #%d -> status %d (%.1f ms)",
                        count,
                        resp.status_code,
                        elapsed_ms,
                    )
            except httpx.HTTPError as err:
                elapsed_ms = (time.time() - start) * 1000.0
                logger.error("Request #%d failed: %s (%.1f ms)", count, err, elapsed_ms)
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
