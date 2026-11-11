import { useState } from 'react';
import { useCtl } from '../runtime';
import { Card, Net, Outcome, StakeInput, useStake, labelOf } from './common';
import { sfx } from '../../lib/sound';

export default function AndarBahar() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [stake, setStake] = useStake('ab');
  const [side, setSide] = useState<'andar' | 'bahar'>('andar');
  const [shown, setShown] = useState(999);
  const L = v.last;
  const deal = async () => {
    try {
      const r = await ctl.act({ type: 'deal', side, amount: stake });
      const total = r.view.last.andar.length + r.view.last.bahar.length;
      setShown(0);
      for (let i = 1; i <= total; i++) setTimeout(() => { setShown(i); sfx.deal(); if (i === total) (r.view.last.winner === side ? sfx.win : sfx.lose)(); }, i * Math.max(60, 380 - total * 10));
    } catch { /* toast */ }
  };
  // Cards are dealt alternately starting with Andar: index k -> andar[k/2] or bahar[(k-1)/2].
  const vis = (arr: number[], first: boolean) => arr.filter((_, i) => (first ? i * 2 : i * 2 + 1) < shown);
  const done = L && shown >= L.andar.length + L.bahar.length;
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#4a2206', width: '100%', maxWidth: 820, display: 'grid', gap: 14 }}>
        <div className="col" style={{ alignItems: 'center' }}><span className="dim" style={{ fontSize: 12, letterSpacing: '0.15em' }}>JOKER</span>{L ? <Card c={L.joker} /> : <div className="playing-card back" />}</div>
        {(['andar', 'bahar'] as const).map((sd) => (
          <div key={sd} style={{ padding: 10, borderRadius: 14, background: done && L.winner === sd ? 'rgba(255,204,77,.18)' : 'rgba(0,0,0,.2)', border: side === sd ? '2px solid #ffcc4d' : '1px solid rgba(255,204,77,.25)' }}>
            <b style={{ fontFamily: 'var(--font-display)', textTransform: 'uppercase', fontSize: 14 }}>{sd} <span className="dim" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>pays {sd === 'andar' ? '0.9:1' : '1:1'}</span></b>
            <div className="row wrap" style={{ gap: 4, marginTop: 8, minHeight: 64 }}>{L && vis(L[sd], sd === 'andar').map((c: number, i: number) => <Card key={i} c={c} small />)}</div>
          </div>
        ))}
      </div>
      {done && <Outcome text={`${labelOf(L.joker)} matched on ${L.winner.toUpperCase()} after ${L.andar.length + L.bahar.length} cards`} good={L.winner === side} />}
      <div className="seg" role="radiogroup" aria-label="Choose side">{(['andar', 'bahar'] as const).map((s) => <button key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)} role="radio" aria-checked={side === s} style={{ textTransform: 'capitalize' }}>{s}</button>)}</div>
      <div className="row wrap" style={{ justifyContent: 'center' }}><StakeInput value={stake} onChange={setStake} /><button className="btn btn-gold btn-lg" onClick={deal} disabled={ctl.busy || (L && !done)}>Deal</button></div>
      <Net net={v.net} />
    </>
  );
}
