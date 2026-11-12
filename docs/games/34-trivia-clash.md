# 34. Trivia Clash

> Fast questions, faster rivals.

| Field | Value |
|---|---|
| Game id | `trivia-clash` |
| Environment | Family |
| Engine | `server/games/family/triviaClash.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/family/RoundsGame.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Trivia Clash

## 2. Game category
Word & Knowledge

## 3. Target age group
10+ (family-safe content; age label is advisory)

## 4. Core concept
Ten questions across science, space, India, nature, sport and technology. Answer quickly for bonus points and use a 50:50 lifeline once.

## 5. Unique selling proposition
Real-time team trivia (2v2) where team scores combine.

## 6. Core gameplay loop
Question -> answer quickly -> reveal -> next.

## 7. Game rules
- 10 questions, 15 seconds each.
- Correct: 100 + speed bonus (up to 50).
- One 50:50 lifeline per game in solo mode.

## 8. User controls
Tap answers or keys 1-4.

## 9. Game state machine
lobby (rooms) / init (solo vs AI) -> playing (turn or simultaneous actions validated server-side) -> over -> results + persistence.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
100 + speed bonus per correct answer.

## 12. Multiplayer rules
Formats: solo, versus, teams, group, async. Max 8 players. Rooms run the server-authoritative engine; emotes-only communication.

## 13. Match duration
3 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Quiz Arena**. Palette #0a1f5c -> #030919, accent #ff5a5f. Original vector cover art (`client/src/art/covers.tsx`, motif `trivia-clash`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Quiz-show funk": G mixolydian, 125 BPM; organ pad, octave bass, breaks drums, pluck arpeggio, brass lead. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

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
