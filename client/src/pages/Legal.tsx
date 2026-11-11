import { useParams, Link } from 'react-router-dom';
import type { JSX } from 'react';
import { useTitle } from '../components/ui';

const DOCS: Record<string, { title: string; body: JSX.Element }> = {
  'fair-play': {
    title: 'Fair play & game mathematics',
    body: (
      <>
        <p>PLAYZO is built so that scores and outcomes can be trusted, and so the rules are the same for everyone.</p>
        <h3>Skill games (family)</h3>
        <ul>
          <li><b>Server-held games</b> (quizzes, word games, strategy vs the computer, Code Breaker, Memory Match) keep their state on our servers. Hidden answers never reach your device, and every move is validated.</li>
          <li><b>Real-time games</b> (Reflex Arena, Rhythm Rush, Obstacle Sprint, Tower Tactics and others) run on your device from a shared seed. When you finish, the server re-simulates your exact inputs with the same deterministic engine. A score only counts if the replay reproduces it and the timing is humanly possible.</li>
          <li>Daily puzzles, challenges and races give every player the same seed.</li>
        </ul>
        <h3>Lounge simulations (18+)</h3>
        <ul>
          <li>Outcomes use a server-side HMAC-SHA256 cryptographic generator. Each session publishes a SHA-256 commitment of its secret seed when it starts and reveals the seed when it ends.</li>
          <li>Probabilities never depend on who you are, your balance, your history, membership or spending. There are no hidden adjustments, streak manipulation or fake near-misses.</li>
          <li>Theoretical return (RTP) is published per game and computed from the live engine code. Slots publish full reel strips. Automated statistical tests check observed results against theory.</li>
          <li>Fun Chips are free, can't be purchased, and have no monetary value. Nothing can be withdrawn, transferred or redeemed.</li>
        </ul>
      </>
    ),
  },
  privacy: {
    title: 'Privacy policy (draft for legal review)',
    body: (
      <>
        <p><b>Status:</b> engineering draft. It has not been reviewed by counsel and must be reviewed before any public launch.</p>
        <ul>
          <li><b>What we collect:</b> email, username, password hash, date of birth (to apply age-appropriate rules), gameplay records, first-party usage events and error logs. Guests provide no personal data.</li>
          <li><b>Children:</b> under-13 accounts need a parent or guardian email. Friends and multiplayer stay disabled until a parent approves. Profiles default to friends-only, and chat is emotes-only for everyone.</li>
          <li><b>No behavioural advertising</b>, no data sales and no device fingerprinting. Ad placements are contextual and capped.</li>
          <li><b>Your rights:</b> you can see your data in your profile, change privacy settings, and permanently delete your account from Settings.</li>
          <li><b>Security:</b> passwords use scrypt hashing; sessions use HTTP-only cookies; secrets are never logged.</li>
        </ul>
      </>
    ),
  },
  terms: {
    title: 'Terms of use (draft for legal review)',
    body: (
      <>
        <p><b>Status:</b> engineering draft pending legal review. This local build is not a public service.</p>
        <ul>
          <li>PLAYZO is an entertainment platform. There is no real-money gaming of any kind: no deposits, stakes, cash prizes or withdrawals.</li>
          <li>ZO coins and Fun Chips are virtual items with no monetary value. They cannot be bought (Fun Chips), sold, transferred, exchanged or redeemed.</li>
          <li>Lounge simulations are limited to verified adults (18+) and stay disabled until legal approval is recorded for each game.</li>
          <li>Cheating, exploiting bugs, harassment and impersonation lead to suspension. Report concerns from any profile.</li>
          <li>Membership (PLAYZO Plus) is cosmetic and ad-free only, and never affects outcomes. Real payments are not enabled in this build.</li>
        </ul>
      </>
    ),
  },
};

export default function Legal() {
  const { doc = 'fair-play' } = useParams();
  const d = DOCS[doc] ?? DOCS['fair-play'];
  useTitle(d.title);
  return (
    <article className="panel" style={{ maxWidth: 820, lineHeight: 1.7 }}>
      <div className="row wrap" style={{ marginBottom: 12, gap: 8 }}>{Object.entries(DOCS).map(([k, v]) => <Link key={k} to={`/legal/${k}`} className={`chip ${k === doc ? 'on' : ''}`}>{v.title.split(' (')[0]}</Link>)}</div>
      <h1 style={{ fontSize: 'var(--fs-2xl)', marginBottom: 16 }}>{d.title}</h1>
      <div className="muted legal-body">{d.body}</div>
      <style>{`.legal-body h3{color:var(--text);margin:20px 0 8px}.legal-body ul{padding-left:20px}`}</style>
    </article>
  );
}
