# Lounge Mathematics (published)

Generated from live engine code by `npm run gdd`. Observed results: see QA_TEST_REPORT.md and docs/fairness-results.txt.

Randomness: HMAC-SHA256(serverSeed, blockIndex) stream, unbiased rejection sampling, seed committed (SHA-256) at session start and revealed at session end. Outcomes are independent of balance, history, membership and spending (tested).

Close-out rules for open rounds when a session closes: blackjack/duel auto-stand; Three Card Poker fold; video poker draw holding all; Hi-Lo/Mines bank if at least one step else refund stake; Crash bank at server time (refund if before lift-off); poker/Teen Patti fold the open hand and return the table stack.

## 1. European Roulette

Theoretical RTP 97.30% on every bet type (36/37).

```json
{
 "kind": "roulette",
 "pockets": 37,
 "bets": [
  {
   "bet": "straight",
   "pays": "35:1",
   "rtp": 97.297
  },
  {
   "bet": "split",
   "pays": "17:1",
   "rtp": 97.297
  },
  {
   "bet": "dozen",
   "pays": "2:1",
   "rtp": 97.297
  },
  {
   "bet": "column",
   "pays": "2:1",
   "rtp": 97.297
  },
  {
   "bet": "red",
   "pays": "1:1",
   "rtp": 97.297
  },
  {
   "bet": "black",
   "pays": "1:1",
   "rtp": 97.297
  },
  {
   "bet": "odd",
   "pays": "1:1",
   "rtp": 97.297
  },
  {
   "bet": "even",
   "pays": "1:1",
   "rtp": 97.297
  },
  {
   "bet": "low",
   "pays": "1:1",
   "rtp": 97.297
  },
  {
   "bet": "high",
   "pays": "1:1",
   "rtp": 97.297
  }
 ]
}
```

## 2. American Roulette

Theoretical RTP 94.74% (36/38) on all bets.

```json
{
 "kind": "roulette",
 "pockets": 38,
 "bets": [
  {
   "bet": "straight",
   "pays": "35:1",
   "rtp": 94.737
  },
  {
   "bet": "split",
   "pays": "17:1",
   "rtp": 94.737
  },
  {
   "bet": "dozen",
   "pays": "2:1",
   "rtp": 94.737
  },
  {
   "bet": "column",
   "pays": "2:1",
   "rtp": 94.737
  },
  {
   "bet": "red",
   "pays": "1:1",
   "rtp": 94.737
  },
  {
   "bet": "black",
   "pays": "1:1",
   "rtp": 94.737
  },
  {
   "bet": "odd",
   "pays": "1:1",
   "rtp": 94.737
  },
  {
   "bet": "even",
   "pays": "1:1",
   "rtp": 94.737
  },
  {
   "bet": "low",
   "pays": "1:1",
   "rtp": 94.737
  },
  {
   "bet": "high",
   "pays": "1:1",
   "rtp": 94.737
  }
 ]
}
```

## 3. French Roulette

RTP 98.65% on even-money bets (La Partage), 97.30% on all others.

```json
{
 "kind": "roulette",
 "pockets": 37,
 "note": "La Partage: half of even-money bets returned on zero.",
 "bets": [
  {
   "bet": "straight",
   "pays": "35:1",
   "rtp": 97.297
  },
  {
   "bet": "split",
   "pays": "17:1",
   "rtp": 97.297
  },
  {
   "bet": "dozen",
   "pays": "2:1",
   "rtp": 97.297
  },
  {
   "bet": "column",
   "pays": "2:1",
   "rtp": 97.297
  },
  {
   "bet": "red",
   "pays": "1:1",
   "rtp": 98.649
  },
  {
   "bet": "black",
   "pays": "1:1",
   "rtp": 98.649
  },
  {
   "bet": "odd",
   "pays": "1:1",
   "rtp": 98.649
  },
  {
   "bet": "even",
   "pays": "1:1",
   "rtp": 98.649
  },
  {
   "bet": "low",
   "pays": "1:1",
   "rtp": 98.649
  },
  {
   "bet": "high",
   "pays": "1:1",
   "rtp": 98.649
  }
 ]
}
```

## 4. Blackjack Classic

