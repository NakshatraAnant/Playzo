# Execution Tracker

## Ultimate brief (2026-11-15) — phase status
Checkpoint tag: `checkpoint-ultimate-brief`. Local commits only.

| Phase | Status | Notes |
|---|---|---|
| 1-2 Inspection, baseline (188 tests, typecheck, build) and gap list | COMPLETE | Baseline verified before changes |
| 3 Homepage and onboarding journey | COMPLETE | DOB-first 3-step sign-up, new homepage with all sections |
| 4-5 Family and Lounge game experience | COMPLETE | Up-next recommendation on results; all 50 games re-run in browser tests |
| 6 Age-based access | COMPLETE | 21+ Lounge, under-13 closed, 18-20 blocked from Lounge everywhere |
| 7 Accounts | COMPLETE / BLOCKED | Profile name, avatar, tastes; email/OAuth credentials missing |
| 8 Multiplayer | COMPLETE | Load-tested (300 players) |
| 9 Gamification and economy | COMPLETE | Progress notifications |
| 10 Admin, support, notifications | COMPLETE | Support workflow, analytics, errors, backups/restore |
| 11 Design | COMPLETE (within tools) | New homepage, onboarding, support, analytics UI; procedural art only |
| 12 Database, reliability, performance | COMPLETE | Migration 003, integrity check, graceful shutdown, async hashing |
| 13-14 Security, regression, browser/mobile QA | COMPLETE | See QA_TEST_REPORT.md |
| 15 Local production-style deployment | COMPLETE | `npm run local` on :5757 |


## Final build directive (2026-11-12) — phase status
Checkpoint tag before this work: `checkpoint-pre-final-build`. All commits are local on `main`; nothing pushed.

| Phase | Status | Notes |
|---|---|---|
| 1 Repository audit + checkpoint | COMPLETE | Audit findings fixed are listed in SECURITY_AUDIT.md (S-1 … S-11) |
| 2 Family games | COMPLETE | Pause/resume, restart, Finish control; start-to-finish tests for all 25; browser tests for all 25 (desktop + phone) |
| 3 Lounge games (internal QA) | COMPLETE (technical) / BLOCKED (legal) | Rule tests for all 25; browser QA round for all 25 with a tester account |
| 4 Age gates and access control | COMPLETE | Master switch, two-key legal gate, QA roles, verification expiry, fail-closed. Certified provider BLOCKED |
| 5 Authentication and accounts | COMPLETE / PARTIAL | Lockout, sessions list/revoke, security notices. Email delivery and OAuth BLOCKED on credentials |
| 6 Multiplayer and persistence | COMPLETE | Rooms persisted in SQLite and restored on restart; Origin check; duplicate-result protection. PostgreSQL not available locally |
| 7 Gamification, economy, shop | COMPLETE | Daily reward, seasons, referrals (attribution only), content flags, append-only ledger |
| 8 Admin, email, notifications | COMPLETE | Legal, Rooms, Content, Emails, System tabs; Resend adapter + outbox; inbox + preferences |
| 9 Visual design / mobile | PARTIAL | New UI follows the existing design system; responsive 360-1920px verified. No new illustration/video assets (no generation tools) |
| 10 Security, performance, DB hardening | COMPLETE (internal) | Independent pentest not done (KI-17) |
| 11 Browser QA and regression | COMPLETE | Playwright suite on Edge; see QA_TEST_REPORT.md |
| 12 Local deployment and final verification | COMPLETE | Restart verified; see QA_TEST_REPORT.md |

### Resume point
- Run `npm run test:all` to re-verify. Next work items are the BLOCKED rows above (all external) and KNOWN_ISSUES "Recommended next steps".

---

Legend: **Impl** = implemented · **Test** = automated (A), manual browser QA (M), or none (-) · **Issues** = see KNOWN_ISSUES.md (KI-n)

