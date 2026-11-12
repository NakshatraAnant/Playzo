# Feature Completion Matrix (2026-11-12)

Statuses: **COMPLETE** (implemented and verified by automated tests), **PARTIAL** (works, with a documented gap), **BLOCKED** (needs an external credential, provider, legal or platform decision), **NOT STARTED**.
Evidence: `U` unit/engine tests · `I` API integration tests · `W` WebSocket tests · `E` browser (Playwright, Edge) tests · `M` manual check.

## Accounts and access
| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Guest play, guest → account upgrade keeping progress | COMPLETE | I, E | |
| Sign-up, sign-in, sign-out, scrypt password hashing | COMPLETE | I, E | |
| Session management: list devices, revoke one / all others | COMPLETE | I, E | Device label only; token hashes never exposed |
| Session revocation on password reset / change / suspension | COMPLETE | I | |
| Login protection: per-account lockout + per-IP rate limits | COMPLETE | I, E | |
| Email verification (token, resend) | PARTIAL | I, E | Works end to end via the local outbox; external delivery **BLOCKED** on provider credentials |
| Password reset / account recovery | PARTIAL | I, E | Same as above |
| Account deletion (permanent, cascading) | COMPLETE | I, E | |
| Role-based access (user, tester, support, admin) | COMPLETE | I, E | |
| Google / Apple sign-in | BLOCKED | I (returns 501) | Needs OAuth client credentials and a public redirect URL |
| Under-13 parental consent workflow | PARTIAL | I | Consent link works; parent email delivery blocked on provider |
| Age bands enforced server-side (child / teen / adult / unknown) | COMPLETE | I, E | |

## Lounge (18+) safeguards
| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Public Lounge hard-disabled by default (master switch OFF) | COMPLETE | I, E | `PLAYZO_LOUNGE_ENABLED` defaults to false |
| Internal QA preview: flag + admin/tester role + localhost, never production | COMPLETE | I, E | |
| Two-key legal gate (config reference + matching approved legal record + master switch) | COMPLETE | I, E | |
| Per-game legal review records (India law, state law, Google Play, App Store) | COMPLETE | E | Admin → Legal |
| Minors: no Lounge routes, APIs, rooms, notifications, listings or sitemap entries | COMPLETE | I, E | |
| Certified age verification | BLOCKED | I | No certified provider configured; Lounge fails closed outside isolated QA |
| Verification expiry / re-verification (365 days, configurable) | COMPLETE | I | |
| Cool-off, daily time limits, 30-minute reality check | COMPLETE | I, M | |
| Legal clearance for any Lounge game | BLOCKED | - | Gates G1-G8 open; no game is approved |

## Games
| Feature | Status | Evidence | Notes |
|---|---|---|---|
| 25 family games: individual engines, rules, scoring, tutorials, difficulty | COMPLETE | U, E | See GAME_COMPLETION_MATRIX.md |
| Pause / resume (solo family games; timed games' server clocks shift) | COMPLETE | I, E | Paused runs excluded from leaderboards |
| Restart and "Finish & submit" controls | COMPLETE | E | |
| Server-side score validation (replay verification, server-authoritative state) | COMPLETE | U, I | |
| 25 Lounge simulations: individual rule tests + statistical RTP tests | COMPLETE | U, E (QA) | Disabled for the public |

## Sound and music
| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Adaptive soundtrack for every game (49 composed themes + Rhythm Rush's own beat-matched track) | COMPLETE | U (music.test.ts), E (music.spec.ts), M (live check) | Procedurally composed and synthesised on the device; no recorded audio files |
| Mix bus: generated-impulse reverb, tempo-synced ping-pong delay, glue compressor, music ducking under effects | COMPLETE | M | |
| Adaptive layers, hurry-up when the clock is low, underwater pause, result stingers, room lobby/match music | COMPLETE | U, E | |
| Music/effects volume, in-game music toggle, optional hub theme, style previews | COMPLETE | E | |
| Responsible Lounge audio (calm level, no escalation, neutral cue for returns below the stake, no jackpot fanfare) | COMPLETE | U (source checks) | |

## Multiplayer
| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Private rooms, invite codes and links, ready/start, rematch | COMPLETE | W, E | |
| 1v1, 2v2 teams, races (shared seed), group rooms up to 8 | COMPLETE | W | |
| Quick match (13+, age-banded queues) | PARTIAL | M | Not covered by an automated two-client test |
| Friend challenges (async, same seed) | COMPLETE | I | |
| Persistent rooms: survive server restart, reconnect, lobby grace period | COMPLETE | W, E | SQLite snapshot per change |
| Disconnection forfeits, match expiry, room cleanup | COMPLETE | W | |
| Duplicate result prevention, match history | COMPLETE | W, I | |
| Cross-site WebSocket protection (Origin allowlist) | COMPLETE | W | |
| Multi-instance scaling (pub/sub) | NOT STARTED | - | Single process by design for local use |

## Engagement and economy
| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Daily puzzle, daily/weekly missions, streaks, achievements, levels, mastery | COMPLETE | I, E | |
| Weekly + all-time + friends leaderboards | COMPLETE | I, E | |
| Monthly seasons (XP-based, no prizes) | COMPLETE | I, E | |
| Daily check-in reward (10-40 ZO, no loss framing) | COMPLETE | I, E | |
| Notifications inbox + preferences + break reminders | COMPLETE | I, E | No push or marketing messages |
| Referral tracking (attribution only, no rewards) | COMPLETE | I | |
| Append-only, idempotent ledger; non-negative balances | COMPLETE | I | DB triggers |
| Cosmetic shop with ZO (earned only), inventory, equip | COMPLETE | I, E | |
| Admin content flags for missions and cosmetics | COMPLETE | E | |
| Real payments | BLOCKED | - | Test-mode checkout only, clearly labelled TEST MODE |

## Admin
| Feature | Status | Evidence |
|---|---|---|
| Users (search, status, roles incl. tester, sign-out-everywhere, ZO adjust) | COMPLETE | I, E |
| Reports and moderation; room monitoring and closure | COMPLETE | E |
| Games (status: live/maintenance/hidden), legal records, content flags, leaderboard moderation | COMPLETE | E |
| Economy ledger, suspicious runs, analytics overview | COMPLETE | E |
| Email delivery log with retry; system health; read-only configuration; audit log | COMPLETE | E |

## Platform
| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Email provider adapter (Resend) with delivery tracking and retries | PARTIAL | I | Adapter implemented; not exercised against the live service (no credentials) |
| SEO, OG, favicon, sitemap/robots, prerendered pages | COMPLETE | I, E | |
| Help & contact page | PARTIAL | E | Placeholder; operator details intentionally blank |
| Responsive 360-1920px without horizontal overflow | COMPLETE | E | |
| PostgreSQL | NOT STARTED | - | SQLite used; schema mapping documented |
| Service worker / offline | NOT STARTED | - | |
