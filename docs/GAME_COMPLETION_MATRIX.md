# Game Completion Matrix (2026-11-12)

Every game has its own engine (`shared/games/*` for replay games, `server/games/**` for server games); `tests/familyComplete.test.ts` asserts that the 25 family engines are 25 distinct objects.

Legend for test evidence:
- **Engine**: unit/engine tests (`replayEngines`, `serverEngines`, `familyComplete`, `loungeRules`, `fairness`).
- **To end**: played to game over by an automated test (simulated clock for timed games), then re-verified by the server.
- **Browser**: Playwright on Edge (desktop 1366px and phone 390px for family; desktop for the Lounge): discovery page → instructions → start → input → pause/resume → finish/resign/give-up → results → restart.
- **Pause**: solo pause/resume (timed server games shift their server deadlines).

Status: **COMPLETE** = engine, rules, scoring, validation, UI, instructions, results and restart all verified automatically.

## Family (25) — live for everyone
| # | Game | Mode | Engine | To end | Browser | Pause | Multiplayer | Status |
|---|---|---|---|---|---|---|---|---|
| 26 | Mind Maze | replay | ✓ (solvable mazes) | ✓ | ✓ finish → verified results → restart | ✓ | race, async, daily | COMPLETE |
| 27 | Pattern Hunter | replay | ✓ | ✓ | ✓ | ✓ | race, async | COMPLETE |
| 28 | Number Rush | replay | ✓ | ✓ | ✓ | ✓ | race, async | COMPLETE |
| 29 | Logic Lock | replay | ✓ (solvable) | ✓ | ✓ | ✓ | race (WS test), async, daily | COMPLETE |
| 30 | Sequence Master | replay | ✓ | ✓ | ✓ (natural end handled) | ✓ | race, async | COMPLETE |
| 31 | Grid Genius | replay | ✓ (unique solution) | ✓ | ✓ | ✓ | race, async, daily | COMPLETE |
| 32 | Code Breaker | server | ✓ (grading, redaction) | ✓ | ✓ input → restart | ✓ | async | COMPLETE |
| 33 | Word Duel | server, timed | ✓ (dictionary, scoring) | ✓ | ✓ input → restart | ✓ (clock shifts) | versus, group, async, daily | COMPLETE |
| 34 | Trivia Clash | server, timed | ✓ (deadline, redaction) | ✓ | ✓ input → restart | ✓ (clock shifts) | versus, 2v2 teams, group | COMPLETE |
| 35 | Emoji Decode | server | ✓ (tolerant matching) | ✓ | ✓ input → restart | ✓ | async | COMPLETE |
| 36 | Word Ladder Race | server | ✓ (solvable ladders) | ✓ | ✓ played to results (route reveal) | ✓ | race, async, daily | COMPLETE |
| 37 | Geography Sprint | server, timed | ✓ | ✓ | ✓ input → restart | ✓ (clock shifts) | async | COMPLETE |
| 38 | Fact or Fiction | server | ✓ | ✓ | ✓ input → restart (key bug fixed) | ✓ | async | COMPLETE |
| 39 | Territory Wars | server vs AI | ✓ (scoring, extra turns) | ✓ all boxes claimed | ✓ resign → results | ✓ | versus, async | COMPLETE |
| 40 | Hex Conquest | server vs AI | ✓ (connection, AI) | ✓ | ✓ resign → results; reconnect (2 browsers) | ✓ | versus, async | COMPLETE |
| 41 | Connect Five | server vs AI | ✓ | ✓ | ✓ resign → results; full 2-browser room | ✓ | versus (WS + browser), async | COMPLETE |
| 42 | Block Battle | replay | ✓ | ✓ | ✓ | ✓ | race, async | COMPLETE |
| 43 | Tower Tactics | replay | ✓ (determinism) | ✓ | ✓ | ✓ | race, async | COMPLETE |
| 44 | Chess Blitz | server vs AI, timed (rooms) | ✓ (full rules incl. castling, en passant, promotion, stalemate) | ✓ | ✓ resign → results | ✓ | versus (clocked), async | COMPLETE |
| 45 | Reflex Arena | replay | ✓ (anti-cheat timing) | ✓ | ✓ | ✓ | race, async | COMPLETE |
| 46 | Color Dash | replay | ✓ | ✓ | ✓ | ✓ | race, async | COMPLETE |
| 47 | Memory Match Duel | server | ✓ (turns, redaction) | ✓ | ✓ input → restart | ✓ | versus, async | COMPLETE |
| 48 | Rhythm Rush | replay | ✓ | ✓ | ✓ | ✓ | race, async | COMPLETE |
| 49 | Obstacle Sprint | replay | ✓ (client sim == server replay) | ✓ | ✓ (natural end handled) | ✓ | race, async | COMPLETE |
| 50 | Party Chaos | server, timed | ✓ | ✓ | ✓ input → restart | ✓ (clock shifts) | versus, 2v2 teams, group | COMPLETE |

