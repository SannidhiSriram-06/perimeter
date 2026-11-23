from datetime import datetime
from typing import Sequence
from uuid import uuid4

from .base import EventRecord, EventStore, time_window


class InMemoryEventStore(EventStore):
    """In-memory event store for tests and local use without MongoDB."""

    def __init__(self) -> None:
        self.events: list[EventRecord] = []

    def insert_event(self, event: EventRecord) -> str:
        self.events.append(event)
        return str(uuid4())

    def insert_batch(self, events: Sequence[EventRecord]) -> int:
        self.events.extend(events)
        return len(events)

    def fetch_events(
        self,
        services: Sequence[str],
        window_minutes: int = 15,
        end_time: datetime | None = None,
    ) -> list[EventRecord]:
        start, end = time_window(window_minutes, end_time)
        requested = set(services)
        results = [
            event
            for event in self.events
            if event.service in requested and start <= event.ts <= end
        ]
        return sorted(results, key=lambda event: (event.service, -event.ts.timestamp()))

    def fetch_by_incident(self, incident_id: str) -> list[EventRecord]:
        results = [event for event in self.events if incident_id in event.incident_ids]
        return sorted(results, key=lambda event: -event.ts.timestamp())
