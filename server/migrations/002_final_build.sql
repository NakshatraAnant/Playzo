-- 002: persistent rooms, legal review records, email delivery tracking, notifications,
-- login throttling, pause support, seasons, daily rewards, referrals, content flags,
-- append-only ledger and audit log. Additive only: no existing data is changed or dropped.

/* ---------- game sessions: pause support ---------- */
ALTER TABLE game_sessions ADD COLUMN paused_at INTEGER;
ALTER TABLE game_sessions ADD COLUMN paused_total_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN was_paused INTEGER NOT NULL DEFAULT 0;

/* ---------- persistent multiplayer rooms ---------- */
CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('lobby','playing','done','expired')),
  adult INTEGER NOT NULL,
  snapshot TEXT NOT NULL,                    -- JSON room state (engine state, members, rng cursor)
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_rooms_status ON rooms(status, updated_at);
CREATE INDEX idx_match_players_user ON match_players(user_id);
CREATE INDEX idx_matches_created ON matches(created_at);

/* ---------- per-game legal review records (documentation; never unlocks a game by itself) ---------- */
CREATE TABLE legal_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'india_law',   -- india_law | google_play | app_store | state_law
  status TEXT NOT NULL CHECK (status IN ('pending','in_review','approved','rejected','blocked')),
  reference TEXT,                            -- written opinion / approval document reference
  reviewer TEXT,                             -- counsel or platform reviewer as recorded
  notes TEXT,
  recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_legal_reviews_game ON legal_reviews(game_id, scope, id);

/* ---------- email delivery tracking (dev_outbox becomes the delivery log) ---------- */
ALTER TABLE dev_outbox ADD COLUMN template TEXT;
ALTER TABLE dev_outbox ADD COLUMN provider TEXT NOT NULL DEFAULT 'outbox';
ALTER TABLE dev_outbox ADD COLUMN status TEXT NOT NULL DEFAULT 'outbox_only'; -- outbox_only | queued | sent | failed
ALTER TABLE dev_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dev_outbox ADD COLUMN last_error TEXT;
ALTER TABLE dev_outbox ADD COLUMN sent_at TEXT;
ALTER TABLE dev_outbox ADD COLUMN next_attempt_at TEXT;
ALTER TABLE dev_outbox ADD COLUMN user_id TEXT;
CREATE INDEX idx_outbox_status ON dev_outbox(status, next_attempt_at);

/* ---------- in-app notifications + preferences ---------- */
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                        -- security | friend | challenge | room | system
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);
ALTER TABLE users ADD COLUMN notify_prefs TEXT NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN referred_by TEXT;

/* ---------- auth hardening ---------- */
CREATE TABLE auth_throttle (
  key TEXT PRIMARY KEY,                      -- 'login:' || lower(identifier)
  failures INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  locked_until INTEGER
);
ALTER TABLE auth_sessions ADD COLUMN user_agent TEXT;
ALTER TABLE auth_sessions ADD COLUMN last_used_at TEXT;

/* ---------- retention: daily rewards, seasons, content flags ---------- */
CREATE TABLE daily_rewards (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  streak INTEGER NOT NULL,
  zo INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, day)
);
CREATE TABLE season_points (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season TEXT NOT NULL,                      -- YYYY-MM
  points INTEGER NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, season)
);
CREATE INDEX idx_season_points ON season_points(season, points DESC);
CREATE TABLE content_flags (
  kind TEXT NOT NULL CHECK (kind IN ('mission','cosmetic')),
  item_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (kind, item_id)
);

/* ---------- immutability: ledger and audit log are append-only ----------
   Rows may only disappear through account-deletion cascades (the user row is already gone). */
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
