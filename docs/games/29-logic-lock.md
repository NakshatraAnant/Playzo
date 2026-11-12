# 29. Logic Lock

> Crack the vault of linked dials.

| Field | Value |
|---|---|
| Game id | `logic-lock` |
| Environment | Family |
| Engine | `shared/games/logicLock.ts` (mode: **replay**, rules v1.0.0) |
| UI | `client/src/games/family/LogicLock.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Logic Lock

## 2. Game category
Brain & Logic

## 3. Target age group
8+ (family-safe content; age label is advisory)

## 4. Core concept
Each lever turns several dials at once. Work out the combination that sets every dial to the key mark.

## 5. Unique selling proposition
Every lock is guaranteed solvable, and the minimum number of moves is known.

## 6. Core gameplay loop
Study links -> pull levers -> align dials -> next lock.

## 7. Game rules
- Each lever rotates its linked dials by one notch.
- Align all dials to 0 to open the lock.
- Five locks per run; bonus for solving near the minimum moves.

## 8. User controls
Tap levers; Undo.

## 9. Game state machine
loading -> tutorial (first time) -> countdown -> playing (local engine, actions logged) -> over -> submit log -> server replay verification -> results.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
200 per lock + optimality bonus.

## 12. Multiplayer rules
Formats: solo, race, async, daily. Max 8 players. Live races share a seed; each score comes from a server-verified replay.

## 13. Match duration
3-8 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, animated board driven by the local deterministic engine, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Brass Vault**. Palette #2d1f08 -> #0c0803, accent #ffc857. Original vector cover art (`client/src/art/covers.tsx`, motif `logic-lock`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Lo-fi study beat": E dorian, 82 BPM; warm pad, sub bass, lofi drums, kalimba arpeggio, keys lead. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

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
