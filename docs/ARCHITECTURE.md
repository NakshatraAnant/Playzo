# Architecture

```
client/ (Vite + React 19 + TS)        server/ (Fastify 5 + @fastify/websocket)       shared/ (pure TS)
 ├ pages (lazy routes)                  ├ app.ts       security headers, CSRF, errors   ├ engine.ts   Engine contract
 ├ games/runtime.tsx  GameHost/Ctl ◄──► ├ sessions.ts  start / act / submit / end       ├ rng.ts      sfc32 (replay), BaseRng
 ├ games/family/*  25 UIs               ├ rooms.ts     WebSocket rooms, races, queue    ├ games/*     12 replay engines
 ├ games/lounge/*  25 UIs               ├ games/       registry + 13 family server      ├ cards.ts    deck + hand evaluators
 ├ art/covers.tsx  50 vector covers     │              engines + 25 lounge engines      ├ catalogue.ts 50 game records
 ├ three/  Hero3D, Dice3D (WebGL)       ├ auth / access / economy / progression        └ cosmetics.ts
 └ lib/  api, store, sound              ├ social / content / shop / admin / analytics
                                        ├ db.ts (node:sqlite, migrations) secureRng.ts (HMAC RNG)
                                        └ data/ trivia, facts, emoji, geo, words
```

## Engine contract (`shared/engine.ts`)
`init → apply(action, ctx) → isOver → result → view(player)`. Engines are pure and deterministic given `ctx.rng` and `ctx.now`. They throw `GameError` for illegal actions.

- **server mode:** state is JSON in `game_sessions.state`. Each POST `/api/sessions/:id/action` loads the state, rebuilds the RNG at its stored cursor, applies the action, settles any ledger intents, saves, and returns the player's **redacted** view. Per-session locks serialise concurrent actions.
- **replay mode:** the session returns a seed. The client runs the same engine locally and records `{...action, t}`. On finish, POST `/submit`; the server checks the timeline (monotonic order, maximum duration, `lastT ≤ wall-clock + 2.5s`), then re-runs the engine. Engine-level plausibility rules (minimum reaction times, input windows) throw `IMPLAUSIBLE`, which rejects the run.
- **timed engines** accept `{type:'tick'}`, which advances state on server time only.
- **Lounge engines** queue `ledger` intents (`stake`/`payout`); the session service posts them to the CHIPS ledger inside the same DB transaction, with idempotency keys `session:ref:kind`. `finalize()` resolves open rounds when a session closes.

## Randomness
| Use | Generator |
|---|---|
| Skill games (replay, daily, challenges, races, AI move noise) | `SeededRng` (sfc32, seeded by cyrb128 hash) |
| Lounge outcomes | `HmacRng`: HMAC-SHA256(serverSeed, block) → 8×u32 per block, rejection-sampled `int(n)`. Resumable by cursor; seed committed (SHA-256) at start, revealed at session end |

## Multiplayer
In-memory `Map<code, Room>` in one process; a 500 ms timer ticks timed engines, handles forfeits and cleans up rooms.
- **versus**: the server engine runs inside the room with player ids = user ids.
- **race**: the room hands out a seed; each racer's result arrives only through a verified replay session (`hooks.raceFinished`).
- Matches persist to `matches` / `match_players`.

## Access control layers
1. **Route:** `requireUser` / `requireRole`.
2. **Policy:** `access.ts`
   - `canSee` / `canPlay`: the Lounge returns 404 to anyone not entitled, so it never reveals itself.
   - Legal gate: approval, dev preview, or pending → 451.
   - Maintenance status.
3. **Social:** `socialPolicy` by age band.
4. **Admin:** role checks plus an audit log for every mutation.

## Performance
- Route-level code splitting; each game UI is its own chunk; Three.js is lazy (home hero, dice only).
- Brotli/gzip pre-compressed at build time.
- Measured (production build, localhost): TTFB 17 ms, FCP 0.56 s, LCP 1.89 s, heap 11 MB.
- Main bundle: 545 KB raw / 152 KB Brotli.

## Final-build additions (2026-11-12)
- **Access control (`server/access.ts`)**: `isQaPreview()` (flag + admin/tester role + non-production), `legalGate()` two-key check (`PLAYZO_LOUNGE_ENABLED` + `PLAYZO_LEGAL_APPROVALS` + approved `legal_reviews` record), `loungeAccess()` adds `lounge_disabled`, `age_verification_expired`, `visible`.
- **Persistent rooms (`server/rooms.ts`)**: every structural change is snapshotted to the `rooms` table (timed ticks at most every 2 s); `restoreRooms()` runs at startup; `onClose` flushes all rooms; deterministic match ids prevent duplicate results; WebSocket Origin allowlist; lobby members get a 60 s reconnect grace period.
- **Pause/resume (`server/sessions.ts`)**: `/api/sessions/:id/pause|resume` for solo family sessions; timed engines implement `shiftTime(state, dt)`; paused runs are not rankable.
- **Email (`server/email.ts`)**: provider adapter (`outbox` default, `resend`), HTML+text templates, delivery log with retries (30 s worker).
- **Notifications (`server/notify.ts`)**, **rewards/seasons/referrals (`server/rewards.ts`)**, **content flags (`server/contentFlags.ts`)**.
- **Admin**: legal records, live rooms (close), content flags, leaderboard moderation, email log, system health and read-only configuration (`server/admin.ts`, `client/src/pages/AdminExtra.tsx`).
- **Client**: notification bell and inbox, daily reward card, season board, match history, session management and notification preferences (`client/src/pages/Engage.tsx`); pause overlay, restart and Finish controls in `GameHost`.
- **Testing**: Vitest (unit, engine, statistics, API, WebSocket) + Playwright (`e2e/`, Edge, isolated in-memory instance on ports 5767/5768).
