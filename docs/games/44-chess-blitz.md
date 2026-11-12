# 44. Chess Blitz

> Full chess, quick clocks.

| Field | Value |
|---|---|
| Game id | `chess-blitz` |
| Environment | Family |
| Engine | `server/games/family/chessBlitz.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/family/ChessBlitz.tsx` |
| Status | Implemented · unit/integration tested |

## 1. Game title
Chess Blitz

## 2. Game category
Strategy

## 3. Target age group
8+ (family-safe content; age label is advisory)

## 4. Core concept
Complete chess rules (castling, en passant, promotion, checkmate, stalemate) with 5-minute blitz clocks, against the AI or friends.

## 5. Unique selling proposition
A complete rules engine with server-side clocks, and an AI that looks several moves ahead.

## 6. Core gameplay loop
Move -> clock ticks -> checkmate or flag.

## 7. Game rules
- Standard chess rules.
- 5 minutes per side in multiplayer; untimed against the AI on easy.
- Draws: stalemate, insufficient material, 50-move rule, threefold repetition.

## 8. User controls
Tap piece, tap destination.

## 9. Game state machine
lobby (rooms) / init (solo vs AI) -> playing (turn or simultaneous actions validated server-side) -> over -> results + persistence.

## 10. Difficulty model
Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.

## 11. Scoring model
Win +300, draw +100.

## 12. Multiplayer rules
Formats: ai, versus, async. Max 2 players. Rooms run the server-authoritative engine; emotes-only communication.

## 13. Match duration
5-15 min

## 14. Reward rules
XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.

## 15. Progression system
Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Obsidian Court**. Palette #1c1c2e -> #07070d, accent #c9a96e. Original vector cover art (`client/src/art/covers.tsx`, motif `chess-blitz`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Baroque chamber": F# harmonicMinor, 94 BPM; strings pad, walking bass, harpsi arpeggio, flute lead. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

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
