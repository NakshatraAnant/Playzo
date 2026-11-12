# 38. Fact or Fiction

> Swipe true or false on surprising statements.

| Field | Value |
|---|---|
| Game id | `fact-or-fiction` |
| Environment | Family |
| Engine | `server/games/family/factOrFiction.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/family/FactOrFiction.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Fact or Fiction

## 2. Game category
Word & Knowledge

## 3. Target age group
8+ (family-safe content; age label is advisory)

## 4. Core concept
Swipe right for fact and left for fiction on surprising statements. Each reveal comes with a short explanation.

## 5. Unique selling proposition
Every answer teaches something with a one-line explanation.

## 6. Core gameplay loop
Read -> swipe -> learn -> next.

## 7. Game rules
- 12 statements per game.
- Correct: +100; streak bonus +20 per consecutive correct answer.
- No time limit, so read carefully.

## 8. User controls
Swipe or tap buttons; arrow keys.

## 9. Game state machine
init (server holds state) -> playing (each action validated server-side) -> over -> results.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
100 + streak bonus per correct answer.

## 12. Multiplayer rules
Formats: solo, async. Max 1 players. Rooms run the server-authoritative engine; emotes-only communication.

## 13. Match duration
3 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Curiosity Lab**. Palette #1b2a4a -> #060a14, accent #62f0c5. Original vector cover art (`client/src/art/covers.tsx`, motif `fact-or-fiction`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Quiz-show funk": D# mixolydian, 116 BPM; organ pad, octave bass, breaks drums, pluck arpeggio, brass lead. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

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
