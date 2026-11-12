import { useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { useCtl } from '../runtime';
import { ChipPicker, Net, Outcome } from './common';
import { sfx } from '../../lib/sound';
import { Icon } from '../../components/Icon';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// Physical wheel orders (single-zero and double-zero).
const EU_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const US_ORDER = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
type Bet = { kind: string; n?: number; a?: number; b?: number; amount: number };
const key = (b: Bet) => `${b.kind}:${b.n ?? ''}:${b.a ?? ''}:${b.b ?? ''}`;
const colourOf = (p: number) => (p === 0 || p === 37 ? '#0d8a4f' : RED.has(p) ? '#c4122f' : '#151515');
const label = (p: number) => (p === 37 ? '00' : String(p));

export default function Roulette() {
  const ctl = useCtl();
  const v = ctl.view as { variant: 'eu' | 'us' | 'fr'; last: { pocket: number; label: string; bets: (Bet & { won: number })[] } | null; history: { label: string; pocket: number }[]; net: number };
  const order = v.variant === 'us' ? US_ORDER : EU_ORDER;
  const [chip, setChip] = useState(50);
  const [bets, setBets] = useState<Bet[]>([]);
  const [lastBets, setLastBets] = useState<Bet[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [outcome, setOutcome] = useState<{ t: string; good: boolean | null } | null>(null);
  const wheel = useAnimationControls();
  const [angle, setAngle] = useState(0);
  const total = bets.reduce((t, b) => t + b.amount, 0);
  const add = (b: Omit<Bet, 'amount'>) => {
    if (spinning) return;
    sfx.deal();
    setBets((cur) => {
      const k = key({ ...b, amount: 0 });
      const ex = cur.find((x) => key(x) === k);
      if (ex) return cur.map((x) => (x === ex ? { ...x, amount: Math.min(5000, x.amount + chip) } : x));
      return [...cur, { ...b, amount: chip }];
    });
  };
  const on = (b: Omit<Bet, 'amount'>) => bets.find((x) => key(x) === key({ ...b, amount: 0 }))?.amount;
  const spin = async (use = bets) => {
    if (!use.length || spinning) return;
    setSpinning(true); setOutcome(null); sfx.spin();
    try {
      const r = await ctl.act({ type: 'spin', bets: use });
      const pocket = r.view.last.pocket as number;
      const idx = order.indexOf(pocket);
      const seg = 360 / order.length;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const target = angle - (angle % 360) - 360 * (reduced ? 0 : 6) - idx * seg;
      await wheel.start({ rotate: target }, { duration: reduced ? 0 : 4.2, ease: [0.12, 0.65, 0.2, 1] });
      setAngle(target);
      const won = r.view.last.bets.reduce((t: number, b: any) => t + b.won, 0);
      const staked = use.reduce((t, b) => t + b.amount, 0);
      setOutcome({ t: `${label(pocket)} ${pocket === 0 || pocket === 37 ? 'green' : RED.has(pocket) ? 'red' : 'black'} · returned ${won.toLocaleString()} of ${staked.toLocaleString()}`, good: won > staked ? true : won === 0 ? false : null });
      won > staked ? sfx.win() : won ? sfx.neutral() : sfx.lose();
      setLastBets(use);
      setBets([]);
    } catch { /* toast */ } finally { setSpinning(false); }
  };
  const nums = Array.from({ length: 36 }, (_, i) => i + 1);
  const R = 46;
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: v.variant === 'fr' ? '#123a5a' : v.variant === 'us' ? '#3a0a18' : '#0b3a2a', width: '100%', maxWidth: 820, display: 'grid', gap: 16 }}>
        <div style={{ position: 'relative', width: 'min(76vw, 300px)', aspectRatio: '1', margin: '0 auto' }}>
          <motion.svg viewBox="-50 -50 100 100" animate={wheel} style={{ width: '100%', rotate: angle }} aria-hidden>
            <circle r={49} fill="#5a3a12" stroke="#d8b45a" strokeWidth={1.2} />
            {order.map((p, i) => {
              const a0 = (i / order.length) * Math.PI * 2 - Math.PI / order.length, a1 = a0 + (Math.PI * 2) / order.length;
              return (
                <g key={p}>
                  <path d={`M0 0 L${R * Math.sin(a0)} ${-R * Math.cos(a0)} A${R} ${R} 0 0 1 ${R * Math.sin(a1)} ${-R * Math.cos(a1)} Z`} fill={colourOf(p)} stroke="#d8b45a" strokeWidth={0.25} />
                  <text transform={`rotate(${(i / order.length) * 360}) translate(0 -40.5)`} textAnchor="middle" fontSize={3.4} fill="#fff" fontWeight={700}>{label(p)}</text>
                </g>
              );
            })}
            <circle r={28} fill="#2b1a0a" stroke="#d8b45a" strokeWidth={0.8} />
            {[0, 90, 180, 270].map((d) => <rect key={d} x={-1.4} y={-24} width={2.8} height={22} rx={1.4} fill="#d8b45a" transform={`rotate(${d + 45})`} />)}
            <circle r={6} fill="#d8b45a" />
          </motion.svg>
          <div style={{ position: 'absolute', left: '50%', top: -4, transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: '16px solid #fff', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.6))' }} />
        </div>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 4 }} aria-label="Recent results">
          {v.history.slice(0, 12).map((h, i) => <span key={i} className="center mono" style={{ width: 28, height: 28, borderRadius: 8, background: colourOf(h.pocket), fontSize: 12, fontWeight: 800, opacity: 1 - i * 0.05 }}>{h.label}</span>)}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(12, minmax(30px, 1fr))`, gap: 3, minWidth: 460 }}>
            <button onClick={() => add({ kind: 'straight', n: 0 })} style={cell('#0d8a4f', on({ kind: 'straight', n: 0 }), v.variant === 'us' ? 'span 1' : 'span 3')}>0</button>
            {v.variant === 'us' && <button onClick={() => add({ kind: 'straight', n: 37 })} style={{ ...cell('#0d8a4f', on({ kind: 'straight', n: 37 }), 'span 2'), gridColumn: 1, gridRow: '2 / span 2' }}>00</button>}
            {[3, 2, 1].map((rowMod, r) => nums.filter((n) => n % 3 === rowMod % 3).map((n, c) => (
              <button key={n} onClick={() => add({ kind: 'straight', n })} style={{ ...cell(RED.has(n) ? '#c4122f' : '#151515', on({ kind: 'straight', n })), gridColumn: c + 2, gridRow: r + 1 }} aria-label={`Straight ${n}`}>{n}</button>
            )))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, marginTop: 3, minWidth: 460, paddingLeft: 43 }}>
            {[0, 1, 2].map((d) => <button key={d} onClick={() => add({ kind: 'dozen', n: d })} style={cell('#0b2a20', on({ kind: 'dozen', n: d }))}>{['1st 12', '2nd 12', '3rd 12'][d]}</button>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3, marginTop: 3, minWidth: 460, paddingLeft: 43 }}>
            {(['low', 'even', 'red', 'black', 'odd', 'high'] as const).map((k) => <button key={k} onClick={() => add({ kind: k })} style={cell(k === 'red' ? '#c4122f' : k === 'black' ? '#151515' : '#0b2a20', on({ kind: k }))}>{({ low: '1-18', even: 'EVEN', red: 'RED', black: 'BLACK', odd: 'ODD', high: '19-36' } as any)[k]}</button>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, marginTop: 3, minWidth: 460, paddingLeft: 43 }}>
            {[2, 1, 0].map((c) => <button key={c} onClick={() => add({ kind: 'column', n: c })} style={cell('#0b2a20', on({ kind: 'column', n: c }))}>Column {3 - c} (2:1)</button>)}
          </div>
        </div>
      </div>
      <Outcome text={outcome?.t ?? null} good={outcome?.good} />
      <ChipPicker value={chip} onChange={setChip} />
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <span className="chip mono">On table {total.toLocaleString()}</span>
        <button className="btn" onClick={() => setBets(bets.slice(0, -1))} disabled={!bets.length || spinning}><Icon name="undo" />Undo</button>
        <button className="btn" onClick={() => setBets([])} disabled={!bets.length || spinning}>Clear</button>
        <button className="btn" onClick={() => spin(lastBets)} disabled={!lastBets.length || spinning}>Rebet</button>
        <button className="btn btn-gold btn-lg" onClick={() => spin()} disabled={!bets.length || spinning}>{spinning ? 'Spinning…' : 'Spin'}</button>
      </div>
      <Net net={v.net} />
      {v.variant === 'fr' && <p className="dim" style={{ fontSize: 12 }}>La Partage: if 0 lands, half of every even-money bet is returned.</p>}
    </>
  );
}

function cell(bg: string, amount?: number, span?: string): React.CSSProperties {
  return {
    position: 'relative', minHeight: 40, border: amount ? '2px solid #f6e3a6' : '1px solid rgba(216,180,90,.45)', background: bg, color: '#fff', borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: 'pointer',
    gridRow: span, boxShadow: amount ? '0 0 12px rgba(246,227,166,.6)' : undefined,
  };
}
