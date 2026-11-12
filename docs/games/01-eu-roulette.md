# 1. European Roulette

> One zero. Thirty-seven pockets. Riviera nights.

| Field | Value |
|---|---|
| Game id | `eu-roulette` |
| Environment | PLAYZO Lounge (18+, legally gated, Fun Chips only) |
| Engine | `server/games/lounge/roulette.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/lounge/Roulette.tsx` |
| Status | Implemented · unit/integration tested · DISABLED pending legal review |

## 1. Game title
European Roulette

## 2. Game category
Table & Wheel

## 3. Target age group
18+ (verified adults only; invisible to minors and guests)

## 4. Core concept
A single-zero wheel simulation with inside and outside bets, a brass-and-emerald table and a physically eased ball spin. Play with free, non-redeemable Fun Chips only.

## 5. Unique selling proposition
Every spin shows its pocket probability and the published 97.30% theoretical return.

## 6. Core gameplay loop
Place chips on the layout -> spin -> watch the ball settle -> see settled bets -> rebet or adjust.

## 7. Game rules
- 37 pockets: 0-36.
- Straight number pays 35:1; split 17:1; dozen/column 2:1; red/black, odd/even, 1-18/19-36 pay 1:1.
- Zero loses all outside bets.

## 8. User controls
Tap chips and layout cells; Spin button; Clear / Undo / Rebet.

## 9. Game state machine
idle -> place bets -> resolve (single server action) -> settle -> idle.

## 10. Difficulty model
Not applicable (chance simulation); identical probabilities for every player.

## 11. Scoring model
Fun Chips only. Session net shown; nothing is redeemable.

## 12. Multiplayer rules
Solo against the house or rule-driven bots only. No player-to-player transfer of chips.

## 13. Match duration
2-10 min

## 14. Reward rules
No XP, achievements or ZO from Lounge outcomes. Fun Chips are free, non-purchasable, non-transferable and non-redeemable.

## 15. Progression system
None by design (no reward loop around chance play).

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Riviera Midnight**. Palette #04261c -> #0b0f1e, accent #d8b45a. Original vector cover art (`client/src/art/covers.tsx`, motif `eu-roulette`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Velvet lounge jazz": G dorian, 100 BPM; warm pad, walking bass, brush drums, keys lead. Lounge rule: calm level, no escalating layers; returns below the stake use a neutral cue, never a win sound. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

## 21. Backend requirements
State stored in `game_sessions.state`; actions via POST /api/sessions/:id/action; RNG = HMAC-SHA256 stream with committed seed; stakes/payouts settled through the idempotent CHIPS ledger.

## 22. Data events
game_start, game_complete / game_rejected / game_end, achievement_unlocked.

## 23. Edge cases
- Illegal/out-of-turn actions -> 422 with a friendly message; state unchanged.
- Abandoned sessions are reaped after 2 hours.
- Session closed mid-round -> resolved by published close-out rules (e.g. blackjack auto-stand, poker fold + chips returned).
- Insufficient Fun Chips -> 422 INSUFFICIENT_CHIPS; balances can never go negative (DB CHECK + ledger guard).

## 24. Security requirements
Server-authoritative results; redacted views (no hidden information leaves the server); per-session locks; rate limits; CSRF header; age assurance + lounge terms + legal gate checked on every action; Lounge invisible (404) without entitlement.

## 25. Test scenarios
- Statistical RTP/z-test and distribution checks in `tests/fairness.test.ts`.
- Published mathematics: ["straight: 97.297%","split: 97.297%","dozen: 97.297%","column: 97.297%","red: 97.297%","black: 97.297%","odd: 97.297%","even: 97.297%","low: 97.297%","high: 97.297%"]
