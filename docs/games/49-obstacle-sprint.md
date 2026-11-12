# 49. Obstacle Sprint

> Jump, duck and dash across the rooftops.

| Field | Value |
|---|---|
| Game id | `obstacle-sprint` |
| Environment | Family |
| Engine | `shared/games/obstacleSprint.ts` (mode: **replay**, rules v1.0.0) |
| UI | `client/src/games/family/ObstacleSprint.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Obstacle Sprint

## 2. Game category
Reaction & Party

## 3. Target age group
6+ (family-safe content; age label is advisory)

## 4. Core concept
A rooftop runner that keeps speeding up. Jump the vents and duck the drones. Physics run on a fixed timestep, so every run can be verified.

## 5. Unique selling proposition
Fixed-step physics means the server re-runs your exact run to verify the distance.

## 6. Core gameplay loop
Run -> react -> survive -> faster.

## 7. Game rules
- Jump over ground obstacles, duck under drones.
- Speed increases over time.
- Score = distance + 25 per orb.

## 8. User controls
Tap zones / Space / Down arrow.

## 9. Game state machine
loading -> tutorial (first time) -> countdown -> playing (local engine, actions logged) -> over -> submit log -> server replay verification -> results.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
Distance + orbs x25.

## 12. Multiplayer rules
Formats: solo, race, async. Max 8 players. Live races share a seed; each score comes from a server-verified replay.

## 13. Match duration
1-3 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, animated board driven by the local deterministic engine, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Rooftop Run**. Palette #2a1040 -> #0b0414, accent #ff8a3d. Original vector cover art (`client/src/art/covers.tsx`, motif `obstacle-sprint`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), canvas render loop at display refresh; reduced-motion users get instant transitions.

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