About 99.5% RTP with basic strategy (simulation-verified; see docs).

```json
{
 "kind": "table",
 "rules": "6 decks, S17, 3:2, DAS, one split, peek",
 "rtp": "about 99.5% with basic strategy (simulation in tests)"
}
```

## 5. Blackjack Duel

RTP depends on your play; simulation for a hit-under-17 player is documented.

```json
{
 "kind": "table",
 "rules": "Rival hits below 17. Both bust = push. Natural 21 pays 3:2.",
 "rtp": "depends on decisions; simulation for a hit-below-17 strategy in tests"
}
```

## 6. Baccarat

RTP: Banker 98.94%, Player 98.76%, Tie 85.64%.

```json
{
 "kind": "table",
 "bets": [
  {
   "bet": "Banker (0.95:1)",
   "rtp": 98.94
  },
  {
   "bet": "Player (1:1)",
   "rtp": 98.76
  },
  {
   "bet": "Tie (8:1)",
   "rtp": 85.64
  }
 ],
 "source": "Standard 8-deck Punto Banco results; verified by simulation in tests."
}
```

## 7. Sic Bo

Small/Big 97.22%; totals 81-90%; any triple 86.11%; specific double 81.48%; specific triple 69.91%.

```json
{
 "kind": "sicbo",
 "outcomes": 216,
 "bets": [
  {
   "bet": "Small",
   "rtp": 97.222
  },
  {
   "bet": "Big",
   "rtp": 97.222
  },
  {
   "bet": "Any triple (30:1)",
   "rtp": 86.111
  },
  {
   "bet": "Specific double (10:1)",
   "rtp": 81.481
  },
  {
   "bet": "Specific triple (150:1)",
   "rtp": 69.907
  },
  {
   "bet": "Single number (1-3:1)",
   "rtp": 92.13
  }
 ],
 "totals": [
  {
   "total": 4,
   "pays": "60:1",
   "rtp": 84.722
  },
  {
   "total": 5,
   "pays": "30:1",
   "rtp": 86.111
  },
  {
   "total": 6,
   "pays": "17:1",
   "rtp": 83.333
  },
  {
   "total": 7,
   "pays": "12:1",
   "rtp": 90.278
  },
  {
   "total": 8,
   "pays": "8:1",
   "rtp": 87.5
  },
  {
   "total": 9,
   "pays": "6:1",
   "rtp": 81.019
  },
  {
   "total": 10,
   "pays": "6:1",
   "rtp": 87.5
  },
  {
   "total": 11,
   "pays": "6:1",
   "rtp": 87.5
  },
  {
   "total": 12,
   "pays": "6:1",
   "rtp": 81.019
  },
  {
   "total": 13,
   "pays": "8:1",
   "rtp": 87.5
  },
  {
   "total": 14,
   "pays": "12:1",
   "rtp": 90.278
  },
  {
   "total": 15,
   "pays": "17:1",
   "rtp": 83.333
  },
  {
   "total": 16,
   "pays": "30:1",
   "rtp": 86.111
  },
  {
   "total": 17,
   "pays": "60:1",
   "rtp": 84.722
  }
 ]
}
```

## 8. Texas Hold'em Social

Player-vs-player style; the house takes no rake. Deck shuffled by a secure RNG.

```json
{
 "kind": "pvp",
 "rtp": null,
 "note": "Player-versus-bot table with no rake. Bots use documented strategies and never see your cards."
}
```

## 9. Omaha Poker Social

Player-vs-player style; no rake.

```json
{
 "kind": "pvp",
 "rtp": null,
 "note": "Player-versus-bot table with no rake. Bots use documented strategies and never see your cards."
}
```

## 10. Teen Patti Social

Player-vs-player style; no rake.

```json
{
 "kind": "pvp",
 "rtp": null,
 "note": "Player-versus-bot table with no rake. Bots use documented strategies and never see your cards."
}
```

## 11. Andar Bahar

About 97.8% RTP each side (simulation-verified; see docs).

```json
{
 "kind": "table",
 "bets": [
  {
   "bet": "Andar (0.9:1)"
  },
  {
   "bet": "Bahar (1:1)"
  }
 ],
 "rtp": "approximately 97-98% per side; measured by simulation in tests (see QA_TEST_REPORT.md)"
}
```

