# 47. Memory Match Duel

> Flip, remember, match, and steal the lead.

| Field | Value |
|---|---|
| Game id | `memory-duel` |
| Environment | Family |
| Engine | `server/games/family/memoryDuel.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/family/MemoryDuel.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Memory Match Duel

## 2. Game category
Reaction & Party

## 3. Target age group
6+ (family-safe content; age label is advisory)

## 4. Core concept
Find matching pairs of creature cards. In duels, a match earns another turn. Card faces stay hidden on the server.

## 5. Unique selling proposition
A turn-based memory duel where the server holds all hidden cards.

## 6. Core gameplay loop
Flip two -> match? keep and go again : pass turn.

## 7. Game rules
- Flip two cards per turn.
- A match scores a point and earns another turn.
- Most pairs wins. Solo: fewer flips scores higher.

## 8. User controls
Tap cards.

## 9. Game state machine
lobby (rooms) / init (solo vs AI) -> playing (turn or simultaneous actions validated server-side) -> over -> results + persistence.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
Pairs; solo score 1000 - 10 x extra flips.

## 12. Multiplayer rules
Formats: solo, versus, async. Max 2 players. Rooms run the server-authoritative engine; emotes-only communication.

## 13. Match duration
2-5 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Critter Grove**. Palette #0f3a2a -> #04120c, accent #ffd1a1. Original vector cover art (`client/src/art/covers.tsx`, motif `memory-duel`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Bright marimba pop": E major, 107 BPM; warm pad, pluck bass, shaker drums, marimba arpeggio, whistle lead. Capped to pad and bass so it never competes with the tones or patterns the player memorises. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

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
