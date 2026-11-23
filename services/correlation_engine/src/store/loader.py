from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime
from typing import Any

from .base import EventRecord, EventStore, normalize_event


def load_events(
    store: EventStore,
    events: Iterable[EventRecord | Mapping[str, Any]],
) -> int:
    """Validate and insert a batch of event records into the selected store."""
    records = [
        normalize_event(event) if isinstance(event, EventRecord) else normalize_event(dict(event))
        for event in events
    ]
    return store.insert_batch(records)


def fetch_events(
    store: EventStore,
    services: Sequence[str],
    window_minutes: int = 15,
    end_time: datetime | None = None,
) -> list[EventRecord]:
    """Fetch telemetry for the requested services in a trailing time window."""
    return store.fetch_events(services, window_minutes, end_time)