## 12. Dragon Tiger

Dragon/Tiger ~96.27% RTP, Tie ~89.64% (8-deck shoe).

```json
{
 "kind": "table",
 "bets": [
  {
   "bet": "Dragon / Tiger (1:1, half back on tie)",
   "rtp": 96.27
  },
  {
   "bet": "Tie (8:1)",
   "rtp": 89.64
  }
 ],
 "source": "8-deck values; verified by simulation in tests."
}
```

## 13. Three Card Poker

Ante/Play ~97.98% per unit wagered with Q-6-4 strategy (3.37% ante edge); Pair Plus ~97.7%.

```json
{
 "kind": "table",
 "anteBonus": {
  "3": 1,
  "4": 4,
  "5": 5
 },
 "pairPlus": {
  "1": 1,
  "2": 3,
  "3": 6,
  "4": 30,
  "5": 40
 },
 "rtp": "Ante/Play ~97.98% per unit wagered with Q-6-4 strategy; Pair Plus ~97.7%"
}
```

## 14. Video Poker

99.54% RTP with optimal play (9/6 Jacks or Better, max bet).

```json
{
 "kind": "vp",
 "paytable": [
  {
   "name": "Royal Flush",
   "pay": 250
  },
  {
   "name": "Straight Flush",
   "pay": 50
  },
  {
   "name": "Four of a Kind",
   "pay": 25
  },
  {
   "name": "Full House",
   "pay": 9
  },
  {
   "name": "Flush",
   "pay": 6
  },
  {
   "name": "Straight",
   "pay": 4
  },
  {
   "name": "Three of a Kind",
   "pay": 3
  },
  {
   "name": "Two Pair",
   "pay": 2
  },
  {
   "name": "Jacks or Better",
   "pay": 1
  }
 ],
 "royalAtMax": 800,
 "rtp": 99.54,
 "note": "99.54% requires optimal hold strategy at 5 coins"
}
```

## 15. Classic 3-Reel Slots

Exact RTP computed from reel strips (see docs/LOUNGE_MATH.md).

```json
{
 "kind": "slot",
 "rtp": 94.516,
 "breakdown": {
  "lines": 94.516,
  "scatter": 0,
  "jackpot": 0
 },
 "layout": "3x1",
 "mode": "lines",
 "lines": 1,
 "paytable": {
  "SEVEN": {
   "3": 700
  },
  "BAR3": {
   "3": 140
  },
  "BAR2": {
   "3": 70
  },
  "BAR": {
   "3": 35
  },
  "CHERRY": {
   "1": 2,
   "2": 6,
   "3": 45
  }
 },
 "scatter": null,
 "wild": null,
 "jackpot": null,
 "reelCounts": [
  {
   "SEVEN": 2,
   "CHERRY": 4,
   "BLANK": 14,
   "BAR3": 3,
   "BAR": 5,
   "BAR2": 4
  },
  {
   "SEVEN": 2,
   "CHERRY": 4,
   "BLANK": 14,
   "BAR3": 3,
   "BAR": 5,
   "BAR2": 4
  },
  {
   "SEVEN": 2,
   "CHERRY": 4,
   "BLANK": 14,
   "BAR3": 3,
   "BAR": 5,
   "BAR2": 4
  }
 ],
 "reelLengths": [
  32,
  32,
  32
 ]
}
```

## 16. Five-Reel Adventure Slots

Exact RTP computed by full enumeration.

