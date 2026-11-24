-- 005: indexes for hot lookups and account-deletion cascades. Additive only.
CREATE INDEX IF NOT EXISTS idx_sessions_active ON game_sessions(status, started_ms);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON game_sessions(user_id, status, ended_at);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked);
CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id, game_id);
CREATE INDEX IF NOT EXISTS idx_scores_session ON scores(session_id);
CREATE INDEX IF NOT EXISTS idx_ledger_session ON ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_challenges_from ON challenges(from_user);
CREATE INDEX IF NOT EXISTS idx_challenges_to ON challenges(to_user);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_user);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_users_referred ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_outbox_user ON dev_outbox(user_id);
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at);
