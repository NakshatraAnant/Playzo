-- 003: personalisation preferences, support tickets with an admin response workflow,
-- and indexes for the analytics dashboard. Additive only.

ALTER TABLE users ADD COLUMN preferences TEXT NOT NULL DEFAULT '[]';   -- JSON array of category keys

CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('help','bug','account','complaint','safety','feedback')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','awaiting_user','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_support_user ON support_tickets(user_id, updated_at);
CREATE INDEX idx_support_status ON support_tickets(status, updated_at);

CREATE TABLE support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  staff INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_support_messages ON support_messages(ticket_id, id);

CREATE INDEX IF NOT EXISTS idx_events_name_day ON analytics_events(name, day);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON game_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