```json
{
 "kind": "slot",
 "rtp": 95.396,
 "breakdown": {
  "lines": 78.403,
  "scatter": 16.993,
  "jackpot": 0
 },
 "layout": "5x3",
 "mode": "lines",
 "lines": 10,
 "paytable": {
  "COMPASS": {
   "5": 800
  },
  "MASK": {
   "3": 40,
   "4": 150,
   "5": 500
  },
  "SNAKE": {
   "3": 25,
   "4": 85,
   "5": 340
  },
  "HAT": {
   "3": 16,
   "4": 60,
   "5": 200
  },
  "GEM": {
   "3": 10,
   "4": 30,
   "5": 100
  },
  "TORCH": {
   "3": 8,
   "4": 22,
   "5": 75
  },
  "ROPE": {
   "3": 7,
   "4": 17,
   "5": 50
  },
  "COIN": {
   "3": 5,
   "4": 13,
   "5": 40
  }
 },
 "scatter": {
  "sym": "IDOL",
  "pays": {
   "3": 2,
   "4": 8,
   "5": 40
  }
 },
 "wild": "COMPASS",
 "jackpot": null,
 "reelCounts": [
  {
   "COMPASS": 1,
   "SNAKE": 3,
   "TORCH": 4,
   "ROPE": 5,
   "HAT": 3,
   "IDOL": 2,
   "GEM": 4,
   "COIN": 5,
   "MASK": 2
  },
  {
   "COMPASS": 2,
   "SNAKE": 3,
   "TORCH": 4,
   "ROPE": 5,
   "HAT": 3,
   "IDOL": 2,
   "GEM": 4,
   "COIN": 5,
   "MASK": 2
  },
  {
   "COMPASS": 2,
   "SNAKE": 3,
   "TORCH": 4,
   "ROPE": 5,
   "HAT": 3,
   "IDOL": 2,
   "GEM": 4,
   "COIN": 5,
   "MASK": 2
  },
  {
   "COMPASS": 2,
   "SNAKE": 3,
   "TORCH": 4,
   "ROPE": 5,
   "HAT": 3,
   "IDOL": 2,
   "GEM": 4,
   "COIN": 5,
   "MASK": 2
  },
  {
   "COMPASS": 2,
   "SNAKE": 3,
   "TORCH": 4,
   "ROPE": 5,
   "HAT": 3,
   "IDOL": 2,
   "GEM": 4,
   "COIN": 5,
   "MASK": 2
  }
 ],
 "reelLengths": [
  29,
  30,
  30,
  30,
  30
 ]
}
```

## 17. Treasure Vault Slots

Exact RTP computed by full enumeration.

```json
{
 "kind": "slot",
 "rtp": 95.835,
 "breakdown": {
  "lines": 82.059,
  "scatter": 13.776,
  "jackpot": 0
 },
 "layout": "5x3",
 "mode": "lines",
 "lines": 20,
 "paytable": {
  "GOLDBAR": {
   "5": 1800
  },
  "CROWN": {
   "3": 45,
   "4": 180,
   "5": 750
  },
  "RUBY": {
   "3": 28,
   "4": 110,
   "5": 360
  },
  "PEARL": {
   "3": 22,
   "4": 75,
   "5": 275
  },
  "DIAL": {
   "3": 12,
   "4": 36,
   "5": 150
  },
  "COINS": {
   "3": 9,
   "4": 28,
   "5": 90
  },
  "NOTE": {
   "3": 7,
   "4": 18,
   "5": 55
  },
  "LOCK": {
   "3": 5,
   "4": 15,
   "5": 45
  }
 },
 "scatter": {
  "sym": "KEY",
  "pays": {
   "3": 2,
   "4": 10,
   "5": 50
  }
 },
 "wild": "GOLDBAR",
 "jackpot": null,
 "reelCounts": [
  {
   "GOLDBAR": 1,
   "RUBY": 3,
   "COINS": 5,
   "NOTE": 6,
   "LOCK": 6,
   "KEY": 2,
   "PEARL": 3,
   "DIAL": 4,
   "CROWN": 2
  },
  {
   "GOLDBAR": 2,
   "RUBY": 3,
   "COINS": 5,
   "NOTE": 6,
   "LOCK": 6,
   "PEARL": 3,
   "KEY": 2,
   "DIAL": 4,
   "CROWN": 2
  },
  {
   "GOLDBAR": 2,
   "RUBY": 3,
   "COINS": 5,
   "NOTE": 6,
   "LOCK": 6,
   "PEARL": 3,
   "KEY": 2,
   "DIAL": 4,
   "CROWN": 2
  },
  {
   "GOLDBAR": 2,
   "RUBY": 3,
   "COINS": 5,
   "NOTE": 6,
   "LOCK": 6,
   "PEARL": 3,
   "KEY": 2,
   "DIAL": 4,
   "CROWN": 2
  },
  {
   "GOLDBAR": 2,
   "RUBY": 3,
   "COINS": 5,
   "NOTE": 6,
   "LOCK": 6,
   "PEARL": 3,
   "KEY": 2,
   "DIAL": 4,
   "CROWN": 2
  }
 ],
 "reelLengths": [
  32,
  33,
  33,
  33,
  33
 ]
}
```

