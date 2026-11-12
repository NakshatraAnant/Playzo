# 32. Code Breaker

> Deduce the secret colour code.

| Field | Value |
|---|---|
| Game id | `code-breaker` |
| Environment | Family |
| Engine | `server/games/family/codeBreaker.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/family/CodeBreaker.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Code Breaker

## 2. Game category
Brain & Logic

## 3. Target age group
8+ (family-safe content; age label is advisory)

## 4. Core concept
A secret code of coloured gems is locked on the server. Each guess earns exact and partial match clues. Crack it in as few guesses as possible.

## 5. Unique selling proposition
The code is held only on the server, so it cannot be peeked at.

## 6. Core gameplay loop
Guess -> read clues -> deduce -> crack.

## 7. Game rules
- Code length 4 (5 on hard), 6 colours, repeats allowed.
- Gold peg = right colour, right place. Silver = right colour, wrong place.
- 10 guesses maximum.

## 8. User controls
Tap gems to build a guess; Submit.

## 9. Game state machine
init (server holds state) -> playing (each action validated server-side) -> over -> results.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
100 x (11 - guesses used).

## 12. Multiplayer rules
Formats: solo, async. Max 1 players. Rooms run the server-authoritative engine; emotes-only communication.

## 13. Match duration
3-8 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Gem Cipher**. Palette #2a0a2a -> #0b030b, accent #ff5cad. Original vector cover art (`client/src/art/covers.tsx`, motif `code-breaker`).

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
- Abandoned sessions are reaped after 2 hours.
- Network failure -> retry/resume (server-mode sessions can be resumed from Continue Playing).
- Guests can play fully; progress transfers on registration.

## 24. Security requirements
Server-authoritative results; redacted views (no hidden information leaves the server); per-session locks; rate limits; CSRF header; no client-submitted scores accepted.

## 25. Test scenarios
- Determinism and rule tests in `tests/serverEngines.test.ts`.
- Session flow + anti-cheat in `tests/api.test.ts`; live multiplayer in `tests/multiplayer.test.ts` (representative games).
