# Legal and Compliance Gates

> **This is an engineering summary, not legal advice.** PLAYZO has **not** received any legal approval. Every Lounge simulation stays disabled until qualified counsel signs off.

## Research summary (as of 2026-11-12; verify with counsel)
- **Promotion and Regulation of Online Gaming Act, 2025:**
  - Prohibits *online money games* (paying or staking with an expectation of monetary or other winnings), along with their advertising and the related payment processing.
  - Promotes e-sports and *online social games*.
- **Promotion and Regulation of Online Gaming Rules, 2026:**
  - Notified by MeitY on 22 April 2026; in force from 1 May 2026.
  - Constitutes the **Online Gaming Authority of India (OGAI)**.
  - Registration is **not mandatory for online social games** by default. It applies to e-sports, and to games or categories the Central Government or the Authority requires, considering risk of harm (especially to children), user numbers, money involved, and similar factors.
  - The Authority may make a *determination* of a game's status. Relevant factors include fees, deposits or stakes; expected winnings; the revenue model; and **whether rewards or in-game items can be transferred, sold or redeemed outside the game**.
  - A determination remains valid unless the payment or fund-handling mechanics change.
  - Online money games cannot be registered as e-sports.
- Sources: [SCC Online: key highlights of the 2026 Rules](https://www.scconline.com/blog/post/2026/04/25/promotion-and-regulation-of-online-gaming-rules-2026-key-highlights/) · [Lexology: Rules notified](https://www.lexology.com/library/detail.aspx?g=822e9f46-659b-4c32-aa76-6045645a9351) · [PIB explainer (PDF)](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2026/apr/doc2026430859401.pdf) · [Wikipedia: the 2025 Act](https://en.wikipedia.org/wiki/Promotion_and_Regulation_of_Online_Gaming_Act,_2025)

## How the design responds
| Risk factor | PLAYZO design |
|---|---|
| Money in / stakes | No deposits. Fun Chips are free (daily top-up to 10,000) and **cannot be purchased**. ZO coins cannot be purchased |
| Expectation of winnings | Nothing of monetary value can be won. No prizes, gift cards, crypto or cash-equivalents |
| Transfer / redemption outside the game | Impossible by design: no transfer endpoints, no marketplace, no withdrawal code paths |
| Purchase → risk → value loop | Paid items (PLAYZO Plus, cosmetics) never grant chips and never change odds. Payments are disabled (dev-mock only) |
| Children | The Lounge is invisible (404) to guests, under-18s and unknown-age accounts; excluded from the sitemap and blocked in robots.txt; never recommended or advertised to minors |
| Age assurance | A self-declared DOB is insufficient. A provider interface exists, but only a **dev attestation** is implemented, and it is refused in production. A certified vendor must be selected after legal review |
| Fairness | Published RTP, HMAC RNG with commit/reveal, statistical tests, identical odds for all players |
| Responsible play | Daily time limit, 1/7/30-day cool-off, 30-minute reality checks, session net always visible, no near-miss engineering, no loss-chasing prompts |

## Age policy (product-owner decisions, enforced server-side)
| Age (from date of birth) | Access |
|---|---|
| Under 13 | No account (`PLAYZO_ALLOW_UNDER13=false`) until a verified parental-consent flow with real email delivery exists. Guest play of family games stays open (no personal data collected). |
| 13-17 | Family games, friends and rooms with teen/adult separation, quick match. |
| 18-20 | Family games. No Lounge: the entry point, pages, APIs and game data are invisible (404/403). |
| 21+ | Family games, plus eligibility for the PLAYZO Lounge once the gates below are satisfied. |

Date of birth is asked first in onboarding (step 1). The client only displays the result; the server repeats the calculation at registration and on every request.

## Gate mechanics (enforced server-side)
1. **Master switch:** `PLAYZO_LOUNGE_ENABLED` (server configuration, default **false**). While off, the Lounge is invisible to every ordinary account: no navigation link, 404 on every Lounge page and API, excluded from sitemap and listings.
2. **Environment entitlement:** registered account aged **21 or over** (product-owner decision, `PLAYZO_LOUNGE_MIN_AGE=21`; age recomputed from the stored date of birth on every request, birthdays and leap days exact) + age assurance from a **certified provider** while `PLAYZO_LOUNGE_REQUIRE_AGE_ASSURANCE=true` (default; renewed every 365 days) + Lounge terms consent + no active cool-off. A self-declared date of birth is shown as "self-declared" everywhere, never as verified.
3. **Two-key per-game legal gate:** a game is public only when `PLAYZO_LEGAL_APPROVALS` lists it with a reference **and** the latest India-law record in Admin → Legal is `approved` with the same reference. Otherwise the server answers **451**. The admin UI can record reviews but cannot change server configuration.
4. **Internal QA preview:** `PLAYZO_ADULT_DEV_PREVIEW=true` works only on a non-production server and only for accounts with the `admin` or `tester` role. QA accounts may use the clearly labelled dev attestation; every screen shows "DEV PREVIEW · NOT LEGALLY APPROVED". The flag is ignored in production. Ordinary adults are refused the dev attestation (503), so there is no fake verification success.
5. **Audit:** role changes, attestation use and refusals, legal records, cool-offs and admin actions are written to the append-only audit log.

## Per-game legal review records
Admin → Legal keeps a history per game and scope (`india_law`, `state_law`, `google_play`, `app_store`) with status (pending, in_review, approved, rejected, blocked), document reference, reviewer and notes. An approval requires both a reference and a reviewer. **As of today no record exists for any game: all 25 are pending.**

| Lounge games | India law | State law | Google Play | App Store |
|---|---|---|---|---|
| All 25 (roulette x3, blackjack x2, baccarat, sic bo, hold'em, omaha, teen patti, andar bahar, dragon tiger, three card poker, video poker, slots x6, plinko, dice arena, hi-lo, mines, crash flight) | pending | pending | pending (do not submit) | pending (not prepared) |

Potentially sensitive mechanics to put in front of counsel explicitly: crash-style multiplier games (Crash Flight), Mines, slot machines and jackpot simulation, and any feature where chips could appear to carry value. If counsel considers any of them prohibited even as a free social simulation, record `blocked`; the code stays isolated in internal QA.

## Open gates (all must be resolved before any public Lounge launch)
| # | Gate | Owner | Status |
|---|---|---|---|
| G1 | Counsel opinion that each of the 25 Lounge simulations is an *online social game* (not an online money game) under the 2025 Act and 2026 Rules | Legal | **Open** |
| G2 | Decide whether to seek OGAI determination or registration for the Lounge or specific games | Legal | **Open** |
| G3 | State-level gaming and gambling laws review | Legal | **Open** |
| G4 | Production age-assurance vendor + DPIA (DPDP Act 2023, verifiable parental consent for children's data) | Legal + Eng | **Open** |
| G5 | Terms, Privacy Policy and Lounge terms final text (current text is an engineering draft) | Legal | **Open** |
| G6 | Advertising policy review (no gambling-style ads to minors; ASCI codes) | Legal + Marketing | **Open** |
| G7 | Payments: provider, GST, refund policy, and confirmation that memberships cannot interact with Lounge value | Legal + Finance | **Open** |
| G8 | Family-game registration need (likely not mandatory; confirm) | Legal | **Open** |

## Distribution readiness
| Channel | Readiness | Notes |
|---|---|---|
| Desktop and mobile web | Technically ready for the family environment after G4, G5, G8; Lounge blocked by G1-G3 | Responsive, PWA manifest present |
| PWA | Manifest present; no service worker yet (KI-12) | - |
| Google Play | **Do not submit the Lounge.** Google Play's gambling policy restricts simulated gambling and requires age-restricted apps to block minors with Play Console features. A family-only build would need the Families policy review. [Play policy](https://support.google.com/googleplay/android-developer/answer/9877032) | Separate family-only package recommended |
| Apple App Store | Simulated gambling requires a 17+ rating and other conditions; a family-only build is recommended; legal review required | Not prepared |
