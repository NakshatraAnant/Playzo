import { useEffect, useRef } from 'react';
import { useCtl } from '../runtime';
import { Card, Net, StakeInput, useStake } from './common';
import { Avatar } from '../../components/ui';
import { sfx } from '../../lib/sound';

const RANKINGS = ['Trail (three of a kind)', 'Pure sequence', 'Sequence', 'Colour', 'Pair', 'High card'];

export default function TeenPatti() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [buyIn, setBuyIn] = useStake('tp-buyin', 1000);
  const act = (a: any) => { sfx.deal(); ctl.act(a).catch(() => undefined); };
  const prev = useRef(v.result);
  useEffect(() => { if (v.result && v.result !== prev.current) v.result.winner === 0 ? sfx.win() : sfx.flip(); prev.current = v.result; }, [v.result]);
  const me = v.seats[0];
  const o = v.options;
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#5a0d26', width: '100%', maxWidth: 820, borderRadius: 160, padding: '26px 18px', display: 'grid', gap: 16 }}>
        <div className="row wrap" style={{ justifyContent: 'space-around' }}>
          {v.seats.slice(1).map((s: any, i: number) => (
            <div key={i} className="col" style={{ alignItems: 'center', gap: 4, opacity: s.packed ? 0.4 : 1, padding: 8, borderRadius: 14, outline: v.toAct === i + 1 && v.phase === 'play' ? '2px solid #ffb02e' : undefined }}>
              <div className="row" style={{ gap: 6 }}><Avatar id={`orb-${i + 5}`} size={28} name={s.name} /><b style={{ fontSize: 13 }}>{s.name}</b></div>
              <div className="row" style={{ gap: 4 }}>{s.cards.map((c: number, k: number) => <Card key={k} c={c} small />)}</div>
              <span className="dim mono" style={{ fontSize: 12 }}>{s.stack} · {s.packed ? 'packed' : s.seen ? 'seen' : 'blind'}</span>
              {v.result?.hands?.[i + 1] && <span className="chip">{v.result.hands[i + 1]}</span>}
            </div>
          ))}
        </div>
        <div className="col" style={{ alignItems: 'center', gap: 6 }}>
          <span className="chip gold mono" style={{ fontSize: 15 }}>Pot {v.pot}</span>
          <span className="dim" style={{ fontSize: 12 }}>Current stake {v.stake} (blind) · {v.stake * 2} (seen) · pot limit {v.potLimit}</span>
        </div>
        <div className="col" style={{ alignItems: 'center', gap: 6 }}>
          <div className="row" style={{ gap: 6 }}>{me.cards.map((c: number, i: number) => <Card key={`${i}-${c}`} c={c} i={i} />)}</div>
          <span className="mono" style={{ fontSize: 13 }}>You · {me.stack} chips · {me.packed ? 'packed' : me.seen ? 'seen' : 'playing blind'}{v.myHand ? ` · ${v.myHand}` : ''}</span>
        </div>
      </div>
      {v.result && <div className="chip gold" style={{ fontSize: 14 }}>{v.seats[v.result.winner].name} wins ({v.result.reason})</div>}
      {!v.seated ? (
        <div className="row wrap" style={{ justifyContent: 'center' }}><span className="muted">Buy-in</span><StakeInput value={buyIn} onChange={setBuyIn} /><button className="btn btn-gold btn-lg" onClick={() => act({ type: 'sit', buyIn })}>Join the Mehfil</button></div>
      ) : v.phase === 'play' ? (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {!me.seen && !me.packed && <button className="btn" onClick={() => act({ type: 'see' })}>See cards</button>}
          {o && <>
            <button className="btn btn-lg" disabled={!o.canAfford} onClick={() => act({ type: 'chaal' })}>{me.seen ? 'Chaal' : 'Blind'} {o.chaal}</button>
            <button className="btn" disabled={me.stack < o.raise} onClick={() => act({ type: 'chaal', raise: true })}>Raise {o.raise}</button>
            {o.canShow && <button className="btn btn-gold" onClick={() => act({ type: 'show' })}>Show</button>}
            <button className="btn btn-danger" onClick={() => act({ type: 'pack' })}>Pack</button>
          </>}
          {!o && !me.packed && <span className="chip pulse">Waiting for others…</span>}
        </div>
      ) : (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button className="btn btn-gold btn-lg" onClick={() => act({ type: 'deal' })} disabled={me.stack < 10}>Deal (boot 10)</button>
          {me.stack < 10 && <button className="btn" onClick={() => act({ type: 'rebuy', amount: buyIn })}>Rebuy {buyIn}</button>}
          <button className="btn btn-ghost" onClick={() => act({ type: 'leave' })}>Leave table (cash in chips)</button>
        </div>
      )}
      <div className="panel panel-tight" style={{ width: '100%', maxWidth: 560, fontSize: 13, maxHeight: 120, overflow: 'auto' }}>{v.log.map((l: string, i: number) => <div key={i} className={i ? 'dim' : ''}>{l}</div>)}</div>
      <details className="panel panel-tight" style={{ maxWidth: 560, width: '100%' }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Hand rankings</summary><ol style={{ margin: '8px 0 0', paddingLeft: 20 }} className="muted">{RANKINGS.map((r) => <li key={r}>{r}</li>)}</ol><p className="dim" style={{ fontSize: 12 }}>A-K-Q is the top sequence, then A-2-3. On a tied show, the player who asked for the show loses.</p></details>
      <Net net={v.net} />
    </>
  );
}
