-- PLAYZO initial schema (SQLite dialect; see docs/DATABASE_SCHEMA.md for the PostgreSQL mapping)

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  is_guest INTEGER NOT NULL DEFAULT 0,
  dob TEXT,                                   -- ISO date; NULL for guests
  age_band TEXT NOT NULL DEFAULT 'unknown',   -- unknown | child | teen | adult
  role TEXT NOT NULL DEFAULT 'user',          -- user | support | admin
  status TEXT NOT NULL DEFAULT 'active',      -- active | suspended | deleted
  email_verified_at TEXT,
  parent_email TEXT,
  parental_consent_at TEXT,
  adult_verified_at TEXT,
  adult_verify_method TEXT,
  avatar TEXT NOT NULL DEFAULT 'orb-1',
  frame TEXT,
  theme TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  premium_until TEXT,
  privacy_profile TEXT NOT NULL DEFAULT 'friends',  -- public | friends | private
  allow_friend_requests INTEGER NOT NULL DEFAULT 1,
  lounge_cooloff_until TEXT,
  lounge_daily_limit_min INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT,
  deleted_at TEXT
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,                      -- verify_email | reset_password | parent_consent
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE dev_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                         -- terms | privacy | parental | lounge_terms
  version TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Virtual currency: ZO (earned, family) and CHIPS (free Fun Chips, Lounge only). Never redeemable.
CREATE TABLE balances (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('ZO','CHIPS')),
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  PRIMARY KEY (user_id, currency)
);

CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL,                    -- signed
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL,                         -- reward | stake | payout | grant | purchase | admin_adjust | refund
  source TEXT NOT NULL,
  session_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_ledger_user ON ledger(user_id, created_at);

CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  env TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',      -- active | completed | abandoned | rejected
  difficulty TEXT NOT NULL,
  seed TEXT NOT NULL,                         -- replay seed, or secret server seed (never sent for chance games)
  seed_commit TEXT NOT NULL,                  -- sha256 commitment shown to the player
  rng_cursor INTEGER NOT NULL DEFAULT 0,
  rules_version TEXT NOT NULL,
  state TEXT,
  context TEXT,                               -- solo | daily | challenge | race
  context_ref TEXT,
  score INTEGER,
  result TEXT,
  reject_reason TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_ms INTEGER NOT NULL,
  ended_at TEXT
);
CREATE INDEX idx_sessions_user ON game_sessions(user_id, started_at);
CREATE INDEX idx_sessions_game ON game_sessions(game_id, status, score);

CREATE TABLE game_actions (
  session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  action TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE game_stats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  mastery_xp INTEGER NOT NULL DEFAULT 0,
  last_played_at TEXT,
  PRIMARY KEY (user_id, game_id)
);

CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  period_week TEXT NOT NULL,
  period_day TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT 'solo',
  session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_scores_board ON scores(game_id, period_week, score DESC);
CREATE INDEX idx_scores_daily ON scores(game_id, period_day, context, score DESC);

CREATE TABLE achievements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE mission_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  period TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  claimed_at TEXT,
  PRIMARY KEY (user_id, mission_id, period)
);

CREATE TABLE favourites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, game_id)
);

CREATE TABLE friendships (
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,                       -- pending | accepted
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE blocks (
  blocker TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (blocker, blocked)
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',        -- open | actioned | dismissed
  resolved_by TEXT,
  resolution TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user TEXT REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  seed TEXT NOT NULL,
  from_score INTEGER,
  to_score INTEGER,
  status TEXT NOT NULL DEFAULT 'open',        -- open | completed | expired | declined
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  room_code TEXT,
  game_id TEXT NOT NULL,
  format TEXT NOT NULL,
  players TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE match_players (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  outcome TEXT NOT NULL,                      -- win | loss | draw
  team INTEGER,
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE inventory (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  amount_inr INTEGER NOT NULL,
  provider TEXT NOT NULL,                     -- dev-mock (no real payment integration)
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE game_settings (
  game_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'live',        -- live | maintenance | hidden
  note TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE ad_placements (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL,                         -- home_banner | results_native | rewarded_bonus
  env TEXT NOT NULL,                          -- family_teen_adult | adult
  sponsor TEXT,
  label TEXT NOT NULL,
  frequency_cap_per_day INTEGER NOT NULL DEFAULT 3,
  enabled INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ad_impressions (
  user_id TEXT NOT NULL,
  placement_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, placement_id, day)
);

CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  name TEXT NOT NULL,
  props TEXT,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_events_day ON analytics_events(day, name);
CREATE INDEX idx_events_user ON analytics_events(user_id, day);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE deletion_requests (
  user_id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);

CREATE TABLE client_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  message TEXT NOT NULL,
  where_ TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
