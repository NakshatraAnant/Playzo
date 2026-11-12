# 41. Connect Five

> Five in a row on an open board.

| Field | Value |
|---|---|
| Game id | `connect-five` |
| Environment | Family |
| Engine | `server/games/family/connectFive.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/family/ConnectFive.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Connect Five

## 2. Game category
Strategy

## 3. Target age group
8+ (family-safe content; age label is advisory)

## 4. Core concept
Place pieces on a 13x13 board. The first to line up five in a row horizontally, vertically or diagonally wins.

## 5. Unique selling proposition
Threat-aware AI with three personalities across the difficulty levels.

## 6. Core gameplay loop
Place -> build threats -> block -> five in a row.

## 7. Game rules
- Players alternate placing one piece.
- Exactly five or more in a row wins.
- A full board is a draw.

## 8. User controls
Tap board.

## 9. Game state machine
lobby (rooms) / init (solo vs AI) -> playing (turn or simultaneous actions validated server-side) -> over -> results + persistence.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
Win +300.

## 12. Multiplayer rules
Formats: ai, versus, async. Max 2 players. Rooms run the server-authoritative engine; emotes-only communication.

## 13. Match duration
3-8 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Zen Garden**. Palette #2b2214 -> #0e0b06, accent #e8d5a8. Original vector cover art (`client/src/art/covers.tsx`, motif `connect-five`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Ambient focus": C# lydian, 71 BPM; glass pad, sub bass, bell arpeggio. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

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
