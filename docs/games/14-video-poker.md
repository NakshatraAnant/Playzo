# 14. Video Poker

> Retro Jacks: hold, draw, decide.

| Field | Value |
|---|---|
| Game id | `video-poker` |
| Environment | PLAYZO Lounge (18+, legally gated, Fun Chips only) |
| Engine | `server/games/lounge/tableCards.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/lounge/VideoPoker.tsx` |
| Status | Implemented · unit/integration tested · DISABLED pending legal review |

## 1. Game title
Video Poker

## 2. Game category
Card & Social

## 3. Target age group
18+ (verified adults only; invisible to minors and guests)

## 4. Core concept
Jacks or Better video poker with the full 9/6 paytable and a retro CRT cabinet.

## 5. Unique selling proposition
Paytable and theoretical RTP printed on the cabinet glass.

## 6. Core gameplay loop
Bet -> deal five -> hold -> draw -> paytable settle.

## 7. Game rules
- Jacks or Better pays 1:1 ... Royal Flush 800:1 at max bet.
- One draw per hand.
- Fresh 52-card deck every hand.

## 8. User controls
Bet 1-5, Deal, tap to Hold, Draw.

## 9. Game state machine
bet -> (deal) -> decide/act -> settle -> bet. Open rounds on session close resolve by published close-out rules.

## 10. Difficulty model
Not applicable (chance simulation); identical probabilities for every player.

## 11. Scoring model
Fun Chips only.

## 12. Multiplayer rules
Solo against the house or rule-driven bots only. No player-to-player transfer of chips.

## 13. Match duration
3-15 min

## 14. Reward rules
No XP, achievements or ZO from Lounge outcomes. Fun Chips are free, non-purchasable, non-transferable and non-redeemable.

## 15. Progression system
None by design (no reward loop around chance play).

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Retro Jacks**. Palette #0a0a3a -> #020214, accent #ffe44d. Original vector cover art (`client/src/art/covers.tsx`, motif `video-poker`).

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
- Published mathematics: 99.54
