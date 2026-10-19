-- The QR image encodes the durable /r/:id URL, not the current destination.
-- Do not delete these mappings without warning: printed QR codes would stop working.
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY NOT NULL,
  destination TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  owner_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  scan_count INTEGER NOT NULL DEFAULT 0
);
