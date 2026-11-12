# PLAYZO: Project Master Plan

**Brand:** PLAYZO · **Tagline:** *Aaja PLAYZO pe khelte hain!*
**Scope:** a mobile-first social gaming platform with 50 game modules in two separately controlled environments:
- **Family** (25 games): live locally.
- **PLAYZO Lounge** (25 adult social-casino simulations): built and tested, but **disabled behind legal gates**.

## Original state of the machine (Phase 0, 2026-11-12)
| Item | Finding |
|---|---|
| Working directory | `C:\Users\anant\Desktop\Playzo`, empty, not a git repository |
| Existing code / DB / env | None in this folder (other unrelated projects exist elsewhere on the Desktop; untouched) |
| Tools | Node 24.16, npm 11.13, pnpm 12.3, bun, git 2.55. Python not installed (Store alias only). Docker CLI present, daemon not running. No psql, Blender or ffmpeg |
| Ports in use | 80, 135, 139, 445, 1801, 2103-2107, **3000, 4000, 4500** (other apps), 5040, 7680, 8883/8884 |
| AI asset generation | No image or video generation tool available to the build agent → all art and audio is original and procedural (see ASSET_REGISTER.md) |

Recovery: a local git repository was initialised with checkpoint commits on `main` (no remote, nothing pushed). Local secrets live only in the gitignored `.env`.

## Key decisions
| Decision | Why |
|---|---|
| Vite + React 19 + TypeScript client; Fastify 5 + WebSocket server; shared TypeScript engines | One language end-to-end; the **same deterministic engines** run on client and server, which makes replay verification possible |
| SQLite via built-in `node:sqlite` (WAL) | No PostgreSQL or Docker available locally. The schema is portable SQL; the PostgreSQL mapping is in DATABASE_SCHEMA.md |
| Two engine modes: `server` (state on server) and `replay` (client plays, server re-simulates) | Hidden-information and chance games never trust the client; real-time games stay smooth at 60 FPS and remain verifiable |
| Lounge uses HMAC-SHA256 RNG with a commit/reveal seed | Secure, auditable, resumable randomness, independent of the player |
| Two non-redeemable currencies: ZO (earned, cosmetics) and Fun Chips (free, Lounge only) | Satisfies the "no purchase → risk → value" constraint |
| Ports 5757 (web) / 5758 (API) | 3000/4000/4500 already in use |

## Phases (status)
| Phase | Status |
|---|---|
| 0 Environment inspection | Done |
| 1 Architecture, docs, DB model | Done |
| 2 Design system | Done |
| 3 Core platform (auth, profiles, age controls, admin, discovery) | Done (OAuth, real email and real age assurance are not configured) |
| 4 Shared game infrastructure (sessions, engines, rooms, analytics, progression) | Done |
| 5 Family games (25) | Done |
| 6 Lounge modules (25) behind gates | Done, disabled pending legal review |
| 7 Visual production | Done (procedural vector art, WebGL hero and dice, procedural audio; no AI or video assets: none available) |
| 8 Social and retention | Done |
| 9 Monetisation architecture | Done (dev-mock checkout, house ad placements; no live payments or ad network) |
| 10 Testing | Done: 94 automated tests + manual browser QA |
| 11 Bug fixing | Done for all issues found (see QA_TEST_REPORT.md) |
| 12-13 Local deployment and verification | Done (see DEPLOYMENT_GUIDE.md) |

See EXECUTION_TRACKER.md for requirement-level status, and KNOWN_ISSUES.md for what is not production-ready.
