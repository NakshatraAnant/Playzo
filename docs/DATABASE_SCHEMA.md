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

## Migration 002_final_build.sql (additive)
| Table / change | Purpose |
|---|---|
| `game_sessions.paused_at`, `paused_total_ms`, `was_paused` | Pause/resume for solo family games; paused runs are excluded from leaderboards and personal bests |
| `rooms` (code PK, status, snapshot JSON, version) | Persistent multiplayer rooms: engine state + RNG cursor + members, restored on restart; done/expired rows purged after 7 days |
| `legal_reviews` | Per-game legal / platform review history (scope, status, reference, reviewer, notes, recorded_by). Documentation only: never unlocks a game by itself |
| `dev_outbox` + `template`, `provider`, `status`, `attempts`, `last_error`, `sent_at`, `next_attempt_at`, `user_id` | Email delivery log (`outbox_only`, `queued`, `sent`, `failed`) with retry back-off |
| `notifications`, `users.notify_prefs` | In-app inbox (bounded to 100 per user) and user-controlled preferences |
| `users.referred_by` | Referral attribution (no rewards) |
| `auth_throttle` | Per-account login lockout (5 failures / 15 min) |
| `auth_sessions.user_agent`, `last_used_at` | Device label (coarse, e.g. "Edge on Windows") and last use for the session list |
| `daily_rewards` (user, day PK) | Daily check-in reward, one row per day |
| `season_points` (user, season PK) | Monthly season standings by XP |
| `content_flags` | Admin enable/disable for missions and shop cosmetics |
| Triggers `ledger_no_update/no_delete`, `audit_no_update/no_delete` | Ledger and audit log are append-only; ledger rows only disappear in an account-deletion cascade |
| Indexes on `rooms(status, updated_at)`, `match_players(user_id)`, `matches(created_at)`, `legal_reviews`, `dev_outbox(status, next_attempt_at)`, `notifications`, `season_points` | Query paths used by the app |

PostgreSQL mapping for 002: `TEXT` JSON columns → `jsonb`; triggers → `CREATE RULE`/`BEFORE` triggers raising exceptions; `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`.

## Migration 003_journey_support.sql (additive)
| Table / change | Purpose |
|---|---|
| `users.preferences` | JSON array of chosen game categories (onboarding step 3, Settings); only used to order recommendations |
| `support_tickets` (kind, subject, status, priority, assigned_to) | Help requests and complaints; statuses open → in_progress → awaiting_user → resolved → closed; safety tickets get high priority |
| `support_messages` (ticket_id, author_id, staff, body) | Conversation thread; staff messages are attributed to "PLAYZO Support" in the player view |
| Indexes on `analytics_events(name, day)`, `game_sessions(started_at)`, `users(created_at)` | Analytics dashboard queries |

## Backup, restore and startup validation
- Automatic daily backup (`VACUUM INTO`, newest 14 kept) plus Admin → System → Back up now and `npm run backup:db`.
- **Restore test:** Admin → System → Verify opens a backup read-only, runs `PRAGMA integrity_check` and reads migrations, users, ledger and matches.
- **Restore:** Admin → System → Restore (type RESTORE) stages `data/restore-request.json`. At the next start the server first saves the current database as `pre-restore-<time>.db`, then swaps in the backup, then runs migrations. Nothing is ever deleted. Tested in `tests/journey.test.ts`.
- **Startup validation:** `PRAGMA quick_check` on every start; the result is in `/api/health` (`dbCheck`) and logged loudly if not `ok`.
- **Graceful shutdown:** SIGINT/SIGTERM flush live rooms, checkpoint the WAL and close the database.
