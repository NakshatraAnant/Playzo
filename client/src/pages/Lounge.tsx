import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { Chip, Empty, ErrorBox, GameTile, Modal, useTitle } from '../components/ui';
import { Icon } from '../components/Icon';
import { GameCover } from '../art/covers';
import { GameHost } from '../games/runtime';
import { BY_ID } from '@shared/catalogue';

const REASON: Record<string, string> = {
  guest_account: 'Create a registered account',
  not_adult: 'The Lounge is for players aged 21 and over',
  under_lounge_min_age: 'The Lounge is for players aged 21 and over',
  age_verification_not_production_grade: 'A production age-assurance check is required',
  age_not_verified: 'Complete age assurance',
  lounge_terms_not_accepted: 'Accept the Lounge terms',
  cool_off_active: 'Your self-selected cool-off is active',
};

function NotAvailable() {
  return <Empty icon="lock" title="Page not available">This area isn't available for your account.</Empty>;
}

function GateFlow() {
  const { me, refresh, toast, providers } = useStore();
  const [busy, setBusy] = useState(false);
  const reasons = me!.lounge.reasons;
  const verify = async () => {
    setBusy(true);
    try { await api.post('/api/auth/age-assurance', { method: 'dev-attestation' }); await refresh(); } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const terms = async () => { setBusy(true); try { await api.post('/api/auth/lounge-terms'); await refresh(); } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)' }}>PLAYZO Lounge <span className="chip gold">21+</span></h1>
      <p className="muted">Social casino-style simulations for verified adults. Fun Chips are free, can't be bought, and have no cash value. Nothing can be withdrawn, transferred or redeemed.</p>
      <div className="panel col">
        {reasons.map((r) => <div key={r} className="row"><Icon name="lock" /><span>{REASON[r] ?? r}</span></div>)}
      </div>
      {reasons.includes('cool_off_active') ? <p className="muted">Cool-off ends {new Date(me!.lounge.cooloffUntil!).toLocaleString()}.</p> : (
        <>
          {reasons.includes('age_not_verified') && (
            <div className="panel">
              <div className="panel-title"><Icon name="shield" /><h3>Step 1: Age assurance</h3></div>
              <p className="muted" style={{ fontSize: 14 }}>A self-declared date of birth is not enough for the Lounge. Production deployments must plug in a certified age-assurance provider after legal review. None is configured on this local build.</p>
              {providers.devMode ? (
                <>
                  <div className="lounge-banner dev" style={{ margin: '12px 0' }}><Icon name="info" />DEVELOPMENT ONLY: "dev-attestation" is a placeholder that does not verify anyone's age. It is refused in production.</div>
                  <button className="btn btn-gold" disabled={busy} onClick={verify}>Use local dev attestation</button>
                </>
              ) : <p className="dim">Age assurance is not available on this server yet.</p>}
            </div>
          )}
          {!reasons.includes('age_not_verified') && reasons.includes('lounge_terms_not_accepted') && (
            <div className="panel">
              <div className="panel-title"><Icon name="info" /><h3>Step 2: Lounge terms</h3></div>
              <ul className="muted" style={{ fontSize: 14, paddingLeft: 18 }}>
                <li>Entertainment simulations only. No real-money betting, deposits, prizes or withdrawals.</li>
                <li>Fun Chips are granted free (top-up to 10,000 daily). They cannot be purchased, sold, transferred or redeemed.</li>
                <li>Every outcome uses a server-side cryptographic RNG and published mathematics, the same for every player.</li>
                <li>Set time limits or a cool-off in Settings at any time. Play is never required.</li>
              </ul>
              <button className="btn btn-gold" disabled={busy} onClick={terms}>I'm 21+ and I accept</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Lounge() {
  useTitle('Lounge');
  const { me } = useStore();
  const { data, error, reload } = useAsync(() => (me?.lounge?.visible ? api.get('/api/lounge/status') : Promise.resolve(null)), [me?.id, me?.lounge.entitled]);
  const games = useAsync(() => (me?.lounge.entitled ? api.get('/api/games?env=lounge') : Promise.resolve({ games: [] })), [me?.lounge.entitled]);
  if (!me || me.ageBand !== 'adult' || !me.lounge.visible) return <NotAvailable />;
  if (!me.lounge.entitled) return <GateFlow />;
  if (error) return <ErrorBox message={error} retry={reload} />;
  const cats = ['Table & Wheel', 'Card & Social', 'Slots', 'Instant'];
  const anyPlayable = Object.values(data?.gates ?? {}).some((g: any) => g.status !== 'pending_legal_review');
  return (
    <div className="stack-lg lounge">
      <section className="hero" style={{ background: 'radial-gradient(120% 120% at 100% 0%, rgba(216,180,90,.35), transparent 50%), linear-gradient(160deg, #1a1206, #07040f)', borderColor: 'rgba(216,180,90,.35)', minHeight: 220 }}>
        <Chip tone="gold" icon="crown">PLAYZO Lounge · 21+</Chip>
        <div className="tagline" style={{ fontSize: 'clamp(1.6rem, 1rem + 3vw, 2.8rem)' }}>Velvet nights. <span style={{ background: 'var(--grad-lounge)', WebkitBackgroundClip: 'text', color: 'transparent' }}>Zero stakes.</span></div>
        <div className="row wrap"><span className="chip gold mono">{(data?.chips ?? 0).toLocaleString()} Fun Chips</span><span className="chip">Today {data?.minutesToday ?? 0} min{data?.dailyLimitMin ? ` / ${data.dailyLimitMin} limit` : ''}</span><Link className="chip" to="/settings">Play controls</Link><Link className="chip" to="/legal/fair-play">Fairness & maths</Link></div>
      </section>
      {!anyPlayable && (
        <div className="lounge-banner"><Icon name="lock" />All 25 Lounge simulations are built and tested but remain disabled pending legal review (Promotion and Regulation of Online Gaming Act, 2025 and 2026 Rules). See LEGAL_AND_COMPLIANCE_GATES.md.</div>
      )}
      {Object.values(data?.gates ?? {}).some((g: any) => g.status === 'dev-preview') && <div className="lounge-banner dev"><Icon name="info" />DEV PREVIEW: enabled locally for internal QA only. NOT LEGALLY APPROVED.</div>}
      {cats.map((c) => (
        <section key={c}>
          <h2 style={{ fontSize: 'var(--fs-xl)', marginBottom: 12 }}>{c}</h2>
          <div className="grid-games">{(games.data?.games ?? []).filter((g: any) => g.category === c).map((g: any) => <GameTile key={g.id} g={g} />)}</div>
        </section>
      ))}
      <section className="panel">
        <div className="panel-title"><Icon name="coins" /><h3>Fun Chips ledger</h3></div>
        {data?.ledger?.length ? data.ledger.map((l: any) => <div key={l.id} className="row mono" style={{ fontSize: 13, gap: 8 }}><span style={{ flex: 1 }} className="muted">{l.type} · {l.source}</span><span style={{ color: l.amount > 0 ? 'var(--ok)' : 'var(--bad)' }}>{l.amount > 0 ? '+' : ''}{l.amount}</span><span className="dim">{l.balance_after}</span></div>) : <p className="dim">No transactions yet.</p>}
      </section>
    </div>
  );
}

export function LoungeGame() {
  const { id = '' } = useParams();
  const { me } = useStore();
  const meta = BY_ID[id];
  const { data, error } = useAsync(() => (me?.lounge.entitled ? api.get(`/api/games/${id}`) : Promise.reject(new Error('Page not available'))), [id, me?.lounge.entitled]);
  useTitle(meta?.title ?? 'Lounge');
  if (!me?.lounge.entitled || error || !meta || meta.env !== 'lounge') return <NotAvailable />;
  if (!data) return <div className="spinner" />;
  const g = data.game, m = data.math;
  const locked = g.gate === 'pending_legal_review';
  return (
    <div className="stack-lg lounge">
      <section className="panel" style={{ padding: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div style={{ minHeight: 280, position: 'relative' }}><GameCover id={g.id} className="cover" /></div>
        <div className="col" style={{ padding: 24 }}>
          <div className="row wrap" style={{ gap: 6 }}><Chip tone="gold">21+</Chip><Chip>{g.category}</Chip><Chip tone={locked ? 'warn' : g.gate === 'dev-preview' ? 'bad' : 'ok'}>{locked ? 'Pending legal review' : g.gate === 'dev-preview' ? 'Dev preview' : 'Approved'}</Chip></div>
          <h1 style={{ fontSize: 'var(--fs-2xl)' }}>{g.title}</h1>
          <p style={{ color: g.theme.accent, fontWeight: 700 }}>{g.tagline}</p>
          <p className="muted">{g.description}</p>
          <p style={{ fontSize: 14 }}><b>Mathematics:</b> <span className="muted">{g.math}</span></p>
          {locked ? <button className="btn btn-lg" disabled><Icon name="lock" />Disabled until legal approval</button> : <Link to={`/lounge/play/${g.id}`} className="btn btn-gold btn-lg"><Icon name="play" />Play with Fun Chips</Link>}
        </div>
      </section>
      <section className="panel"><div className="panel-title"><h3>Rules</h3></div><ul className="muted" style={{ paddingLeft: 20 }}>{g.rules.map((r: string) => <li key={r}>{r}</li>)}</ul></section>
      {m && <section className="panel"><div className="panel-title"><Icon name="chip" /><h3>Published mathematics</h3></div><MathView m={m} /></section>}
    </div>
  );
}

export function MathView({ m }: { m: any }) {
  if (m.bets) return <div className="table-wrap"><table className="data"><thead><tr><th>Bet</th>{m.bets[0].pays && <th>Pays</th>}<th>RTP</th></tr></thead><tbody>{m.bets.map((b: any) => <tr key={b.bet}><td>{b.bet}</td>{b.pays && <td>{b.pays}</td>}<td className="mono">{b.rtp ?? '-'}%</td></tr>)}</tbody></table>{m.totals && <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>Totals: {m.totals.map((t: any) => `${t.total} pays ${t.pays} (${t.rtp}%)`).join(' · ')}</p>}{m.note && <p className="dim" style={{ fontSize: 13 }}>{m.note}</p>}{m.source && <p className="dim" style={{ fontSize: 13 }}>{m.source}</p>}{typeof m.rtp === 'string' && <p className="dim" style={{ fontSize: 13 }}>{m.rtp}</p>}</div>;
  if (m.kind === 'slot') return <p>Exact theoretical RTP <b>{m.rtp}%</b> ({m.layout}, {m.mode === 'ways' ? '243 ways' : `${m.lines} lines`}). Full reel strips and paytable are in the in-game "Paytable & odds" panel.</p>;
  if (m.kind === 'plinko') return <div className="table-wrap"><table className="data"><thead><tr><th>Rows</th><th>Risk</th><th>RTP</th><th>Multipliers</th></tr></thead><tbody>{m.tables.map((t: any) => <tr key={`${t.rows}${t.risk}`}><td>{t.rows}</td><td>{t.risk}</td><td className="mono">{t.rtp}%</td><td className="mono" style={{ whiteSpace: 'normal', fontSize: 11 }}>{t.multipliers.join(' · ')}</td></tr>)}</tbody></table></div>;
  return <div className="muted" style={{ fontSize: 14 }}>{m.rule && <p>{m.rule}</p>}{m.rules && <p>{m.rules}</p>}{m.rtp !== undefined && m.rtp !== null && <p>RTP: <b>{typeof m.rtp === 'number' ? `${m.rtp}%` : m.rtp}</b></p>}{m.note && <p>{m.note}</p>}{m.paytable && <p>Paytable: {m.paytable.map((p: any) => `${p.name} ${p.pay}`).join(' · ')}</p>}</div>;
}

export function LoungePlay() {
  const { id = '' } = useParams();
  const { me } = useStore();
  const [reality, setReality] = useState(false);
  const meta = BY_ID[id];
  useTitle(meta ? `${meta.title} (Lounge)` : 'Lounge');
  useEffect(() => { const t = setInterval(() => setReality(true), 30 * 60_000); return () => clearInterval(t); }, []);
  const status = useAsync(() => (me?.lounge.entitled ? api.get('/api/lounge/status') : Promise.resolve(null)), [me?.lounge.entitled]);
  if (!me?.lounge.entitled || !meta || meta.env !== 'lounge') return <NotAvailable />;
  const gate = status.data?.gates?.[id]?.status;
  return (
    <div className="lounge">
      {gate === 'dev-preview' && <div className="lounge-banner dev" style={{ marginBottom: 8 }}><Icon name="info" />DEV PREVIEW · NOT LEGALLY APPROVED · Fun Chips only · no cash value</div>}
      {gate === 'pending_legal_review' ? <Empty icon="lock" title="Disabled pending legal review" /> : gate ? <GameHost gameId={id} difficulty="normal" /> : <div className="spinner" />}
      <Modal open={reality} onClose={() => setReality(false)} title="Reality check">
        <p>You've been in the Lounge for a while ({status.data?.minutesToday ?? 30}+ minutes today). Fun Chips have no value, so there's nothing to win back. A break is always a good move.</p>
        <div className="row" style={{ marginTop: 16 }}><Link className="btn btn-primary" to="/">Take a break</Link><button className="btn" onClick={() => setReality(false)}>Keep playing</button></div>
      </Modal>
    </div>
  );
}