## 18. Cosmic Reels

Exact RTP computed by full enumeration.

```json
{
 "kind": "slot",
 "rtp": 96.42,
 "breakdown": {
  "lines": 96.42,
  "scatter": 0,
  "jackpot": 0
 },
 "layout": "5x3",
 "mode": "ways",
 "paytable": {
  "STAR": {},
  "NOVA": {
   "3": 20,
   "4": 60,
   "5": 200
  },
  "ALIEN": {
   "3": 12,
   "4": 36,
   "5": 120
  },
  "RINGED": {
   "3": 10,
   "4": 28,
   "5": 90
  },
  "COMET": {
   "3": 6,
   "4": 16,
   "5": 50
  },
  "MOON": {
   "3": 4,
   "4": 10,
   "5": 30
  },
  "ROCKET": {
   "3": 4,
   "4": 10,
   "5": 30
  },
  "ASTEROID": {
   "3": 2,
   "4": 6,
   "5": 20
  }
 },
 "scatter": null,
 "wild": "STAR",
 "jackpot": null,
 "reelCounts": [
  {
   "NOVA": 2,
   "COMET": 4,
   "MOON": 5,
   "ALIEN": 3,
   "ROCKET": 5,
   "ASTEROID": 6,
   "RINGED": 3
  },
  {
   "STAR": 2,
   "RINGED": 3,
   "ROCKET": 5,
   "COMET": 4,
   "ASTEROID": 6,
   "NOVA": 2,
   "MOON": 5,
   "ALIEN": 3
  },
  {
   "STAR": 2,
   "RINGED": 3,
   "ROCKET": 5,
   "COMET": 4,
   "ASTEROID": 6,
   "NOVA": 2,
   "MOON": 5,
   "ALIEN": 3
  },
  {
   "STAR": 2,
   "RINGED": 3,
   "ROCKET": 5,
   "COMET": 4,
   "ASTEROID": 6,
   "NOVA": 2,
   "MOON": 5,
   "ALIEN": 3
  },
  {
   "NOVA": 2,
   "COMET": 4,
   "MOON": 5,
   "ALIEN": 3,
   "ROCKET": 5,
   "ASTEROID": 6,
   "RINGED": 3
  }
 ],
 "reelLengths": [
  28,
  30,
  30,
  30,
  28
 ]
}
```

## 19. Neon Fruit Machine

Exact RTP computed by full enumeration.

```json
{
 "kind": "slot",
 "rtp": 96.491,
 "breakdown": {
  "lines": 87.161,
  "scatter": 9.329,
  "jackpot": 0
 },
 "layout": "3x3",
 "mode": "lines",
 "lines": 5,
 "paytable": {
  "NEON": {
   "3": 270
  },
  "SEVEN": {
   "3": 110
  },
  "BELL": {
   "3": 45
  },
  "GRAPE": {
   "3": 22
  },
  "ORANGE": {
   "3": 13
  },
  "LEMON": {
   "3": 11
  },
  "CHERRY": {
   "2": 1,
   "3": 9
  }
 },
 "scatter": {
  "sym": "MELON",
  "pays": {
   "3": 4
  }
 },
 "wild": "NEON",
 "jackpot": null,
 "reelCounts": [
  {
   "NEON": 1,
   "BELL": 2,
   "LEMON": 4,
   "GRAPE": 3,
   "ORANGE": 4,
   "CHERRY": 4,
   "SEVEN": 1,
   "MELON": 2
  },
  {
   "NEON": 1,
   "BELL": 2,
   "LEMON": 4,
   "GRAPE": 3,
   "ORANGE": 4,
   "CHERRY": 4,
   "SEVEN": 1,
   "MELON": 2
  },
  {
   "NEON": 1,
   "BELL": 2,
   "LEMON": 4,
   "GRAPE": 3,
   "ORANGE": 4,
   "CHERRY": 4,
   "SEVEN": 1,
   "MELON": 2
  }
 ],
 "reelLengths": [
  21,
  21,
  21
 ]
}
```

