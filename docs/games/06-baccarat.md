# 6. Baccarat

> Jade Pavilion Punto Banco.

| Field | Value |
|---|---|
| Game id | `baccarat` |
| Environment | PLAYZO Lounge (18+, legally gated, Fun Chips only) |
| Engine | `server/games/lounge/baccaratSicbo.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/lounge/Baccarat.tsx` |
| Status | Implemented · unit/integration tested · DISABLED pending legal review |

## 1. Game title
Baccarat

## 2. Game category
Table & Wheel

## 3. Target age group
18+ (verified adults only; invisible to minors and guests)

## 4. Core concept
Eight-deck Punto Banco with the full third-card tableau, 5% banker commission and a tie bet paying 8:1.

## 5. Unique selling proposition
A live tableau panel explains why each third card was or was not drawn.

## 6. Core gameplay loop
Bet Player / Banker / Tie -> cards dealt by fixed rules -> settle.

## 7. Game rules
- Hands total modulo 10.
- Third-card draws follow the standard tableau.
- Player 1:1, Banker 0.95:1, Tie 8:1 (Player/Banker push on tie).

## 8. User controls
Bet buttons, Deal, Rebet.

## 9. Game state machine
idle -> place bets -> resolve (single server action) -> settle -> idle.

## 10. Difficulty model
Not applicable (chance simulation); identical probabilities for every player.

## 11. Scoring model
Fun Chips only.

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
World: **Jade Pavilion**. Palette #063226 -> #03100c, accent #e7c873. Original vector cover art (`client/src/art/covers.tsx`, motif `baccarat`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Midnight noir": C# minor, 76 BPM; warm pad, walking bass, brush drums, keys lead. Lounge rule: calm level, no escalating layers; returns below the stake use a neutral cue, never a win sound. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

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
- Published mathematics: ["Banker (0.95:1): 98.94%","Player (1:1): 98.76%","Tie (8:1): 85.64%"]
