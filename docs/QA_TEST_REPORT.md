# QA Test Report (2026-11-17)

## Summary
| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | Clean |
| Unit, engine, statistical, API, WebSocket, performance, journey, sign-in, fair-play and export tests (`npm test`) | **210 / 210 passing** (14 files) |
| Browser tests (`npm run test:e2e`, Playwright on Microsoft Edge) | **124 / 124 passing**: full run 123 passed; the 1 failure was a test race (Obstacle Sprint ended on its own as the test clicked Finish), fixed and the 12 real-time games re-run 12/12 |
| Multiplayer load test (`npm run loadtest`) | 300 concurrent players in 150 rooms: **0 errors**, move-to-update latency p50 50 ms, p95 71 ms, p99 74 ms; 200 players: p50 26 ms, p95 42 ms; 100 players: p50 18 ms, p95 25 ms (in-process, localhost; not a production capacity claim) |
| Production build (`npm run build`) | Clean, no warnings; main bundle 127 KB gzip; 27 prerendered pages |
| `npm audit` | 0 vulnerabilities |
| Restart | Stop/start verified: migrations 001+002 applied, 50 engines, Lounge locked, existing database kept, backup written |
| Optimised local server (`npm run serve:local`) | Pages and API answer in under 10 ms on localhost (was ~220 ms before binding both loopback addresses); home page DOM ready in 65 ms; 13 MB JS heap |

## Automated tests: `npm test`
| Suite | Tests | Covers |
|---|---|---|
| `replayEngines.test.ts` | 25 | Determinism of the 12 replay engines, solvability, anti-cheat timing, client simulation == server replay |
| `serverEngines.test.ts` | 21 | Registry (50), full chess rules, Code Breaker, Hex, Connect Five, Territory, Trivia timing, redaction, dictionary, Word Ladder, Emoji matching, Memory Duel |
| `familyComplete.test.ts` | 28 | **All 25 family games played to game over** (simulated server clock for timed games), replay logs re-verified by the server, tampering rejected; all 25 start through HTTP |
| `loungeRules.test.ts` | 33 | **Individual rule tests for all 25 Lounge games**: valid rounds fully ledgered, invalid actions rejected, stakes above balance refused, hidden information never in the view, reproducible for a fixed seed |
| `fairness.test.ts` | 25 | Monte Carlo vs published RTP (z-tests), chi-square uniformity, exact slot RTP, crash distribution, outcome independence from balance |
| `api.test.ts` | 25 | Auth, CSRF, guest upgrade, under-13 flow, sessions, replay verification, Lounge invisibility, **QA-role preview, two-key legal gate, verification expiry**, cool-off, ledger, shop, social safety, admin RBAC, deletion, SEO |
| `platform.test.ts` | 15 | Login lockout, session list/revoke, password change signs out other devices, outbox honesty, referrals (no payout), notifications + preferences, daily reward, seasons, pause/resume (deadline shift, paused runs not ranked), append-only ledger/audit log |
| `multiplayer.test.ts` | 7 | Two real WebSocket clients play to a result; emotes only; race rooms; **rooms restored after a simulated restart with the board intact and exactly one match record**; lobby reconnect; **cross-site WebSocket Origin rejected**; **quick match pairs two players, refuses guests, keeps adults and teens apart** |
| `oauth.test.ts` | 4 | Google sign-in against a local stand-in provider: PKCE, single-use state, nonce/audience/issuer/expiry checks, open-redirect guard, no auto-merge by email, explicit linking, age policy on new accounts |
| `fairplay.test.ts` | 5 | Human-like timing passes, scripted timing flagged, held leaderboard entries, staff clear/remove, audit |
| `postgresExport.test.ts` | 1 | PostgreSQL translation of the full schema and safe data quoting |
| `oauth.test.ts` | 4 | Google sign-in against a local stand-in provider: PKCE, single-use state, nonce/audience/issuer/expiry checks, open-redirect guard, no auto-merge by email, explicit linking, age policy on new accounts |
| `fairplay.test.ts` | 5 | Human-like timing passes, scripted timing flagged, held leaderboard entries, staff clear/remove, audit |
| `postgresExport.test.ts` | 1 | PostgreSQL translation of the full schema and safe data quoting |
| `journey.test.ts` | 9 | Avatar and tastes at sign-up, taste-driven recommendations, home feed sections with real-only popularity, support ticket workflow and privacy, report tracking, analytics (staff-only, every metric), achievement notifications, backup restore with safety copy, admin-only restore, startup integrity check |
| `performance.test.ts` | 3 | Chess AI reply time stays within its budget at every level |
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

## New in the ultimate-brief pass
- `journey.spec` (desktop + phone): homepage CTAs and sections, under-13 refused (UI and API) with guest play, a 19-year-old cannot reach the Lounge by link, URL or API, support ticket round trip with an admin reply, analytics dashboard.
- `auth.spec`: date-of-birth-first, 3-step sign-up with avatar and tastes.
- Found by the load test and fixed: password hashing blocked every live game for ~50 ms per sign-in (now asynchronous).

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
12. A run that ended right after pressing Pause left the pause overlay over the results screen.
13. Chess AI on Hard could block the server for ~1 s (now a 220 ms budget).
14. The web dev server started before the API, so first loads showed 502 errors.
11. Lounge played celebratory sounds for returns smaller than the stake and a jackpot fanfare (now neutral cues).

## Manual checks
- Live soundtrack check in the browser: Geography Sprint plays its "Adventure explorer" theme (98 BPM), sinks under pause and returns on resume.
- Mobile layout measured at 360px and 375px on the running app (no page wider than the viewport).

## Not tested
- Safari, Firefox and real phones (only Edge/Chromium was available without downloads).
- Audible quality of the synthesised music on different speakers (tests check the engine, not sound output).
- Live email/OAuth/payment/age-verification providers (none configured).
- Load testing and an independent penetration test.
