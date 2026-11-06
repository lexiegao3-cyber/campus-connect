-- Campus Connect schema (Cloudflare D1 / SQLite)

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,          -- pbkdf2$<iterations>$<salt b64>$<hash b64>
  created_at    INTEGER NOT NULL
);

CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  organizer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  category     TEXT    NOT NULL CHECK (category IN ('academic','career','social','sports','arts','tech','volunteer','wellness')),
  location     TEXT    NOT NULL,
  latitude     REAL    CHECK (latitude  IS NULL OR latitude  BETWEEN -90  AND 90),
  longitude    REAL    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  starts_at    INTEGER NOT NULL,           -- epoch ms, UTC
  ends_at      INTEGER NOT NULL,
  capacity     INTEGER CHECK (capacity IS NULL OR capacity > 0),
  status       TEXT    NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  created_at   INTEGER NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_events_starts ON events(status, starts_at, id);
CREATE INDEX idx_events_category ON events(category, starts_at);
CREATE INDEX idx_events_organizer ON events(organizer_id);

-- One row per (event, user). The composite primary key makes RSVPs
-- duplicate-safe at the storage layer; status records seat vs waitlist.
CREATE TABLE rsvps (
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT    NOT NULL CHECK (status IN ('going','waitlist')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX idx_rsvps_user ON rsvps(user_id, status);
CREATE INDEX idx_rsvps_event_status ON rsvps(event_id, status, created_at);
