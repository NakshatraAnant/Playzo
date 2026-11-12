import { useEffect, useState } from 'react';
import { useCtl } from '../runtime';
import { Card, Net } from './common';
import { sfx } from '../../lib/sound';

const TABLE = [['Royal Flush', 250, 800], ['Straight Flush', 50], ['Four of a Kind', 25], ['Full House', 9], ['Flush', 6], ['Straight', 4], ['Three of a Kind', 3], ['Two Pair', 2], ['Jacks or Better', 1]] as const;

export default function VideoPoker() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [coins, setCoins] = useState(5);
  const [hold, setHold] = useState([false, false, false, false, false]);
  useEffect(() => { if (v.phase === 'hold') setHold([false, false, false, false, false]); }, [v.phase, v.hand.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const deal = () => { sfx.deal(); ctl.act({ type: 'deal', coins }).catch(() => undefined); };
  const draw = async () => { sfx.deal(); try { const r = await ctl.act({ type: 'draw', hold }); r.view.result.ret > r.view.coins * 10 ? sfx.win() : r.view.result.ret ? sfx.neutral() : sfx.lose(); } catch { /* toast */ } };
  const name = v.phase === 'done' ? v.result?.name : v.current;
  return (
    <>
      <div style={{ width: '100%', maxWidth: 720, borderRadius: 28, padding: 18, background: 'linear-gradient(180deg, #14146a, #05051a)', border: '6px solid #ffe44d', boxShadow: '0 0 40px rgba(255,228,77,.25), inset 0 0 40px rgba(0,0,0,.6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr repeat(5, 1fr)', fontFamily: 'var(--font-display)', fontSize: 'clamp(9px, 2.2vw, 13px)', color: '#ffe44d', gap: 2 }} aria-label="Paytable">
          {TABLE.map(([n, p, royal]) => (
            <div key={n} style={{ display: 'contents' }}>
              <span style={{ color: name === n ? '#fff' : undefined, background: name === n ? 'rgba(255,228,77,.25)' : undefined }}>{n}</span>
              {[1, 2, 3, 4, 5].map((c) => <span key={c} className="mono" style={{ textAlign: 'right', opacity: c === coins ? 1 : 0.5, background: c === coins ? 'rgba(255,0,60,.35)' : undefined }}>{royal && c === 5 ? royal * 5 : p * c}</span>)}
            </div>
          ))}
        </div>
        <div className="cards-row" style={{ marginTop: 18, minHeight: 120 }}>
          {v.hand.length ? v.hand.map((c: number, i: number) => (
            <div key={`${i}-${c}`} className="col" style={{ alignItems: 'center', gap: 4 }}>
              <Card c={c} i={i} held={hold[i]} onClick={v.phase === 'hold' ? () => { setHold(hold.map((h, k) => (k === i ? !h : h))); sfx.tap(); } : undefined} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: '#ffe44d', visibility: hold[i] && v.phase === 'hold' ? 'visible' : 'hidden' }}>HELD</span>
            </div>
          )) : <p style={{ color: '#ffe44d', fontFamily: 'var(--font-display)' }}>PRESS DEAL</p>}
        </div>
        <p className="mono" style={{ textAlign: 'center', color: '#fff', marginTop: 6, minHeight: 22 }}>{v.phase === 'done' ? (v.result.ret ? `${v.result.name} · WIN ${v.result.ret}` : 'No win') : v.current ? `Dealt: ${v.current}` : ''}</p>
      </div>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <div className="seg" role="radiogroup" aria-label="Coins">{[1, 2, 3, 4, 5].map((c) => <button key={c} className={coins === c ? 'on' : ''} disabled={v.phase === 'hold'} onClick={() => setCoins(c)} role="radio" aria-checked={coins === c}>{c}</button>)}</div>
        <span className="chip mono">Bet {coins * v.unit}</span>
        {v.phase === 'hold' ? <button className="btn btn-gold btn-lg" onClick={draw} disabled={ctl.busy}>Draw</button> : <button className="btn btn-gold btn-lg" onClick={deal} disabled={ctl.busy}>Deal</button>}
      </div>
      <Net net={v.net} />
      <p className="dim" style={{ fontSize: 12 }}>9/6 Jacks or Better · 99.54% theoretical return with optimal holds at 5 coins.</p>
    </>
  );
}
