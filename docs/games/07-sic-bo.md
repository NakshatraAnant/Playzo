# 7. Sic Bo

> Three dice under paper lanterns.

| Field | Value |
|---|---|
| Game id | `sic-bo` |
| Environment | PLAYZO Lounge (18+, legally gated, Fun Chips only) |
| Engine | `server/games/lounge/baccaratSicbo.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/lounge/SicBo.tsx` |
| Status | Implemented · unit/integration tested · DISABLED pending legal review |

## 1. Game title
Sic Bo

## 2. Game category
Table & Wheel

## 3. Target age group
18+ (verified adults only; invisible to minors and guests)

## 4. Core concept
A three-dice table with small/big, totals, doubles and triples, with 3D dice tumbling in a glass shaker.

## 5. Unique selling proposition
Every bet shows its exact probability from the 216 possible dice outcomes.

## 6. Core gameplay loop
Place bets -> shake -> dice reveal -> settle.

## 7. Game rules
- Small (4-10) / Big (11-17) pay 1:1 and lose on any triple.
- Specific totals pay by rarity, from 6:1 (9-12) to 60:1 (4 or 17).
- Specific double 10:1, any triple 30:1, specific triple 150:1, single number 1-3:1.

## 8. User controls
Tap layout cells; Roll; Clear / Rebet.

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
World: **Lantern Dice**. Palette #3b0a06 -> #120403, accent #ffb547. Original vector cover art (`client/src/art/covers.tsx`, motif `sic-bo`).

## 18. 3D asset requirements
WebGL dice (client/src/three/Dice3D.tsx), canvas-generated pip textures, eased tumble settling on server values.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Procedural Web Audio effects (`client/src/lib/sound.ts`); global mute.

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
- Published mathematics: ["Small: 97.222%","Big: 97.222%","Any triple (30:1): 86.111%","Specific double (10:1): 81.481%","Specific triple (150:1): 69.907%","Single number (1-3:1): 92.13%"]
