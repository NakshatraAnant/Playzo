# 40. Hex Conquest

> Connect your shores across the hex sea.

| Field | Value |
|---|---|
| Game id | `hex-conquest` |
| Environment | Family |
| Engine | `server/games/family/hexConquest.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/family/HexConquest.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Hex Conquest

## 2. Game category
Strategy

## 3. Target age group
10+ (family-safe content; age label is advisory)

## 4. Core concept
Place stones on a hexagonal board to connect your two opposite shores. A draw is impossible.

## 5. Unique selling proposition
A pure connection strategy game with an AI that evaluates shortest paths.

## 6. Core gameplay loop
Place stone -> block and connect -> link shores.

## 7. Game rules
- Players alternate placing one stone.
- Blue connects left-right, Coral connects top-bottom.
- First to connect wins.

## 8. User controls
Tap hexes.

## 9. Game state machine
lobby (rooms) / init (solo vs AI) -> playing (turn or simultaneous actions validated server-side) -> over -> results + persistence.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
Win +300; faster wins score more.

## 12. Multiplayer rules
Formats: ai, versus, async. Max 2 players. Rooms run the server-authoritative engine; emotes-only communication.

## 13. Match duration
3-8 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Hex Sea**. Palette #04324a -> #010d14, accent #ff7d6b. Original vector cover art (`client/src/art/covers.tsx`, motif `hex-conquest`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Cinematic strategy": G# minor, 95 BPM; strings pad, pulse bass, toms drums, pluck arpeggio, brass lead. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

## 21. Backend requirements
State stored in `game_sessions.state`; actions via POST /api/sessions/:id/action.

## 22. Data events
game_start, game_complete / game_rejected / game_end, achievement_unlocked, room_created, room_started, room_finished.

## 23. Edge cases
- Illegal/out-of-turn actions -> 422 with a friendly message; state unchanged.
- Abandoned sessions are reaped after 2 hours.
- Network failure -> retry/resume (server-mode sessions can be resumed from Continue Playing).
- Guests can play fully; progress transfers on registration.

## 24. Security requirements
Server-authoritative results; redacted views (no hidden information leaves the server); per-session locks; rate limits; CSRF header; no client-submitted scores accepted.

## 25. Test scenarios
- Determinism and rule tests in `tests/serverEngines.test.ts`.
- Session flow + anti-cheat in `tests/api.test.ts`; live multiplayer in `tests/multiplayer.test.ts` (representative games).