## 20. Mystery Jackpot Simulator

Exact RTP = reel RTP + 400/4000 jackpot contribution.

```json
{
 "kind": "slot",
 "rtp": 95.59,
 "breakdown": {
  "lines": 85.59,
  "scatter": 0,
  "jackpot": 10
 },
 "layout": "3x1",
 "mode": "lines",
 "lines": 1,
 "paytable": {
  "METEOR": {
   "3": 600
  },
  "PLANET": {
   "3": 120
  },
  "SATURN": {
   "3": 60
  },
  "ORBIT": {
   "3": 30
  },
  "SPARK": {
   "1": 2,
   "2": 6,
   "3": 40
  }
 },
 "scatter": null,
 "wild": null,
 "jackpot": {
  "oneIn": 4000,
  "mult": 400
 },
 "reelCounts": [
  {
   "METEOR": 2,
   "SPARK": 4,
   "VOID": 14,
   "PLANET": 3,
   "ORBIT": 5,
   "SATURN": 4
  },
  {
   "METEOR": 2,
   "SPARK": 4,
   "VOID": 14,
   "PLANET": 3,
   "ORBIT": 5,
   "SATURN": 4
  },
  {
   "METEOR": 2,
   "SPARK": 4,
   "VOID": 14,
   "PLANET": 3,
   "ORBIT": 5,
   "SATURN": 4
  }
 ],
 "reelLengths": [
  32,
  32,
  32
 ]
}
```

## 21. Plinko Simulator

Tables normalised to 98%; exact RTP after rounding is 97.76-98.19% and published per table.

```json
{
 "kind": "plinko",
 "tables": [
  {
   "rows": 8,
   "risk": "low",
   "multipliers": [
    2.26,
    1.71,
    1.25,
    0.89,
    0.7,
    0.89,
    1.25,
    1.71,
    2.26
   ],
   "probabilities": [
    0.00390625,
    0.03125,
    0.109375,
    0.21875,
    0.2734375,
    0.21875,
    0.109375,
    0.03125,
    0.00390625
   ],
   "rtp": 97.875
  },
  {
   "rows": 8,
   "risk": "medium",
   "multipliers": [
    4.59,
    2.51,
    1.29,
    0.75,
    0.64,
    0.75,
    1.29,
    2.51,
    4.59
   ],
   "probabilities": [
    0.00390625,
    0.03125,
    0.109375,
    0.21875,
    0.2734375,
    0.21875,
    0.109375,
    0.03125,
    0.00390625
   ],
   "rtp": 97.805
  },
  {
   "rows": 8,
   "risk": "high",
   "multipliers": [
    8.79,
    3.48,
    1.24,
    0.62,
    0.56,
    0.62,
    1.24,
    3.48,
    8.79
   ],
   "probabilities": [
    0.00390625,
    0.03125,
    0.109375,
    0.21875,
    0.2734375,
    0.21875,
    0.109375,
    0.03125,
    0.00390625
   ],
   "rtp": 98.18
  },
  {
   "rows": 12,
   "risk": "low",
   "multipliers": [
    3.24,
    2.61,
    2.05,
    1.55,
    1.13,
    0.81,
    0.63,
    0.81,
    1.13,
    1.55,
    2.05,
    2.61,
    3.24
   ],
   "probabilities": [
    0.000244140625,
    0.0029296875,
    0.01611328125,
    0.0537109375,
    0.120849609375,
    0.193359375,
    0.2255859375,
    0.193359375,
    0.120849609375,
    0.0537109375,
    0.01611328125,
    0.0029296875,
    0.000244140625
   ],
   "rtp": 97.792
  },
  {
   "rows": 12,
   "risk": "medium",
   "multipliers": [
    9.63,
    6.19,
    3.69,
    2.02,
    1.04,
    0.6,
    0.52,
    0.6,
    1.04,
    2.02,
    3.69,
    6.19,
    9.63
   ],
   "probabilities": [
    0.000244140625,
    0.0029296875,
    0.01611328125,
    0.0537109375,
    0.120849609375,
    0.193359375,
    0.2255859375,
    0.193359375,
    0.120849609375,
    0.0537109375,
    0.01611328125,
    0.0029296875,
    0.000244140625
   ],
   "rtp": 97.758
  },
  {
   "rows": 12,
   "risk": "high",
   "multipliers": [
    24.3,
    12.8,
    5.94,
    2.35,
    0.84,
    0.42,
    0.38,
    0.42,
    0.84,
    2.35,
    5.94,
    12.8,
    24.3
   ],
   "probabilities": [
    0.000244140625,
    0.0029296875,
    0.01611328125,
    0.0537109375,
    0.120849609375,
    0.193359375,
    0.2255859375,
    0.193359375,
    0.120849609375,
    0.0537109375,
    0.01611328125,
    0.0029296875,
    0.000244140625
   ],
   "rtp": 98.19
  },
  {
   "rows": 16,
   "risk": "low",
   "multipliers": [
    4.28,
    3.61,
    2.98,
    2.41,
    1.89,
    1.43,
    1.04,
    0.75,
    0.58,
    0.75,
    1.04,
    1.43,
    1.89,
    2.41,
    2.98,
    3.61,
    4.28
   ],
   "probabilities": [
    0.0000152587890625,
    0.000244140625,
    0.0018310546875,
    0.008544921875,
    0.02777099609375,
    0.066650390625,
    0.1221923828125,
    0.174560546875,
    0.196380615234375,
    0.174560546875,
    0.1221923828125,
    0.066650390625,
    0.02777099609375,
    0.008544921875,
    0.0018310546875,
    0.000244140625,
    0.0000152587890625
   ],
   "rtp": 97.949
  },
  {
   "rows": 16,
   "risk": "medium",
   "multipliers": [
    16.3,
    11.6,
    7.93,
    5.1,
    3.04,
    1.66,
    0.86,
    0.5,
    0.43,
    0.5,
    0.86,
    1.66,
    3.04,
    5.1,
    7.93,
    11.6,
    16.3
   ],
   "probabilities": [
    0.0000152587890625,
    0.000244140625,
    0.0018310546875,
    0.008544921875,
    0.02777099609375,
    0.066650390625,
    0.1221923
```

