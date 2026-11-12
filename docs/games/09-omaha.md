# 9. Omaha Poker Social

> Four Card Summit: use exactly two.

| Field | Value |
|---|---|
| Game id | `omaha` |
| Environment | PLAYZO Lounge (18+, legally gated, Fun Chips only) |
| Engine | `server/games/lounge/poker.ts` (mode: **server**, rules v1.0.0) |
| UI | `client/src/games/lounge/Poker.tsx` |
| Status | Implemented · unit/integration tested · DISABLED pending legal review |

## 1. Game title
Omaha Poker Social

## 2. Game category
Card & Social

## 3. Target age group
18+ (verified adults only; invisible to minors and guests)

## 4. Core concept
Pot-limit Omaha against computer opponents. You must use exactly two hole cards and three board cards.

## 5. Unique selling proposition
Your best legal Omaha hand is highlighted automatically, which teaches the exactly-two rule.

## 6. Core gameplay loop
Blinds -> four betting rounds -> showdown.

## 7. Game rules
- Four hole cards.
- Best hand uses exactly two hole + three board cards.
- Raises capped at the pot.

## 8. User controls
Fold, Check/Call, Raise (half pot / pot).

## 9. Game state machine
not seated -> sit (buy-in) -> idle -> deal -> betting rounds (bots act until player turn) -> showdown/award -> idle -> leave (stack returned).

## 10. Difficulty model
Not applicable (chance simulation); identical probabilities for every player.

## 11. Scoring model
Fun Chips only.

## 12. Multiplayer rules
Solo against the house or rule-driven bots only. No player-to-player transfer of chips.

## 13. Match duration
10-30 min

## 14. Reward rules
No XP, achievements or ZO from Lounge outcomes. Fun Chips are free, non-purchasable, non-transferable and non-redeemable.

## 15. Progression system
None by design (no reward loop around chance play).

## 16. User interface
Mobile-first stage: HUD, server view rendered with animated transitions, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **Four Card Summit**. Palette #21123d -> #07040f, accent #a98bff. Original vector cover art (`client/src/art/covers.tsx`, motif `omaha`).

## 18. 3D asset requirements
None required; 2D vector / canvas presentation chosen for performance on mid-range phones.

## 19. Animation requirements
Spring-based UI transitions (framer-motion), state-change micro-animations; reduced-motion users get instant transitions.

## 20. Sound requirements
Original adaptive theme "Midnight noir": E minor, 81 BPM; warm pad, walking bass, brush drums, keys lead. Lounge rule: calm level, no escalating layers; returns below the stake use a neutral cue, never a win sound. Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (`client/src/lib/sound.ts`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

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
- Published mathematics: ""
