# 26. Mind Maze

> Glowing labyrinths that grow with you.

| Field | Value |
|---|---|
| Game id | `mind-maze` |
| Environment | Family |
| Engine | `shared/games/mindMaze.ts` (mode: **replay**, rules v1.0.0) |
| UI | `client/src/games/family/MindMaze.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Mind Maze

## 2. Game category
Brain & Logic

## 3. Target age group
6+ (family-safe content; age label is advisory)

## 4. Core concept
Guide a firefly through three hand-generated mazes per run and collect light orbs on the way. Fewer steps means a brighter score.

## 5. Unique selling proposition
Every maze is generated from a seed, so friends can race the same maze.

## 6. Core gameplay loop
Explore -> collect orbs -> reach the exit -> next, larger maze.

## 7. Game rules
- Move one cell at a time; walls block.
- Orbs are worth 50; finishing a maze gives 300 plus an efficiency bonus.
- Three mazes per run, growing in size.

## 8. User controls
Swipe / arrow keys / on-screen D-pad.

## 9. Game state machine
loading -> tutorial (first time) -> countdown -> playing (local engine, actions logged) -> over -> submit log -> server replay verification -> results.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
Orbs x50 + 300 per maze + efficiency bonus.

## 12. Multiplayer rules
Formats: solo, race, async, daily. Max 8 players. Live races share a seed; each score comes from a server-verified replay.

## 13. Match duration
3-6 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, animated board driven by the local deterministic engine, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Firefly Labyrinth**. Palette #06213a -> #020812, accent #ffe066. Original vector cover art (`client/src/art/covers.tsx`, motif `mind-maze`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Lo-fi study beat": E dorian, 87 BPM; warm pad, sub bass, lofi drums, kalimba arpeggio, keys lead. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

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