## 22. Dice Arena

Under/Over 97.92%, Seven 96.67%, Doubles 97.22%.

```json
{
 "kind": "dice",
 "bets": [
  {
   "bet": "Under 7",
   "pays": "2.35x",
   "rtp": 97.917
  },
  {
   "bet": "Over 7",
   "pays": "2.35x",
   "rtp": 97.917
  },
  {
   "bet": "Exactly 7",
   "pays": "5.8x",
   "rtp": 96.667
  },
  {
   "bet": "Specific double",
   "pays": "35x",
   "rtp": 97.222
  }
 ]
}
```

## 23. Hi-Lo Cards

98% RTP at every step.

```json
{
 "kind": "hilo",
 "rule": "Each correct call multiplies by 0.98 / P(win). Ranks 1-13 drawn with replacement; ties lose.",
 "rtp": 98
}
```

## 24. Mines Simulator

98% RTP at every bank point.

```json
{
 "kind": "mines",
 "rule": "Multiplier after k safe tiles = 0.98 x product (25-i)/(25-m-i).",
 "rtp": 98,
 "examples": [
  {
   "mines": 1,
   "after": [
    1.02,
    1.06,
    1.11,
    1.22
   ]
  },
  {
   "mines": 3,
   "after": [
    1.11,
    1.27,
    1.46,
    1.97
   ]
  },
  {
   "mines": 5,
   "after": [
    1.22,
    1.54,
    1.97,
    3.35
   ]
  },
  {
   "mines": 10,
   "after": [
    1.63,
    2.8,
    4.95,
    17.33
   ]
  }
 ]
}
```

## 25. Crash Flight Simulator

98% RTP for any banking target.

```json
{
 "kind": "crash",
 "rule": "P(stall >= m) = 0.98/m. Multiplier(t) = e^(g t).",
 "growthPerMs": 0.00006,
 "rtp": 98
}
```
