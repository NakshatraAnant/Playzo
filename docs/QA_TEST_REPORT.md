# QA Test Report (2026-11-12)

## Automated: `npm test` → **94 tests, 5 files, all passing**
| Suite | Tests | Covers |
|---|---|---|
| `tests/replayEngines.test.ts` | 23 | Determinism of all 12 replay engines; maze solvability; Grid Genius has a unique solution and completes; Logic Lock solvability; anti-cheat (superhuman timing, input during playback, out-of-order logs); **Obstacle Sprint: client simulation == server replay, frame for frame**; Tower Tactics determinism; Block Battle |
| `tests/serverEngines.test.ts` | 21 | Registry = 50 engines (25 + 25); full chess rules (fool's mate + SAN, castling, en passant, promotion, stalemate, illegal moves, AI reply); Code Breaker grading and secret redaction; Hex connection and AI; Connect Five; Territory scoring and extra turns; Trivia server timing and deadline rejection; answer redaction; dictionary; Word Ladder solvability; Emoji tolerant matching; Memory Duel turns and redaction |
| `tests/fairness.test.ts` | 25 | Monte Carlo with the production HMAC RNG vs published RTP (z-test, \|z\| < 4.5); chi-square uniformity (roulette pockets, die faces); slot exact RTP vs observed (6 machines); crash distribution; **outcome independence from balance**; RNG cursor resumability |
| `tests/api.test.ts` | 22 | Health; CSRF; guest → account keeps progress; login, reset revoking sessions; under-13 parental flow; server-mode session (redaction, validation, XP); replay verification + tampered-log rejection (`TOO_FAST`); daily seed; **Lounge invisible to guests and teens (404)**; age assurance + terms; **legal gate 451**; approved game (test reference) plays with a correct ledger; seed reveal matches the commitment; cool-off; ledger idempotency and no negative balances; shop; adult/minor friend block; blocking; reports; challenge seeds; admin RBAC; account deletion cascade; SEO sitemap/robots |
| `tests/multiplayer.test.ts` | 3 | **Two real WebSocket clients:** create → join → ready → start → Connect Five to a win → results persisted in both histories; emotes-only enforcement; race room with the same seed and verified scores |

Static checks: `npm run typecheck` (TypeScript 7) clean · `npm run build` clean · `npm audit` 0 vulnerabilities.

### Fairness: observed vs theoretical (`docs/fairness-results.txt`)
| Game / bet | n | Observed | Theoretical | z |
|---|---|---|---|---|
| EU roulette red | 60k | 96.69% | 97.30% | -1.50 |
| US roulette red | 60k | 94.39% | 94.74% | -0.86 |
| FR roulette red (La Partage) | 60k | 98.47% | 98.65% | -0.45 |
| Sic Bo small | 60k | 97.03% | 97.22% | -0.46 |
| Dice Arena over 7 | 60k | 98.07% | 97.92% | 0.32 |
| Baccarat banker / player / tie | 80k | 98.88 / 99.15 / 85.69% | 98.94 / 98.76 / 85.64% | -0.18 / 1.16 / 0.05 |
| Dragon Tiger dragon | 80k | 96.08% | 96.27% | -0.54 |
| Andar / Bahar | 60k | 98.10% / 97.28% | (measured) | - |
| Blackjack (basic strategy, pooled) | 60k hands | 99.60% | ~99.5% | - |
| Three Card Poker (Q-6-4, pooled) | 60k | 97.86% | ~97.98% | - |
| Slots: classic / adventure / vault / cosmic / neon / mystery | 120k each | 97.60 / 95.82 / 96.12 / 96.07 / 96.64 / 94.92% | 94.52 / 95.40 / 95.84 / 96.42 / 96.49 / 95.59% | 0.79 / 0.54 / 0.43 / -0.73 / 0.19 / -0.18 |
| Plinko 12/medium | 80k | 98.17% | 97.76% | 1.43 |
| Hi-Lo single call | 60k | 97.73% | 98.00% | -0.98 |
| Mines (3 mines, 2 tiles) | 60k | 98.19% | 97.79% | 1.84 |

Theoretical and observed returns are reported separately. The high-volatility slots (classic, mystery) have wide confidence intervals at this sample size.

## Manual browser QA (built-in browser)
| Journey step | Result |
|---|---|
| 1 Open site → home (3D hero, daily puzzle, rails) | Pass (desktop 1024 and mobile 375) |
| 2-3 Register / onboarding | Guest auto-session pass; registration covered by API tests; Lounge QA account registered via API |
| 4-6 Open game → complete → achievement | Pass: Number Rush full 60s run → "Score verified by server replay", +46 XP, +10 ZO, 2 achievements |
| 7 Return to dashboard | Pass |
| 8-11 Invite friend → join → both complete → results saved | Pass via the WebSocket E2E test (two real clients); room UI rendered in the browser |
| 12 Log out / return | API test pass |
| 13 Account deletion | API test pass |
| Age-restricted: Lounge gate flow | Pass: DOB-only adult blocked → dev attestation → terms → catalogue with legal-gate banners |
| Lounge play (dev preview, internal QA only) | European Roulette spin settled server-side ("32 red · returned 100 of 50"); Cosmic Reels 243-ways win evaluation and highlight |
| Chess vs AI on mobile | Pass (1. e4 e5) |
| Responsive | 375px: no horizontal overflow, tab bar within the viewport; desktop rail layout |

### Bugs found and fixed during QA
1. Hero 3D orb overlapped the headline → aspect-aware placement + readability scrim.
2. Horizontal rails bled under the desktop side rail → margins reset at 1024px+.
3. API not yet up on first load produced an uncaught error → handled, with retry.
4. Achievement ids shown instead of titles → titles returned by the server.
5. "Live" badge on solo-capable games → renamed "Multiplayer".
6. Literal `→` / `·` text in JSX → real characters.
7. Production static server conflicted with dynamic sitemap routes → static files in production.
8. JS served uncompressed → build-time Brotli/gzip (main bundle 545 KB → 152 KB transfer).
9. Plinko table rounding drifted to 97.06% → finer rounding (all tables 97.76-98.19%).
10. Dice face orientation math corrected; obstacle-sprint end action after death accepted.
11. Lounge copy mismatched the paytables (Sic Bo doubles/triples, TCP RTP) → corrected and generated from code.

## Performance (production build, localhost)
TTFB 17 ms · First Contentful Paint 0.56 s · Largest Contentful Paint 1.89 s · JS heap 11 MB · Discover route renders 25 tiles in under 1.2 s · Three.js (142 KB gzip) loads only where 3D is used. These are localhost figures; real-network numbers require a deployed environment.

## Not tested
- No automated Playwright suite: the browser pass was manual, on a sample of screens. Not every one of the 50 game UIs was played to completion in a browser (all 50 engines are covered by automated tests).
- Screen-reader audit, cross-browser (Safari / Firefox), real devices, load testing, penetration test.
