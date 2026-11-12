# 37. Geography Sprint

> Capitals, continents and flags at full sprint.

| Field | Value |
|---|---|
| Game id | `geo-sprint` |
| Environment | Family |
| Engine | `server/games/family/geoSprint.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/family/GeoSprint.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Geography Sprint

## 2. Game category
Word & Knowledge

## 3. Target age group
8+ (family-safe content; age label is advisory)

## 4. Core concept
A 60-second sprint mixing capitals, continents and flag recognition from around the world.

## 5. Unique selling proposition
Three question styles mixed in each run, with a world-region recap at the end.

## 6. Core gameplay loop
Question -> answer -> next, until the sprint ends.

## 7. Game rules
- 60 seconds.
- Correct: +100; wrong: -25 and a 1-second lock.
- Regions you missed are listed at the end.

## 8. User controls
Tap answers or keys 1-4.

## 9. Game state machine
init (server holds state) -> playing (each action validated server-side) -> over -> results.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
+100 correct, -25 wrong.

## 12. Multiplayer rules
Formats: solo, async. Max 1 players. Rooms run the server-authoritative engine; emotes-only communication.

## 13. Match duration
1 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Atlas Run**. Palette #003049 -> #001018, accent #fcbf49. Original vector cover art (`client/src/art/covers.tsx`, motif `geo-sprint`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Procedural Web Audio effects (`client/src/lib/sound.ts`); global mute.

## 21. Backend requirements
State stored in `game_sessions.state`; actions via POST /api/sessions/:id/action.

## 22. Data events
game_start, game_complete / game_rejected / game_end, achievement_unlocked, room_created, room_started, room_finished.

## 23. Edge cases
- Illegal/out-of-turn actions -> 422 with a friendly message; state unchanged.
- Deadlines enforced on server time; late actions rejected; ticks advance rounds.
- Network failure -> retry/resume (server-mode sessions can be resumed from Continue Playing).
- Guests can play fully; progress transfers on registration.

## 24. Security requirements
Server-authoritative results; redacted views (no hidden information leaves the server); per-session locks; rate limits; CSRF header; no client-submitted scores accepted.

## 25. Test scenarios
- Determinism and rule tests in `tests/serverEngines.test.ts`.
- Session flow + anti-cheat in `tests/api.test.ts`; live multiplayer in `tests/multiplayer.test.ts` (representative games).
