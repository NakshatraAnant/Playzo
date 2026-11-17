-- 004: external sign-in identities (Google / Apple) and replay-run review flags. Additive only.

CREATE TABLE oauth_identities (
  provider TEXT NOT NULL CHECK (provider IN ('google','apple')),
  subject TEXT NOT NULL,                       -- provider's stable user id ("sub")
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX idx_oauth_user ON oauth_identities(user_id);

-- Behavioural review of verified replay runs (scripted-bot signals). A flagged run keeps its XP but
-- its leaderboard entry is held until staff review it.
ALTER TABLE game_sessions ADD COLUMN bot_score INTEGER;
ALTER TABLE game_sessions ADD COLUMN review_status TEXT;   -- NULL | 'flagged' | 'cleared' | 'removed'
ALTER TABLE game_sessions ADD COLUMN review_note TEXT;
CREATE INDEX idx_sessions_review ON game_sessions(review_status, started_at);
ALTER TABLE scores ADD COLUMN held INTEGER NOT NULL DEFAULT 0;  -- 1 = hidden from leaderboards pending review
