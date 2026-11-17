# Known Issues and Limitations (2026-11-12)

| ID | Severity | Issue | Impact / workaround | Status |
|---|---|---|---|---|
| KI-1 | Blocking (Lounge launch) | No Lounge game has a recorded approval yet (gates G1-G8 open). The 21+ product decision is implemented; the Lounge switch stays off until approval references are recorded | Public Lounge is OFF by default; internal QA preview only for admin/tester accounts on localhost | BLOCKED (legal) |
| KI-2 | High (production) | No email provider credentials: verification, reset, parental-consent and security emails stay in the local outbox | The Resend adapter is implemented; set `PLAYZO_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `PLAYZO_EMAIL_FROM`. The UI says honestly that nothing was emailed | BLOCKED (credentials) |
| KI-3 | Medium | Google/Apple sign-in need provider credentials | Full adapters implemented (OpenID Connect, PKCE, state, nonce, JWKS-verified ID tokens, DOB-first completion, explicit linking) and tested against a local stand-in provider; add GOOGLE_CLIENT_ID/SECRET or the Apple keys to switch on. Not yet run against Google or Apple themselves | BLOCKED (credentials) |
| KI-4 | Medium | Payments are a TEST MODE checkout only | No real money; real payments need legal and commercial approval (G7) | BLOCKED (legal/commercial) |
| KI-5 | Medium | Single-process server: rate-limit buckets and the quick-match queue are in memory | Rooms now persist in SQLite and survive restarts; multi-instance scaling needs Redis/pub-sub | PARTIAL |
| KI-6 | Resolved (partial by nature) | Scripted bots in real-time games | Behavioural scoring on every verified replay run (timing regularity, superhuman speed, repeated intervals); flagged runs are held from leaderboards until staff clear/remove them in Admin → Fair play. No detector catches every bot | FIXED |
| KI-7 | Low | Five server-timed family games (Trivia Clash, Party Chaos, Geography Sprint, Word Duel, Emoji Decode) are not played to their natural end in the browser tests (rounds last minutes) | Their full play-to-end path is covered by `tests/familyComplete.test.ts` with a simulated clock; browser tests cover start, input, pause/resume and restart | PARTIAL |
| KI-8 | Low | SQLite instead of PostgreSQL (no Postgres or Docker on this machine) | npm run export:postgres produces a PostgreSQL schema and data load (translation tested); switching the server's data layer to PostgreSQL is still a separate change and the export has not been loaded into a real PostgreSQL server | PARTIAL |
| KI-9 | Resolved | Chess AI on Hard could block the API for ~1 s | Now iterative deepening with root alpha-beta and a 220 ms budget; tests/performance.test.ts guards every level | FIXED |
| KI-10 | Low | No ad network: house placements only | Architecture and caps ready | NOT STARTED |
| KI-11 | Resolved | Backups were manual | Automatic daily backup at API start-up / every 6 h check (newest 14 kept), plus Admin → System → Back up now and npm run backup:db | FIXED |
| KI-12 | Resolved (partial by design) | No service worker | Service worker in built app: cached shell and assets, offline page and an offline banner. Games still need the server (scores are server-verified), so there is no offline gameplay | FIXED |
| KI-13 | Info | No AI image/video generation tools were available: all art is original procedural SVG/WebGL; **no video trailers exist** | ASSET_REGISTER.md tracks provenance | BLOCKED (tools) |
| KI-14 | Info | Emoji content renders with the OS emoji font | Acceptable | OPEN |
| KI-15 | Resolved | Large main bundle | Main bundle now ~110 KB Brotli; game UIs, Three.js and pages load on demand | FIXED |
| KI-16 | Info | Terms, Privacy and Help pages are drafts/placeholders; operator, grievance officer and support email intentionally blank | Gate G5 | BLOCKED (legal) |
| KI-17 | High (production) | No independent penetration test | Internal review in SECURITY_AUDIT.md | NOT STARTED |
| KI-18 | Resolved | Quick match had no automated test | multiplayer.test.ts pairs two players, refuses guests and keeps adults and teens apart | FIXED |
| KI-19 | Info | Browser tests run on Microsoft Edge (Chromium) only; Safari/Firefox and real phones not tested | Install other Playwright browsers when network downloads are acceptable | PARTIAL |
| KI-21 | Info | Music is synthesised live, not recorded by musicians or produced with sample libraries; quality depends on the device's speakers. Automated tests check the music engine's state and harmony rules, not the audible output | An optional pass with commissioned recorded stems could replace styles later; the engine already supports per-game themes | OPEN |
| KI-22 | Low | Browsers block audio until the first tap/click on the page, so a game opened directly by URL starts its music on the first interaction | Standard browser autoplay policy | OPEN |
| KI-23 | Info | Under-13 accounts are closed by default (product decision) because parental-consent emails cannot be delivered without an email provider | Set PLAYZO_ALLOW_UNDER13=true only after email delivery and a verified consent flow are in place | BLOCKED (credentials) |
| KI-24 | Low | On Windows, more than ~300 simultaneous new connections in the same instant can overflow the OS connection queue | Normal arrival patterns are fine (300 concurrent players tested); use a reverse proxy/load balancer in production | OPEN |
| KI-20 | Low | Certified age verification provider not integrated | Lounge fails closed: no non-QA adult can be verified | BLOCKED (vendor + legal) |

## Recommended next steps
1. Legal review of gates G1-G8 (and record outcomes in Admin → Legal).
2. Email provider credentials; certified age-assurance vendor.
3. PostgreSQL + Redis before any multi-instance deployment.
4. Independent penetration test.
5. Cross-browser and real-device testing.
