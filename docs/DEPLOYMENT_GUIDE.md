# Deployment Guide (local)

## Requirements
Node.js ≥ 22.5 (tested on 24.16). No database server needed: SQLite runs inside Node.

## First run
```bash
npm install
cp .env.example .env        # then set PLAYZO_ADMIN_PASSWORD to create the admin account
npm run dev                 # web http://localhost:5757  ·  API http://127.0.0.1:5758
```
Migrations run automatically on API start. Seed data (ad placements + the optional admin from `.env`) is applied idempotently; **no fake players, scores or activity are ever seeded**.

## URLs
| What | URL |
|---|---|
| App | http://localhost:5757 |
| API health | http://localhost:5757/api/health (proxied) or http://127.0.0.1:5758/api/health |
| Admin | http://localhost:5757/admin (sign in with `PLAYZO_ADMIN_EMAIL` / `PLAYZO_ADMIN_PASSWORD` from `.env`) |
| Dev email outbox | http://localhost:5757/dev/outbox |

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | API (watch) + Vite dev server |
| `npm test` | 94 automated tests |
| `npm run typecheck` | TypeScript |
| `npm run build` | Client build + SEO prerender + pre-compression into `dist/` |
| `npm start` | Production mode: one Node process serving `dist/` + API on `PLAYZO_API_PORT` (dev-only features refused) |
| `npm run gdd` | Regenerate docs/games, GAME_CATALOGUE, ASSET_REGISTER, LOUNGE_MATH |
| `npm run rtp` | Print the published Lounge mathematics |
| `npm run backup:db` | Online database backup to `data/backups/` |

## Configuration (`.env`)
See `.env.example`. Important flags:
- `PLAYZO_LEGAL_APPROVALS`: per-game Lounge gate; requires a legal reference.
- `PLAYZO_ADULT_DEV_PREVIEW`: internal QA only; **false** by default.
- `PLAYZO_DEV_MODE`: dev outbox and dev age attestation.

## Production checklist (not done; required before public launch)
1. Managed PostgreSQL (port the migrations; see DATABASE_SCHEMA.md).
2. Redis for sessions, rate limits and room pub/sub across multiple instances.
3. TLS, CDN, WAF.
4. Email provider; OAuth credentials; certified age-assurance vendor.
5. Payment provider only after legal and commercial approval.
6. Monitoring, alerting, log aggregation; scheduled backups and restore drills.
7. Penetration test; legal sign-off on all gates (LEGAL_AND_COMPLIANCE_GATES.md).
