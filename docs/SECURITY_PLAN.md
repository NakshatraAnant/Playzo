# Security Plan

| Control | Implementation | Status |
|---|---|---|
| Passwords | scrypt (N=16384, r=8, p=1, 64-byte key, 16-byte salt); timing-safe compare | Done |
| Sessions | 32-byte random token, cookie `pz_session` httpOnly + SameSite=Lax (+ Secure in production); only the SHA-256 hash is stored; 30-day expiry; revoked on logout, reset or suspension | Done |
| CSRF | Every non-GET `/api/*` request must send `x-playzo: 1` (forces a CORS preflight; no CORS is enabled) + SameSite cookies | Done (tested) |
| Authorisation | Server-side role checks (`requireRole`); Lounge entitlement + legal gate re-checked on **every** Lounge action; admin mutations audited | Done (tested) |
| Input validation | Explicit validators on every route; engine-level validation of every game action; body limit 2 MB; WebSocket payload 16 KB | Done |
| SQL injection | Prepared statements only; LIKE patterns escaped | Done |
| XSS | React escaping; no `dangerouslySetInnerHTML`; CSP `script-src 'self'`; usernames restricted to `[A-Za-z0-9_]` | Done |
| Security headers | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS (production) | Done |
| Rate limiting | Per user/IP token buckets: auth 10/min, guest 10/min, actions 1200/min, rooms, reports, search; WebSocket 30 msgs/s | Done (in-memory, KI-8) |
| Anti-cheat | Server-held state; replay verification with time and plausibility checks; rejected runs logged for admin review | Done (KI-6) |
| Duplicate requests | Idempotent ledger keys; per-session locks; DB CHECK `balance >= 0` | Done (tested) |
| Secrets | `.env` gitignored; `.env.example` holds no secrets; Fastify logger redacts cookie/authorization; passwords and tokens never logged | Done |
| Privacy | No fingerprinting, no third-party trackers, no behavioural ads; analytics de-linked on deletion | Done |
| Dependencies | `npm audit`: 0 vulnerabilities at install time | Checked 2026-11-12 |
| Backups | `npm run backup:db` | Done (schedule externally: KI-11) |
| Dev-only features | Dev outbox, dev age attestation and the adult dev preview are all **refused when NODE_ENV=production** | Done |

**Not yet done (required before any public launch):** an independent penetration test; WAF/CDN; a shared rate-limit store (Redis); a secrets manager; centralised logging and alerting; incident response runbook; a production age-assurance vendor; DPIA under the Digital Personal Data Protection Act, 2023.
