# Deployment Guide

## Requirements
Node.js ≥ 22.5 (tested on 24.16). No database server needed: SQLite runs inside Node. Browser tests use the Microsoft Edge that ships with Windows (no download).

## First run
```bash
npm install
cp .env.example .env        # then set PLAYZO_ADMIN_PASSWORD (long random value) to create the admin account
npm run dev                 # web http://localhost:5757  ·  API http://127.0.0.1:5758
```
Migrations run automatically when the API starts (`server/migrations/*.sql`, applied once, in order, inside a transaction). They are additive only. Seed data is configuration only (ad placements + the optional admin from `.env`); **no fake players, scores or activity are ever seeded**.

## Starting and stopping (Windows)
Double-click **start-playzo.cmd** in the PLAYZO folder: it installs dependencies and builds on first run, starts the optimised server on http://localhost:5757 in its own window and opens the browser. Keep that window open while playing; close it or double-click **stop-playzo.cmd** to stop. If the server is not running, the browser shows a "Can't reach the PLAYZO server" page (service worker v2) rather than an old cached copy of the app.

## Two ways to run locally
| Mode | Command | When to use |
|---|---|---|
| **Optimised local (recommended for playing)** | `npm run local` (build + serve) or `npm run serve:local` (serve the existing build) | One Node process on http://localhost:5757 serving the built app and the API: Brotli-compressed files, long-lived caching of hashed assets, service worker, fastest page loads. Dev features (email outbox, QA preview flag) still work |
| Development | `npm run dev` | Live reload while editing code. The web server waits until the API is healthy, so the first page load never sees a 502 |

## URLs
| What | URL |
|---|---|
| App | http://localhost:5757 |
| API health | http://localhost:5757/api/health (proxied) or http://127.0.0.1:5758/api/health |
| Admin | http://localhost:5757/admin (sign in with `PLAYZO_ADMIN_EMAIL` and the password in `.env`) |
| Dev email outbox | http://localhost:5757/dev/outbox |

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | API (watch mode) + Vite dev server |
| `npm test` | Unit, engine, statistical, API and WebSocket tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright on Edge) against an isolated instance on ports 5767/5768 with an in-memory database |
| `npm run test:all` | Typecheck + Vitest + Playwright |
| `npm run typecheck` | TypeScript |
| `npm run build` | Client build + SEO prerender + pre-compression into `dist/` |
| `npm start` | Production mode: one Node process serving `dist/` + API (dev-only features refused) |
| `npm run backup:db` | Online database backup (`VACUUM INTO`) to `data/backups/`, keeps the latest 14. Backups also run automatically once a day while the API is running (`PLAYZO_AUTO_BACKUP=false` to disable) |
| `npm run export:postgres` | Write a PostgreSQL schema + data load of the live database to `data/postgres-export/` (gitignored; contains personal data) |
| `npm run loadtest [rooms] [moves]` | Multiplayer load test against an isolated in-memory server (default 50 rooms) |
| `npm run gdd` / `npm run rtp` | Regenerate game docs / print Lounge mathematics |

## Backup and restore
- **Backup:** automatic daily while the API runs; on demand with `npm run backup:db` or Admin → System → Back up now (safe while the server runs).
- **Restore (recommended):** Admin → System → Verify the backup, then Restore (type RESTORE) and restart the server. The current database is saved as `pre-restore-<time>.db` first; migrations newer than the backup are applied automatically.
- **Restore (manual):** stop the server, copy the backup over `data/playzo.db` (keep the old file aside; delete `data/playzo.db-wal` and `-shm` only after the copy), start the server.

## Restart behaviour
Stopping the API (`Ctrl+C`) flushes every live room to the database. On start, lobby and in-progress rooms are restored; players reconnect automatically (the room page retries for about a minute) and continue with the same board, seed and turn. Rooms older than 3 hours are expired.

## Configuration (`.env`)
See `.env.example`. Important flags:
- `PLAYZO_LOUNGE_ENABLED` (default false), `PLAYZO_LEGAL_APPROVALS`, `PLAYZO_ADULT_DEV_PREVIEW` (default false; admin/tester accounts, localhost only). See LEGAL_AND_COMPLIANCE_GATES.md.
- `PLAYZO_EMAIL_PROVIDER` / `RESEND_API_KEY` / `PLAYZO_EMAIL_FROM` for real email delivery.
- `PLAYZO_DEV_MODE`: dev outbox and dev attestation (QA accounts only). Refused in production.
- To give a QA account Lounge preview access: Admin → Users → set role `tester` (and set `PLAYZO_ADULT_DEV_PREVIEW=true`, restart).

## Production
One Node process serves the app, the API and WebSockets. Put it behind a TLS proxy that forwards `Upgrade` (WebSocket) headers.

```bash
docker build --build-arg PLAYZO_PUBLIC_URL=https://your-domain -t playzo .
docker run -d --restart unless-stopped -p 127.0.0.1:8080:8080 -v playzo-data:/data   -e PLAYZO_PUBLIC_URL=https://your-domain -e PLAYZO_TRUST_PROXY=1   -e PLAYZO_ADMIN_EMAIL=... -e PLAYZO_ADMIN_PASSWORD=...   -e PLAYZO_EMAIL_PROVIDER=resend -e RESEND_API_KEY=... -e PLAYZO_EMAIL_FROM=... playzo
```
- Without Docker: `npm ci && npm run build && npm start`, with the same variables in `.env`.
- The server refuses to start in production with a non-HTTPS public URL, an admin password under 12 characters, or no build. It refuses a public address outside production.
- `PLAYZO_TRUST_PROXY`: number of proxy hops in front. Without it, every visitor shares the proxy's address and its rate limits.
- Run exactly one instance (rooms, rate limits and the SQLite database are per process). Backups are written next to the database; copy them off the machine.
- Health: `GET /api/health`. Request logs: `PLAYZO_LOG_LEVEL=info`.

## Production checklist (not done; required before public launch)
1. Managed PostgreSQL (port the migrations; see DATABASE_SCHEMA.md).
2. Redis for rate limits and room pub/sub across instances.
3. TLS, CDN, WAF; set `PLAYZO_PUBLIC_URL` to the HTTPS origin (also used for the WebSocket Origin check).
4. Email provider credentials; OAuth credentials; certified age-assurance vendor.
5. Payment provider only after legal and commercial approval.
6. Monitoring, alerting, log aggregation; scheduled backups and restore drills.
7. Independent penetration test; legal sign-off on all gates.
