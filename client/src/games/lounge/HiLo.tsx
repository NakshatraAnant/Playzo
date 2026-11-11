import { useCtl } from '../runtime';
import { Net, Outcome, StakeInput, useStake } from './common';
import { sfx } from '../../lib/sound';
import { fmtMult, pct } from './Instant';
import { motion } from 'framer-motion';

const RL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const SUIT = ['♠', '♥', '♦', '♣'];

function BigCard({ r, s }: { r: number; s: number }) {
  const red = s === 1 || s === 2;
  return (
    <motion.div key={`${r}-${s}-${Math.random()}`} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} className="playing-card" style={{ width: 120, height: 170, color: red ? '#d1123f' : '#1a1030' }}>
      <span style={{ fontSize: 24, fontWeight: 900 }}>{RL[r] ?? r}{SUIT[s]}</span>
      <span className="c-big" style={{ fontSize: 64 }}>{SUIT[s]}</span>
    </motion.div>
  );
}

export default function HiLo() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [stake, setStake] = useStake('hilo', 100);
  const act = async (a: any) => {
    try {
      const r = await ctl.act(a);
      if (a.type === 'call') r.view.last?.win ? sfx.good() : sfx.lose();
      if (a.type === 'bank') sfx.win();
      if (a.type === 'skip') sfx.flip();
    } catch { /* toast */ }
  };
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#0a2a3a', width: '100%', maxWidth: 560, display: 'grid', gap: 14, justifyItems: 'center' }}>
        <BigCard r={v.card.r} s={v.card.s} />
        <div className="row" style={{ gap: 10 }}>
          <span className="chip gold mono" style={{ fontSize: 16 }}>{fmtMult(v.mult)}</span>
          {v.active && <span className="chip mono">Bank value {Math.floor(v.stake * v.mult).toLocaleString()}</span>}
        </div>
      </div>
      {v.last && <Outcome text={`${v.last.call.toUpperCase()} → ${RL[v.last.next.r] ?? v.last.next.r}${SUIT[v.last.next.s]} · ${v.last.win ? 'correct' : 'missed'}`} good={v.last.win} />}
      {v.banked !== null && <Outcome text={`Banked ${v.banked.toLocaleString()}`} good />}
      {v.active ? (
        <div className="col" style={{ alignItems: 'center' }}>
          <div className="answer-grid">
            <button className="answer" disabled={!v.odds.higher || ctl.busy} onClick={() => act({ type: 'call', dir: 'higher' })}>Higher ▲<div className="dim" style={{ fontSize: 12 }}>{pct(v.odds.higher)} · next {v.nextMult.higher ? fmtMult(v.nextMult.higher) : '-'}</div></button>
            <button className="answer" disabled={!v.odds.lower || ctl.busy} onClick={() => act({ type: 'call', dir: 'lower' })}>Lower ▼<div className="dim" style={{ fontSize: 12 }}>{pct(v.odds.lower)} · next {v.nextMult.lower ? fmtMult(v.nextMult.lower) : '-'}</div></button>
          </div>
          <div className="row"><button className="btn" onClick={() => act({ type: 'skip' })} disabled={v.skipsLeft <= 0}>Skip card ({v.skipsLeft})</button><button className="btn btn-gold btn-lg" onClick={() => act({ type: 'bank' })} disabled={!v.steps}>Bank</button></div>
        </div>
      ) : (
        <div className="row wrap" style={{ justifyContent: 'center' }}><StakeInput value={stake} onChange={setStake} /><button className="btn btn-gold btn-lg" onClick={() => act({ type: 'start', amount: stake })} disabled={ctl.busy}>Start round</button></div>
      )}
      <Net net={v.net} />
      <p className="dim" style={{ fontSize: 12, textAlign: 'center', maxWidth: 520 }}>Ranks A(1)–K(13) are drawn with replacement. A tie loses the call. Every multiplier is 0.98 ÷ probability: 98% return at every step.</p>
    </>
  );
}