Gap (KI-7): for the five server-timed games the browser test does not wait out every round (minutes per game); their play-to-end path is automated at engine level with a simulated clock.

## Lounge (25) — built, tested, **disabled for the public** (legal status: BLOCKED for all)
Browser column: internal QA account (tester role, localhost dev preview) opens the detail page with published maths, starts the game, completes one real round settled server-side through the ledger, and leaves (session closed, seed revealed).

| # | Game | Rules test (`loungeRules`) | Statistical RTP (`fairness`) | Hidden info never in view | Browser (QA) | Technical | Legal |
|---|---|---|---|---|---|---|---|
| 1 | European Roulette | ✓ paytable per bet | ✓ z-test + chi-square | n/a | ✓ | COMPLETE | BLOCKED |
| 2 | American Roulette | ✓ 38 pockets | ✓ | n/a | ✓ | COMPLETE | BLOCKED |
| 3 | French Roulette | ✓ La Partage | ✓ | n/a | ✓ | COMPLETE | BLOCKED |
| 4 | Blackjack Classic | ✓ illegal moves, hole card hidden | ✓ basic strategy 99.6% | ✓ | ✓ | COMPLETE | BLOCKED |
| 5 | Blackjack Duel | ✓ | - (head-to-head) | ✓ | ✓ | COMPLETE | BLOCKED |
| 6 | Baccarat | ✓ | ✓ | ✓ | ✓ | COMPLETE | BLOCKED |
| 7 | Sic Bo | ✓ dice range, bet types | ✓ | n/a | ✓ | COMPLETE | BLOCKED |
| 8 | Texas Hold'em Social | ✓ bots' hole cards hidden | - (vs bots) | ✓ | ✓ | COMPLETE | BLOCKED |
| 9 | Omaha Poker Social | ✓ 4 hole cards | - | ✓ | ✓ | COMPLETE | BLOCKED |
| 10 | Teen Patti Social | ✓ blind/seen, pack/chaal | - | ✓ | ✓ | COMPLETE | BLOCKED |
| 11 | Andar Bahar | ✓ | ✓ (measured) | ✓ | ✓ | COMPLETE | BLOCKED |
| 12 | Dragon Tiger | ✓ | ✓ | ✓ | ✓ | COMPLETE | BLOCKED |
| 13 | Three Card Poker | ✓ dealer hidden until settled | ✓ pooled 97.9% | ✓ | ✓ | COMPLETE | BLOCKED |
| 14 | Video Poker | ✓ hold/draw, unique cards | (exact table) | ✓ | ✓ | COMPLETE | BLOCKED |
| 15-20 | Classic, Adventure, Vault, Cosmic, Neon Fruit, Mystery Jackpot slots | ✓ listed bet sizes only | ✓ exact RTP vs observed | ✓ | ✓ (each) | COMPLETE | BLOCKED |
| 21 | Plinko Simulator | ✓ rows/risk validation | ✓ | n/a | ✓ | COMPLETE | BLOCKED |
| 22 | Dice Arena | ✓ | ✓ | n/a | ✓ | COMPLETE | BLOCKED |
| 23 | Hi-Lo Cards | ✓ must call before bank | ✓ | ✓ | ✓ | COMPLETE | BLOCKED |
| 24 | Mines Simulator | ✓ mines hidden while active, revealed after | ✓ | ✓ | ✓ | COMPLETE | BLOCKED |
| 25 | Crash Flight Simulator | ✓ commit before take-off, reveal after | ✓ distribution | ✓ | ✓ | COMPLETE | BLOCKED |
