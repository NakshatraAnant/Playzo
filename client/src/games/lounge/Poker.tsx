import { useEffect, useRef, useState } from 'react';
import { useCtl } from '../runtime';
import { Card, Net, StakeInput, useStake } from './common';
import { Avatar } from '../../components/ui';
import { sfx } from '../../lib/sound';

export default function Poker() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [buyIn, setBuyIn] = useStake(`${v.variant}-buyin`, 1000);
  const [raiseTo, setRaiseTo] = useState(0);
  const act = (a: any) => { sfx.deal(); ctl.act(a).catch(() => undefined); };
  const o = v.options;
  useEffect(() => { if (o) setRaiseTo(o.minRaiseTo); }, [o?.minRaiseTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevSd = useRef(v.showdown);
  useEffect(() => { if (v.showdown && v.showdown !== prevSd.current) v.showdown.winners.some((w: any) => w.seat === 0) ? sfx.win() : sfx.flip(); prevSd.current = v.showdown; }, [v.showdown]);
  const me = v.seats[0];
  const best = new Set<number>(v.myBest?.cards ?? []);
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: v.variant === 'omaha' ? '#2a1450' : '#0b3a5a', width: '100%', maxWidth: 880, borderRadius: 200, padding: '28px 18px', display: 'grid', gap: 14 }}>
        <div className="row wrap" style={{ justifyContent: 'space-around', gap: 10 }}>
          {v.seats.slice(1).map((s: any, i: number) => (
            <div key={i} className="col" style={{ alignItems: 'center', gap: 4, opacity: s.folded ? 0.45 : 1, padding: 8, borderRadius: 16, outline: v.toAct === i + 1 && v.street !== 'idle' ? '2px solid #3fd2c7' : undefined }}>
              <div className="row" style={{ gap: 6 }}><Avatar id={`orb-${i + 3}`} size={28} name={s.name} /><b style={{ fontSize: 13 }}>{s.name}</b>{s.button && <span className="chip">D</span>}</div>
              <div className="row" style={{ gap: 4 }}>{s.hole.map((c: number, k: number) => <Card key={k} c={c} small />)}</div>
              <span className="mono dim" style={{ fontSize: 12 }}>{s.stack}{s.bet ? ` · bet ${s.bet}` : ''}{s.allIn ? ' · ALL-IN' : ''}{s.folded ? ' · folded' : ''}</span>
            </div>
          ))}
        </div>
        <div className="col" style={{ alignItems: 'center', gap: 8 }}>
          <span className="chip gold mono">Pot {v.pot}</span>
          <div className="cards-row">{v.board.map((c: number, i: number) => <Card key={`${i}-${c}`} c={c} i={i} />)}{Array.from({ length: 5 - v.board.length }, (_, i) => <div key={`e${i}`} className="playing-card" style={{ background: 'rgba(255,255,255,.06)', boxShadow: 'none', border: '1px dashed rgba(255,255,255,.2)' }} />)}</div>
          <span className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{v.street === 'idle' ? 'Between hands' : v.street === 'pre' ? 'Pre-flop' : v.street}</span>
        </div>
        <div className="col" style={{ alignItems: 'center', gap: 6 }}>
          <div className="row" style={{ gap: 6 }}>{me.hole.map((c: number, i: number) => <div key={i} style={{ outline: best.has(c) ? '3px solid #3fd2c7' : undefined, borderRadius: 10 }}><Card c={c} i={i} /></div>)}</div>
          <span className="mono" style={{ fontSize: 13 }}>You · {me.stack} chips{me.bet ? ` · bet ${me.bet}` : ''}{me.button ? ' · dealer' : ''}{v.myBest ? ` · ${v.myBest.name}` : ''}</span>
        </div>
      </div>
      {v.showdown && <div className="chip gold" style={{ fontSize: 14 }}>{v.showdown.winners.map((w: any) => `${v.seats[w.seat].name} wins ${w.amount} (${w.hand})`).join(' · ')}</div>}
      {!v.seated ? (
        <div className="row wrap" style={{ justifyContent: 'center' }}><span className="muted">Buy-in</span><StakeInput value={buyIn} onChange={setBuyIn} /><button className="btn btn-gold btn-lg" onClick={() => act({ type: 'sit', buyIn })}>Take a seat</button></div>
      ) : o ? (
        <div className="col" style={{ alignItems: 'center' }}>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn btn-danger" onClick={() => act({ type: 'act', move: 'fold' })}>Fold</button>
            {o.canCheck ? <button className="btn btn-lg" onClick={() => act({ type: 'act', move: 'check' })}>Check</button> : <button className="btn btn-lg" onClick={() => act({ type: 'act', move: 'call' })}>Call {Math.min(o.toCall, me.stack)}</button>}
            <button className="btn" onClick={() => act({ type: 'act', move: 'raise', to: o.halfPot })}>½ pot</button>
            <button className="btn" onClick={() => act({ type: 'act', move: 'raise', to: o.pot })}>Pot</button>
            {v.variant === 'holdem' && <button className="btn" onClick={() => act({ type: 'act', move: 'raise', to: o.maxRaiseTo })}>All-in</button>}
          </div>
          {o.maxRaiseTo > o.minRaiseTo && (
            <div className="row" style={{ width: '100%', maxWidth: 420 }}>
              <input type="range" min={o.minRaiseTo} max={o.maxRaiseTo} step={10} value={raiseTo} onChange={(e) => setRaiseTo(Number(e.target.value))} style={{ flex: 1 }} aria-label="Raise amount" />
              <button className="btn btn-gold" onClick={() => act({ type: 'act', move: 'raise', to: raiseTo })}>Raise to {raiseTo}</button>
            </div>
          )}
        </div>
      ) : (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button className="btn btn-gold btn-lg" onClick={() => act({ type: 'deal' })} disabled={v.street !== 'idle' || me.stack <= 0}>Deal next hand</button>
          {me.stack <= 0 && <button className="btn" onClick={() => act({ type: 'rebuy', amount: buyIn })}>Rebuy {buyIn}</button>}
          <button className="btn btn-ghost" onClick={() => act({ type: 'leave' })} disabled={v.street !== 'idle'}>Leave table (cash in chips)</button>
        </div>
      )}
      <div className="panel panel-tight" style={{ width: '100%', maxWidth: 560, fontSize: 13, maxHeight: 130, overflow: 'auto' }} aria-live="polite">{v.log.map((l: string, i: number) => <div key={i} className={i ? 'dim' : ''}>{l}</div>)}</div>
      <Net net={v.net} />
      <p className="dim" style={{ fontSize: 12, textAlign: 'center' }}>Ruby plays tight, Kabir loose, Zara aggressive. Bots estimate equity from their own cards only. No rake.</p>
    </>
  );
}
