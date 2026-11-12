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
