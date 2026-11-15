# Security Audit (internal engineering review, 2026-11-12)

> This is an internal code review plus automated checks, **not** an independent penetration test. An external pentest is still required before any public launch (KNOWN_ISSUES KI-17).

## How it was checked
- Manual review of every server route (`server/*.ts`) for authentication, authorisation and input handling.
- Automated tests that try the attacks listed below (`tests/*.test.ts`, `e2e/*.spec.ts`).
- `npm audit`: **0 vulnerabilities** (production and dev dependencies).
- Search for dynamic SQL, HTML injection sinks (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`) and committed secrets.

## Findings and status
| # | Area | Finding | Severity | Status |
|---|---|---|---|---|
| S-1 | Lounge access | Internal QA preview (`PLAYZO_ADULT_DEV_PREVIEW`) unlocked the Lounge for **any** verified adult on a dev server | High | **Fixed**: preview now requires an `admin` or `tester` role as well, and is ignored in production. Test: `api.test.ts` "QA preview needs the server flag AND an admin/tester role" |
| S-2 | Age verification | The placeholder "dev attestation" could mark any adult as verified in dev mode (fake verification success) | High | **Fixed**: refused (503) for non-QA accounts and always refused in production; refusals are audited. A bare POST can never verify a production-grade provider (501: must use the provider flow) |
| S-3 | Legal gate | A single config entry opened a Lounge game | Medium | **Fixed**: two-key gate. Needs `PLAYZO_LOUNGE_ENABLED=true` **and** a `PLAYZO_LEGAL_APPROVALS` reference **and** a matching `approved` legal record. The admin UI can record reviews but cannot change config. Tests cover each key |
| S-4 | Brute force | Login had only a per-IP rate limit | Medium | **Fixed**: per-account lockout (5 failures / 15 min → 15 min lock), persisted in the DB, same response for unknown accounts (no enumeration), owner notified in-app |
| S-5 | Sessions | Changing the password did not sign out other devices | Medium | **Fixed**: other sessions revoked; users can list and revoke sessions (device label only, never the token hash) |
| S-6 | WebSocket | No Origin check on `/ws` (cross-site WebSocket hijacking defence-in-depth; cookies are SameSite=Lax) | Medium | **Fixed**: browser Origin must be the configured public URL (or localhost in dev). Test: `multiplayer.test.ts` "websocket origin check" |
| S-7 | Multiplayer | A room page could leave an orphaned second socket open (duplicate messages) | Low | **Fixed** in `client/src/pages/Play.tsx`; e2e asserts exactly one emote toast per message |
| S-8 | Ledger integrity | Ledger rows could be updated or deleted by any code path | Medium | **Fixed**: database triggers make `ledger` and `audit_log` append-only (rows only disappear through account-deletion cascades). Test: `platform.test.ts` "append-only" |
| S-9 | Duplicate results | A room finishing twice (e.g. across a restart) could record two matches | Low | **Fixed**: deterministic match id per room start + `INSERT OR IGNORE`; rewards only on first insert |
| S-10 | Email | UI text claimed reset/verification emails were "on their way" when only stored locally | Low (honesty) | **Fixed**: copy depends on whether a provider is configured; outbox rows are labelled `outbox_only` |
| S-12 | Availability | Password hashing used synchronous scrypt, blocking every live game and request for ~50 ms per sign-in (found by the load test) | Medium | **Fixed**: async scrypt on the worker pool; startup seeding only uses the sync variant |
| S-13 | Account discovery | Login skipped hashing for unknown accounts, so response time could reveal whether an account exists | Low | **Fixed**: unknown accounts verify against a dummy hash (constant work) |
| S-14 | Age gating | Lounge eligibility was 18+ | Policy | **Changed** to 21+ by date of birth on every request; 18-20 get 404/403 on every Lounge route, API and session start (tests: api, journey e2e) |
| S-15 | Children | Under-13 accounts could be created pending parental email that cannot be delivered locally | Policy | **Changed**: under-13 sign-up refused by default; nothing stored; guest play remains |
| S-16 | Support | New ticket and admin endpoints | - | Owner-only ticket access (404 for others), staff-only queue (403), audited staff actions, length limits, rate limits |
| S-11 | Admin | Admin role changes, room closures, score removals, legal records, email retries and content flags | - | All server-side role-checked (`requireRole`) and audited. e2e: every admin endpoint returns 403 for normal users |

## Attack checklist
| Attack | Defence | Evidence |
|---|---|---|
| Authentication bypass | httpOnly session cookie, SHA-256-hashed tokens server-side, `status='active'` checked on every request and every WebSocket message | api tests |
| Authorisation bypass / privilege escalation | `requireRole` on every admin route; only admins change roles; support cannot change admins; guests cannot become admins (`is_guest = 0` guard) | api + e2e admin tests |
| IDOR | Sessions, notifications, sessions-list and inventory are always filtered by the signed-in user id; foreign session ids return 404 | api tests |
| SQL injection | All queries are parameterised. Two dynamic identifiers use closed whitelists (`shop.ts` equip column, `admin.ts` row-count table list) | code review |
| XSS | React escaping; no `dangerouslySetInnerHTML`/`innerHTML`/`eval`; chat is emotes-only from a fixed list; email templates escape all variables; CSP `script-src 'self'` | code review, CSP header test |
| CSRF | State-changing API calls require the `x-playzo: 1` header (forces a CORS preflight; no CORS enabled); cookies SameSite=Lax | api test |
| SSRF | The server makes one outbound request type (email provider API) to a fixed URL; no user-supplied URLs are fetched | code review |
| File upload | No file upload endpoints exist | code review |
| Session security | 30-day expiry, revocation on reset/password change/suspension, `secure` cookie in production, per-session last-use tracking | api + platform tests |
| Rate limiting | Per-user/IP token buckets on auth, guest creation, sessions, actions, rooms, challenges; WebSocket 30 msg/s; login lockout per account | api tests |
| Input validation | Length/format checks (`str`, `oneOf`), action size caps (2-4 KB), body limit 2 MB, WS payload 16 KB, replay logs ≤ 50,000 actions | api tests |
| Game-state tampering | Server-mode games keep state on the server; views are redacted (no deck, secret, mines, crash point, opponents' cards) | engine + Lounge rule tests |
| Score manipulation | Replay games are re-simulated; impossible timing (`TOO_FAST`), over-long runs (`TOO_LONG`), out-of-order logs (`IMPLAUSIBLE`) are rejected; paused runs never reach leaderboards | replay + platform tests |
| Reward manipulation | Idempotency keys on every credit; `CHECK balance >= 0`; daily ZO earn cap; daily reward once per day (primary key); mission claims once per period; referrals pay nothing | economy + platform tests |
| Secret exposure | `.env`, databases and QA files are gitignored; `/api/admin/system` returns non-secret config only (e2e asserts the admin password never appears) | git ls-files check, e2e |
| Sensitive data exposure | Public profiles respect privacy settings; children get generic display names; admin email log masks addresses; logs redact cookies/authorization | code review |
| Dependency vulnerabilities | `npm audit` 0 | audit output |

## Remaining risks (documented, not fixed)
| Risk | Why it remains | Mitigation path |
|---|---|---|
| Scripted bots in real-time games (KI-6) | Replay proves a run is possible and humanly timed, not that a human played it | Behavioural scoring, admin review of rejected runs (view exists), CAPTCHA-free risk signals |
| In-memory rate-limit buckets | Per process; reset on restart | Redis in multi-instance deployments |
| No independent penetration test | Out of scope for a local build | Commission before public launch |
| SQLite file permissions | Local machine only | Managed PostgreSQL with encrypted storage in production |
