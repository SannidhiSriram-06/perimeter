from datetime import datetime
from typing import Any, Sequence

from pymongo import MongoClient

from .base import EventRecord, EventStore, time_window


class MongoEventStore(EventStore):
    """MongoDB implementation of the Perimeter event store."""

    def __init__(
        self,
        uri: str = "mongodb://127.0.0.1:27017",
        db_name: str = "perimeter_events",
        server_selection_timeout_ms: int = 2_000,
    ) -> None:
        self.client: MongoClient[dict[str, Any]] = MongoClient(
            uri,
            serverSelectionTimeoutMS=server_selection_timeout_ms,
            tz_aware=True,
        )
        self.collection = self.client[db_name]["events"]

    def insert_event(self, event: EventRecord) -> str:
        result = self.collection.insert_one(event.model_dump(mode="python"))
        return str(result.inserted_id)

    def insert_batch(self, events: Sequence[EventRecord]) -> int:
        if not events:
            return 0
        result = self.collection.insert_many(
            [event.model_dump(mode="python") for event in events]
        )
        return len(result.inserted_ids)

    def fetch_events(
        self,
        services: Sequence[str],
        window_minutes: int = 15,
        end_time: datetime | None = None,
    ) -> list[EventRecord]:
        if not services:
            time_window(window_minutes, end_time)
            return []

        start, end = time_window(window_minutes, end_time)
        query = {
            "service": {"$in": list(services)},
            "ts": {"$gte": start, "$lte": end},
        }
        documents = self.collection.find(query).sort([("service", 1), ("ts", -1)])
        return [EventRecord.model_validate(self._without_id(doc)) for doc in documents]

    def fetch_by_incident(self, incident_id: str) -> list[EventRecord]:
        query = {"incident_ids": incident_id}
        documents = self.collection.find(query).sort("ts", -1)
        return [EventRecord.model_validate(self._without_id(doc)) for doc in documents]

    def close(self) -> None:
        self.client.close()

    @staticmethod
    def _without_id(document: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in document.items() if key != "_id"}
