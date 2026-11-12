# Database Schema

- **Engine:** SQLite via `node:sqlite` (WAL, foreign keys ON, busy_timeout 5s). File: `data/playzo.db`.
- **Migrations:** `server/migrations/NNN_name.sql`, applied in order inside a transaction and tracked in `schema_migrations`. Never edit an applied migration; add a new one.
- **Backups:** `npm run backup:db` (online `VACUUM INTO`, keeps the newest 14 in `data/backups/`).

| Table | Purpose | Key constraints / indexes |
|---|---|---|
| users | Accounts (guest or registered), age band, role, status, privacy, Lounge controls, XP/level | `email` unique, `username` unique (NOCASE) |
| auth_sessions | Session tokens (SHA-256 hash only) | FK users ON DELETE CASCADE; idx user |
| auth_tokens | Email verify / reset / parental consent (hashed, expiring, single-use) | FK cascade |
| dev_outbox | Local stand-in for email delivery (dev only) | - |
| consents | Terms, privacy, parental, Lounge terms (versioned) | FK cascade |
| balances | Per-user ZO / CHIPS | PK (user, currency); `CHECK balance >= 0`; currency CHECK |
| ledger | Every credit event: id, user, currency, signed amount, balance_after, type, source, session, **idempotency_key UNIQUE**, meta | idx (user, created_at) |
| game_sessions | Engine sessions: mode, seed (secret until end for server/Lounge), commit, rng_cursor, rules_version, state, context, score/result, reject_reason | idx (user, started_at), (game, status, score) |
| game_actions | Audit log of actions / verified replay logs | PK (session, seq) |
| game_stats | Per-user per-game plays, wins, best, mastery | PK (user, game) |
| scores | Leaderboard entries by ISO week and day, with context | idx (game, week, score), (game, day, context, score) |
| achievements, mission_progress, favourites | Retention | composite PKs |
| friendships | `user_a < user_b` CHECK; pending/accepted | PK pair |
| blocks, reports | Safety | - |
| challenges | Async same-seed challenges | - |
| matches, match_players | Multiplayer results | FK cascade |
| inventory, purchases | Cosmetics; dev-mock purchases | - |
| game_settings | Live / maintenance / hidden per game | - |
| ad_placements, ad_impressions | Contextual placements and frequency caps | - |
| analytics_events | First-party events (`user_id` nulled on account deletion) | idx (day, name), (user, day) |
| audit_log, deletion_requests (hashed id), client_errors | Operations and compliance | - |

## PostgreSQL mapping (production)
- Types: `TEXT` ids → `text`/`uuid`; ISO timestamps → `timestamptz`; JSON text → `jsonb`; `INTEGER` 0/1 flags → `boolean`.
- Ledger posting: `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` plus `SELECT … FOR UPDATE` on `balances`.
- Wrap ledger postings in `SERIALIZABLE` or row-locked transactions.
- Partition `analytics_events` by month.
