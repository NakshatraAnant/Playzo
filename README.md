# PLAYZO

**Aaja PLAYZO pe khelte hain!** A premium, mobile-first social gaming platform with 50 original game modules:
- **25 family games:** puzzles, word and knowledge games, strategy games against the computer, and live party games.
- **25 PLAYZO Lounge simulations (18+):** built, tested and mathematically published, but **disabled until legal approval**.

```bash
npm install
npm run dev     # http://localhost:5757
npm test        # 94 automated tests
```

## Highlights
- **Server-authoritative play.**
  - Hidden-information games keep their state on the server.
  - Real-time games are replay-verified: the server re-simulates your inputs with the same deterministic engine.
- **Live multiplayer** over WebSockets: private rooms, 2v2 teams, races on a shared seed, quick match, async friend challenges. Communication is emotes-only.
- **Safe economy.**
  - ZO coins are earned, not bought, and used only for cosmetics.
  - Lounge Fun Chips are free and non-redeemable.
  - Every credit event goes through an atomic, idempotent ledger.
- **Fair, published maths** for every Lounge game: cryptographic HMAC RNG with commit/reveal, statistically tested.
- **Age and safety controls:** guest play, under-13 parental consent, adult/minor separation, Lounge invisible to minors, time limits and cool-off.
- **Original visuals:** 50 vector cover worlds, WebGL hero and dice, procedural Web Audio sound.

## Documentation
All docs live in `docs/`:
- PROJECT_MASTER_PLAN · EXECUTION_TRACKER · ARCHITECTURE · DATABASE_SCHEMA
- GAME_CATALOGUE · 50 Game Design Documents in `docs/games/`
- DESIGN_SYSTEM · SECURITY_PLAN · LEGAL_AND_COMPLIANCE_GATES
- QA_TEST_REPORT · DEPLOYMENT_GUIDE · KNOWN_ISSUES · ASSET_REGISTER · LOUNGE_MATH

**Status:** locally functional. Not production-engineered, security-audited, legally reviewed or ready for public release. See KNOWN_ISSUES.md.
