# 48. Rhythm Rush

> Tap the beat on four glowing lanes.

| Field | Value |
|---|---|
| Game id | `rhythm-rush` |
| Environment | Family |
| Engine | `shared/games/rhythmRush.ts` (mode: **replay**, rules v1.0.0) |
| UI | `client/src/games/family/RhythmRush.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Rhythm Rush

## 2. Game category
Reaction & Party

## 3. Target age group
8+ (family-safe content; age label is advisory)

## 4. Core concept
Notes flow down four lanes in time with a procedurally composed beat. Hit them on the line for Perfect and Great judgments.

## 5. Unique selling proposition
An original synthwave track composed live in your browser for every seed.

## 6. Core gameplay loop
Notes fall -> tap on beat -> combo -> score.

## 7. Game rules
- Perfect (+/-60ms): 300. Great (+/-120ms): 150. Good (+/-180ms): 50.
- Missing a note breaks the combo.
- Combo adds +1% per note (max +50%).

## 8. User controls
Tap lanes or keys D F J K.

## 9. Game state machine
loading -> tutorial (first time) -> countdown -> playing (local engine, actions logged) -> over -> submit log -> server replay verification -> results.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
Judgment points x combo bonus.

## 12. Multiplayer rules
Formats: solo, race, async. Max 8 players. Live races share a seed; each score comes from a server-verified replay.

## 13. Match duration
60 seconds

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, animated board driven by the local deterministic engine, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Synth Highway**. Palette #1a0538 -> #05010d, accent #ff3df0. Original vector cover art (`client/src/art/covers.tsx`, motif `rhythm-rush`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), canvas render loop at display refresh; reduced-motion users get instant transitions.

## 20. Sound requirements
Procedural Web Audio effects (`client/src/lib/sound.ts`) plus a procedurally composed backing track scheduled on the audio clock; global mute.

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
