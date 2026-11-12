# 13. Three Card Poker

> Triad Table: ante, play, and a Pair Plus side bet.

| Field | Value |
|---|---|
| Game id | `three-card-poker` |
| Environment | PLAYZO Lounge (18+, legally gated, Fun Chips only) |
| Engine | `server/games/lounge/tableCards.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/lounge/ThreeCardPoker.tsx` |
| Status | Implemented · unit/integration tested · DISABLED pending legal review |

## 1. Game title
Three Card Poker

## 2. Game category
Card & Social

## 3. Target age group
18+ (verified adults only; invisible to minors and guests)

## 4. Core concept
Play your three cards against the dealer. The dealer qualifies with Queen-high. Ante bonuses and Pair Plus pay by hand rank.

## 5. Unique selling proposition
Clear qualification banner and bonus table.

## 6. Core gameplay loop
Ante (+ Pair Plus) -> see cards -> Play or Fold -> dealer reveals -> settle.

## 7. Game rules
- Dealer needs Queen-high to qualify.
- Ante bonus: Straight 1:1, Trips 4:1, Straight Flush 5:1.
- Pair Plus: Pair 1:1, Flush 3:1, Straight 6:1, Trips 30:1, SF 40:1.

## 8. User controls
Ante, Pair Plus, Deal, Play, Fold.

## 9. Game state machine
bet -> (deal) -> decide/act -> settle -> bet. Open rounds on session close resolve by published close-out rules.

## 10. Difficulty model
Not applicable (chance simulation); identical probabilities for every player.

## 11. Scoring model
Fun Chips only.

## 12. Multiplayer rules
Solo against the house or rule-driven bots only. No player-to-player transfer of chips.

## 13. Match duration
3-10 min

## 14. Reward rules
No XP, achievements or ZO from Lounge outcomes. Fun Chips are free, non-purchasable, non-transferable and non-redeemable.

## 15. Progression system
None by design (no reward loop around chance play).

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Triad Table**. Palette #0b2a1c -> #06120c, accent #7ee0a1. Original vector cover art (`client/src/art/covers.tsx`, motif `three-card-poker`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

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
- Published mathematics: "Ante/Play ~97.98% per unit wagered with Q-6-4 strategy; Pair Plus ~97.7%"
