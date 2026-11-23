const eventsDb = db.getSiblingDB("perimeter_events");

if (!eventsDb.getCollectionNames().includes("events")) {
  eventsDb.createCollection("events");
}

const events = eventsDb.getCollection("events");
events.createIndex({ service: 1, ts: -1 }, { name: "idx_service_ts" });
events.createIndex(
  { ts: 1 },
  { expireAfterSeconds: 172800, name: "idx_ttl_retention" },
);
events.createIndex({ trace_id: 1 }, { name: "idx_trace_id", sparse: true });
events.createIndex(
  { incident_ids: 1, ts: -1 },
  { name: "idx_incident_events" },
);
