# QA Test Report (2026-11-12, final build)

## Summary
| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | Clean |
| Unit, engine, statistical, API and WebSocket tests (`npm test`) | **184 / 184 passing** (9 files) |
| Browser tests (`npm run test:e2e`, Playwright on Microsoft Edge) | **114 / 114 passing** (full run: 113 + the one failure fixed and re-run; smoke re-run 24/24 on desktop and phone) |
| Production build (`npm run build`) | Clean, no warnings; main bundle 127 KB gzip; 27 prerendered pages |
| `npm audit` | 0 vulnerabilities |
| Restart | Stop/start verified: migrations 001+002 applied, 50 engines, Lounge locked, existing database kept, backup written |

## Automated tests: `npm test`
| Suite | Tests | Covers |
|---|---|---|
| `replayEngines.test.ts` | 25 | Determinism of the 12 replay engines, solvability, anti-cheat timing, client simulation == server replay |
| `serverEngines.test.ts` | 21 | Registry (50), full chess rules, Code Breaker, Hex, Connect Five, Territory, Trivia timing, redaction, dictionary, Word Ladder, Emoji matching, Memory Duel |
| `familyComplete.test.ts` | 28 | **All 25 family games played to game over** (simulated server clock for timed games), replay logs re-verified by the server, tampering rejected; all 25 start through HTTP |
| `loungeRules.test.ts` | 33 | **Individual rule tests for all 25 Lounge games**: valid rounds fully ledgered, invalid actions rejected, stakes above balance refused, hidden information never in the view, reproducible for a fixed seed |
| `fairness.test.ts` | 25 | Monte Carlo vs published RTP (z-tests), chi-square uniformity, exact slot RTP, crash distribution, outcome independence from balance |
| `api.test.ts` | 22 | Auth, CSRF, guest upgrade, under-13 flow, sessions, replay verification, Lounge invisibility, **QA-role preview, two-key legal gate, verification expiry**, cool-off, ledger, shop, social safety, admin RBAC, deletion, SEO |
| `platform.test.ts` | 15 | Login lockout, session list/revoke, password change signs out other devices, outbox honesty, referrals (no payout), notifications + preferences, daily reward, seasons, pause/resume (deadline shift, paused runs not ranked), append-only ledger/audit log |
| `multiplayer.test.ts` | 6 | Two real WebSocket clients play to a result; emotes only; race rooms; **rooms restored after a simulated restart with the board intact and exactly one match record**; lobby reconnect; **cross-site WebSocket Origin rejected** |
| `music.test.ts` | 9 | Soundtrack for all 50 games, unique deterministic themes, notes in key, adaptive layering, urgency, memory-game caps, calm Lounge audio, no win sounds for partial returns |

## Browser tests: `npm run test:e2e` (Edge, isolated instance with an in-memory database)
| Spec | Desktop (1366px) | Phone (390px) | Covers |
|---|---|---|---|
| `smoke` | 12 | 12 | Every main route renders without errors; navigation; Lounge not linked/listed/reachable; **no horizontal overflow at 360, 375, 390, 430, 768, 1024, 1440, 1920px**; SEO tags and security headers |
| `auth` | 3 | 3 | Register → welcome → settings (sessions, verification state) → inbox → sign out/in → reset password via outbox (UI says nothing was emailed) → delete account; daily reward once; lockout message |
| `family` | 26 | 26 | **All 25 family games**: discovery page → instructions → start → input → pause/resume → finish (replay) / resign (strategy) / give up (Word Ladder) → results → restart; daily puzzle cannot be paused |
| `lounge` | 26 | - | Ordinary adults refused the dev attestation, minors 404; **all 25 Lounge games** played one real round by a tester account in internal QA preview with "NOT LEGALLY APPROVED" banners |
| `multiplayer` | 2 | - | Two browsers: create room → join by code → ready → start → move → emote (exactly one per message) → resign → result in both match histories → rematch; reload mid-match reconnects |
| `admin` | 2 | - | Every admin tab loads; System tab never shows secrets; legal record cannot open a game; normal users get 403 from every admin endpoint |
| `music` | 2 | - | Six family games each start their own different theme; pause, in-game toggle and Settings previews control the music |

## Bugs found and fixed in this pass
1. Lounge QA preview was open to any verified adult (now admin/tester only) and the dev attestation could fake verification (now refused).
2. One Lounge config key opened a game (now a three-key gate).
3. No per-account login lockout; password change kept other sessions alive.
4. No WebSocket Origin check.
5. Room page could leave an orphaned second socket (every message twice).
6. Guest-session race: starting a game on a first visit could fail with "Already signed in".
7. Fact or Fiction rendered duplicate React keys.
8. Pages overflowed by up to 59px on 360-375px phones (segmented controls, home cards, tab bar).
9. Copy claimed reset/verification emails were "on their way" when no provider exists.
10. Walking bass played a note outside the key (caught by the music tests).
11. Lounge played celebratory sounds for returns smaller than the stake and a jackpot fanfare (now neutral cues).

## Manual checks
- Live soundtrack check in the browser: Geography Sprint plays its "Adventure explorer" theme (98 BPM), sinks under pause and returns on resume.
- Mobile layout measured at 360px and 375px on the running app (no page wider than the viewport).

## Not tested
- Safari, Firefox and real phones (only Edge/Chromium was available without downloads).
- Audible quality of the synthesised music on different speakers (tests check the engine, not sound output).
- Live email/OAuth/payment/age-verification providers (none configured).
- Load testing and an independent penetration test.
