# 31. Grid Genius

> Number grids with exactly one answer.

| Field | Value |
|---|---|
| Game id | `grid-genius` |
| Environment | Family |
| Engine | `shared/games/gridGenius.ts` (mode: **replay**, rules v1.0.0) |
| UI | `client/src/games/family/GridGenius.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Grid Genius

## 2. Game category
Brain & Logic

## 3. Target age group
8+ (family-safe content; age label is advisory)

## 4. Core concept
Fill the grid so every row, column and box contains each number once. 4x4, 6x6 and 9x9 boards, each with a single solution.

## 5. Unique selling proposition
Puzzles are generated and checked by a solver to guarantee exactly one solution.

## 6. Core gameplay loop
Read clues -> place numbers -> grid completes.

## 7. Game rules
- Each row, column and box contains each number once.
- Givens cannot be changed.
- Score depends on time and mistakes.

## 8. User controls
Tap cell + number pad; keyboard digits.

## 9. Game state machine
loading -> tutorial (first time) -> countdown -> playing (local engine, actions logged) -> over -> submit log -> server replay verification -> results.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
1000 - time penalty - 50 per mistake (min 100).

## 12. Multiplayer rules
Formats: solo, race, async, daily. Max 8 players. Live races share a seed; each score comes from a server-verified replay.

## 13. Match duration
3-15 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, animated board driven by the local deterministic engine, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Blueprint**. Palette #08284a -> #020a14, accent #5cc8ff. Original vector cover art (`client/src/art/covers.tsx`, motif `grid-genius`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Procedural Web Audio effects (`client/src/lib/sound.ts`); global mute.

## 21. Backend requirements
Session start returns a seed; POST /submit re-simulates the action log with the same engine (`verifyReplay`), enforcing timeline/wall-clock and engine plausibility rules.

## 22. Data events
game_start, game_complete / game_rejected / game_end, achievement_unlocked, room_created, room_started, room_finished.

## 23. Edge cases
- Out-of-order or superhuman timestamps -> run rejected (422) and logged for admin review.
- Abandoned sessions are reaped after 2 hours.
- Network failure -> retry/resume (server-mode sessions can be resumed from Continue Playing).
- Guests can play fully; progress transfers on registration.

## 24. Security requirements
Server-authoritative results; deterministic replay verification; per-session locks; rate limits; CSRF header; no client-submitted scores accepted.

## 25. Test scenarios
- Determinism and rule tests in `tests/replayEngines.test.ts`.
- Session flow + anti-cheat in `tests/api.test.ts`; live multiplayer in `tests/multiplayer.test.ts` (representative games).
