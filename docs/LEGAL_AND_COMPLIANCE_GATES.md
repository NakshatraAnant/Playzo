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

## Gate mechanics (enforced server-side)
1. **Environment entitlement:** registered adult (DOB) + adult age assurance + Lounge terms consent + no active cool-off.
2. **Per-game legal gate:** `PLAYZO_LEGAL_APPROVALS="game-id:LEGAL-REF,..."` in server configuration only (the admin UI cannot open gates).
   - Without an entry the game returns **451**.
   - `PLAYZO_ADULT_DEV_PREVIEW=true` unlocks games **on localhost for internal QA only**, with a "NOT LEGALLY APPROVED" banner. It is ignored in production and is **off by default**.

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
