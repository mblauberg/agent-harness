CREATE TABLE observer_event_sequence (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id)
);

INSERT INTO observer_event_sequence(event_id)
SELECT event_id
FROM events
ORDER BY created_at, event_id;
