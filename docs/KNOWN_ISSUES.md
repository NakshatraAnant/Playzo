# Known Issues and Limitations (2026-11-12)

| ID | Severity | Issue | Impact / workaround | Status |
|---|---|---|---|---|
| KI-1 | Blocking (Lounge launch) | No Lounge game has legal clearance (gates G1-G8 open) | Public Lounge is OFF by default; internal QA preview only for admin/tester accounts on localhost | BLOCKED (legal) |
| KI-2 | High (production) | No email provider credentials: verification, reset, parental-consent and security emails stay in the local outbox | The Resend adapter is implemented; set `PLAYZO_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `PLAYZO_EMAIL_FROM`. The UI says honestly that nothing was emailed | BLOCKED (credentials) |
| KI-3 | Medium | Google/Apple sign-in not configured | Buttons disabled and labelled; endpoint returns 501 | BLOCKED (credentials) |
| KI-4 | Medium | Payments are a TEST MODE checkout only | No real money; real payments need legal and commercial approval (G7) | BLOCKED (legal/commercial) |
| KI-5 | Medium | Single-process server: rate-limit buckets and the quick-match queue are in memory | Rooms now persist in SQLite and survive restarts; multi-instance scaling needs Redis/pub-sub | PARTIAL |
| KI-6 | Medium | Replay verification proves a run is possible and humanly timed but cannot fully stop scripted bots | Admin sees rejected runs; behavioural scoring not built | PARTIAL |
| KI-7 | Low | Five server-timed family games (Trivia Clash, Party Chaos, Geography Sprint, Word Duel, Emoji Decode) are not played to their natural end in the browser tests (rounds last minutes) | Their full play-to-end path is covered by `tests/familyComplete.test.ts` with a simulated clock; browser tests cover start, input, pause/resume and restart | PARTIAL |
| KI-8 | Low | SQLite instead of PostgreSQL (no Postgres or Docker daemon available) | Schema is portable; mapping in DATABASE_SCHEMA.md | NOT STARTED |
| KI-9 | Low | Chess AI on Hard can block the API event loop for up to ~1s | Move AI to a worker thread before scaling | OPEN |
| KI-10 | Low | No ad network: house placements only | Architecture and caps ready | NOT STARTED |
| KI-11 | Low | Backups are manual (`npm run backup:db`) | Schedule with Task Scheduler / cron | OPEN |
| KI-12 | Low | PWA manifest but no service worker (no offline play) | Add Workbox | NOT STARTED |
| KI-13 | Info | No AI image/video generation tools were available: all art is original procedural SVG/WebGL; **no video trailers exist** | ASSET_REGISTER.md tracks provenance | BLOCKED (tools) |
| KI-14 | Info | Emoji content renders with the OS emoji font | Acceptable | OPEN |
| KI-15 | Low | Main bundle ~550 KB raw (~155 KB Brotli) | Split cover art per route if slow-network FCP matters | OPEN |
| KI-16 | Info | Terms, Privacy and Help pages are drafts/placeholders; operator, grievance officer and support email intentionally blank | Gate G5 | BLOCKED (legal) |
| KI-17 | High (production) | No independent penetration test | Internal review in SECURITY_AUDIT.md | NOT STARTED |
| KI-18 | Low | Quick match has no automated two-client test | Manually exercised; rooms/races are fully tested | PARTIAL |
| KI-19 | Info | Browser tests run on Microsoft Edge (Chromium) only; Safari/Firefox and real phones not tested | Install other Playwright browsers when network downloads are acceptable | PARTIAL |
| KI-21 | Info | Music is synthesised live, not recorded by musicians or produced with sample libraries; quality depends on the device's speakers. Automated tests check the music engine's state and harmony rules, not the audible output | An optional pass with commissioned recorded stems could replace styles later; the engine already supports per-game themes | OPEN |
| KI-22 | Low | Browsers block audio until the first tap/click on the page, so a game opened directly by URL starts its music on the first interaction | Standard browser autoplay policy | OPEN |
| KI-20 | Low | Certified age verification provider not integrated | Lounge fails closed: no non-QA adult can be verified | BLOCKED (vendor + legal) |

## Recommended next steps
1. Legal review of gates G1-G8 (and record outcomes in Admin → Legal).
2. Email provider credentials; certified age-assurance vendor.
3. PostgreSQL + Redis before any multi-instance deployment.
4. Independent penetration test.
5. Cross-browser and real-device testing.
