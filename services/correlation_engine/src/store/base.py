from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Sequence

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EventRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    service: str = Field(min_length=1)
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    event_type: Literal["span", "log", "metric"]
    trace_id: str | None = None
    span_id: str | None = None
    parent_span_id: str | None = None
    status_code: int | None = None
    duration_ms: float | None = None
    severity: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    incident_ids: list[str] = Field(default_factory=list)

    @field_validator("ts")
    @classmethod
    def normalize_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def time_window(
    window_minutes: int,
    end_time: datetime | None = None,
) -> tuple[datetime, datetime]:
    if window_minutes <= 0:
        raise ValueError("window_minutes must be greater than zero")

    end = end_time or datetime.now(timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    else:
        end = end.astimezone(timezone.utc)
    return end - timedelta(minutes=window_minutes), end


class EventStore(ABC):
    """Storage interface for raw Perimeter telemetry events."""

    @abstractmethod
    def insert_event(self, event: EventRecord) -> str:
        """Insert one event and return its storage identifier."""

    @abstractmethod
    def insert_batch(self, events: Sequence[EventRecord]) -> int:
        """Insert events and return the number inserted."""

    @abstractmethod
    def fetch_events(
        self,
        services: Sequence[str],
        window_minutes: int = 15,
        end_time: datetime | None = None,
    ) -> list[EventRecord]:
        """Fetch events for services in the trailing time window."""

    @abstractmethod
    def fetch_by_incident(self, incident_id: str) -> list[EventRecord]:
        """Fetch events tagged with an incident identifier."""


def normalize_event(raw_event: EventRecord | dict[str, Any]) -> EventRecord:
    if isinstance(raw_event, EventRecord):
        return raw_event
    data = {key: value for key, value in raw_event.items() if key != "_id"}
    return EventRecord.model_validate(data)
