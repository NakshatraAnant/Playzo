# Known Issues and Limitations

| ID | Severity | Issue | Impact / workaround |
|---|---|---|---|
| KI-1 | Blocking (Lounge launch) | All 25 Lounge simulations are disabled pending legal review (gates G1-G8) | By design. Internal QA only via `PLAYZO_ADULT_DEV_PREVIEW=true` on localhost |
| KI-2 | High (production) | No email provider: verification, reset and parental-consent emails go to the dev outbox | Integrate an email provider; the outbox is refused in production |
| KI-3 | Medium | Google/Apple sign-in not configured (no credentials) | Buttons are disabled and say "not configured"; the endpoint returns 501 |
| KI-4 | Medium | Payments are a dev-mock test checkout only | Real payments need legal and commercial approval |
| KI-5 | Medium | Rooms, the quick-match queue and rate limits live in memory in one process; a restart drops live rooms | Use Redis/pub-sub for multi-instance deployments |
| KI-6 | Medium | Replay verification proves a run is *possible* and humanly timed, but cannot fully stop scripted bots in real-time games | Add behavioural anomaly scoring and review of rejected runs (admin view exists) |
| KI-7 | Low | Not every one of the 50 game UIs was played to completion in a browser (engines are fully tested) | Add a Playwright suite |
| KI-8 | Low | SQLite instead of PostgreSQL (no Postgres or Docker daemon available locally) | Portable schema; PostgreSQL mapping documented |
| KI-9 | Low | Chess AI on Hard (depth 3) can block the API event loop for up to ~1s | Move AI to a worker thread before scaling |
| KI-10 | Low | No ad network: house placements only; rewarded ads not implemented | Architecture and frequency caps ready |
| KI-11 | Low | Backups are manual (`npm run backup:db`) | Schedule with Task Scheduler / cron |
| KI-12 | Low | PWA has a manifest but no service worker (no offline mode) | Add Workbox for static/offline play |
| KI-13 | Info | No AI image or video generation tools were available: all art is original procedural vector/WebGL; **no video trailers or intros exist** | An AI asset pass can replace covers later; ASSET_REGISTER.md tracks provenance |
| KI-14 | Info | Emoji-based content (Emoji Decode, critters, flags) renders with the OS emoji font | Acceptable; bespoke art could replace it |
| KI-15 | Low | Main bundle 545 KB raw (152 KB Brotli) includes framer-motion and the 50 cover-art motifs | Split covers per route if FCP on slow networks needs improving |
| KI-16 | Info | Legal pages are engineering drafts, not reviewed by counsel | Gate G5 |

## Recommended next steps
1. Legal review of gates G1-G8.
2. Email and age-assurance vendors.
3. PostgreSQL + Redis.
4. Playwright E2E suite.
5. AI art pass (optional).
6. Service worker.