## Resume point
- Branch `main` (local only). Latest checkpoint commit is shown in `git log`.
- Services: `npm run dev` → web http://localhost:5757, API http://127.0.0.1:5758 (health `/api/health`).
- Next actions if work resumes: see "Recommended next steps" at the end of KNOWN_ISSUES.md.

## Platform
| Requirement | Impl | Test | Issues |
|---|---|---|---|
| Mobile-first responsive shell (tab bar / desktop rail) | Done | M (375, 1024+) | - |
| Brand identity, design tokens, themes | Done | M | - |
| Skippable first-visit brand intro | Done | M | - |
| Guest play → registration that keeps progress | Done | A | - |
| Email registration, login, logout, sessions (httpOnly cookie) | Done | A | - |
| Password reset (1h token, revokes sessions) | Done | A | KI-2 (dev outbox) |
| Email verification | Done | M | KI-2 |
| Google / Apple OAuth | Disabled until configured (buttons say so) | A (returns 501) | KI-3 |
| Age-appropriate onboarding, under-13 parental consent | Done | A | KI-2 |
| Account deletion (permanent, cascading) | Done | A | - |
| Profile, level, achievements, mastery, history | Done | A + M | - |
| Privacy settings (public / friends / private; children cannot be public) | Done | A | - |
| Discovery: search, categories, filters, favourites, detail pages, tutorials | Done | M | - |
| Home: featured, continue playing, recommended, daily, missions, collections, friends activity, spotlight event | Done | M | - |
| Admin dashboard (overview, users, reports, games, economy, ads, compliance, audit) | Done | A (RBAC) + M | - |
| SEO: prerendered game pages, OG images, JSON-LD, sitemap, robots (Lounge excluded) | Done | A | - |
| Error boundaries, client error reporting, retry, reconnect | Done | M | - |

## Games
| Requirement | Impl | Test | Issues |
|---|---|---|---|
| 25 family games with their own engine, UI, rules, scoring, tutorial, difficulty | Done | A (engines) + M (sample) | KI-7 |
| Replay verification for 12 real-time games | Done | A | KI-6 |
| Server-authoritative play for 13 hidden-information / strategy games | Done | A | - |
| AI opponents (chess, hex, connect five, territory) | Done | A | KI-9 |
| 25 Lounge modules with published maths | Done (disabled) | A (fairness statistics) | KI-1 |
| GDD per game (docs/games) | Done (generated) | - | - |

## Multiplayer and social
| Requirement | Impl | Test | Issues |
|---|---|---|---|
| Friends: search, request, accept/decline, remove | Done | A | - |
| Block, report, moderation queue | Done | A | - |
| Private rooms (code + invite link), ready state, host start, rematch | Done | A (WebSocket) | KI-5 |
| 1v1 live, 2v2 teams (Trivia, Party Chaos), group up to 8, live races | Done | A (1v1, race) | KI-5 |
| Quick match (13+, age-banded) | Done | - | KI-5 |
| Async challenges (same seed) | Done | A | - |
| Emotes only; adult/minor room segregation | Done | A | - |
| Reconnect (60s grace, forfeit) | Done | - | KI-5 |

## Retention and economy
| Requirement | Impl | Test | Issues |
|---|---|---|---|
| Daily missions (3/day), weekly missions, claimable rewards | Done | M | - |
| Daily Puzzle (rotating, shared seed, daily board) | Done | A | - |
| Weekly leaderboards (+ friends filter), streaks, achievements (21) | Done | A + M | - |
| Idempotent atomic ledger; no negative balances; ZO daily earn cap | Done | A | - |
| Fun Chips: free daily top-up only; never purchasable or redeemable | Done | A | - |
| Cosmetic shop (ZO), PLAYZO Plus (dev-mock checkout, adults only) | Done | A | KI-4 |
| Ad placements with frequency caps; contextual only; none for Plus | Done | - | KI-10 |
| Lounge play controls: daily time limit, cool-off, reality check | Done | A (cool-off) | - |
