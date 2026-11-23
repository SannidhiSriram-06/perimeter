from datetime import datetime, timedelta, timezone

import pytest

from src.store import EventRecord, InMemoryEventStore, fetch_events, load_events


def test_load_and_fetch_events_in_memory() -> None:
    now = datetime.now(timezone.utc)
    store = InMemoryEventStore()
    inserted = load_events(
        store,
        [
            {
                "service": "checkout-service",
                "ts": now - timedelta(minutes=5),
                "event_type": "span",
                "status_code": 500,
                "incident_ids": ["incident-1"],
            },
            EventRecord(
                service="payment-gateway",
                ts=now - timedelta(minutes=10),
                event_type="log",
                severity="ERROR",
            ),
            {
                "service": "inventory-service",
                "ts": now - timedelta(minutes=25),
                "event_type": "span",
            },
        ],
    )

    result = fetch_events(
        store,
        ["checkout-service", "payment-gateway", "inventory-service"],
        end_time=now,
    )

    assert inserted == 3
    assert [event.service for event in result] == [
        "checkout-service",
        "payment-gateway",
    ]
    assert store.fetch_by_incident("incident-1")[0].service == "checkout-service"


def test_fetch_events_includes_window_boundaries_and_sorts_by_service_then_time() -> None:
    now = datetime.now(timezone.utc)
    store = InMemoryEventStore()
    store.insert_batch(
        [
            EventRecord(
                service="b",
                ts=now,
                event_type="span",
            ),
            EventRecord(
                service="a",
                ts=now - timedelta(minutes=15),
                event_type="log",
            ),
            EventRecord(
                service="a",
                ts=now - timedelta(minutes=1),
                event_type="span",
            ),
            EventRecord(
                service="a",
                ts=now + timedelta(seconds=1),
                event_type="span",
            ),
        ]
    )

    result = store.fetch_events(["b", "a"], end_time=now)

    assert [(event.service, event.ts) for event in result] == [
        ("a", now - timedelta(minutes=1)),
        ("a", now - timedelta(minutes=15)),
        ("b", now),
    ]


def test_load_events_validates_records_and_empty_batch() -> None:
    store = InMemoryEventStore()

    assert load_events(store, []) == 0
    with pytest.raises(ValueError):
        load_events(store, [{"service": "", "event_type": "span"}])


def test_fetch_events_rejects_non_positive_window() -> None:
    store = InMemoryEventStore()

    with pytest.raises(ValueError, match="window_minutes"):
        fetch_events(store, ["checkout-service"], window_minutes=0)


def test_naive_timestamps_are_normalized_to_utc() -> None:
    event = EventRecord(
        service="checkout-service",
        ts=datetime(2026, 11, 23, 12, 0),
        event_type="span",
    )

    assert event.ts.tzinfo == timezone.utc
