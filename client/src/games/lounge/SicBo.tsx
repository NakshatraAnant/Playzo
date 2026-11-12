import { lazy, Suspense, useState } from 'react';
import { useCtl } from '../runtime';
import { Net, Outcome, ChipPicker } from './common';
import { sfx } from '../../lib/sound';
const Dice3D = lazy(() => import('../../three/Dice3D'));

type B = { kind: string; n?: number; amount: number };
const TOTALS: Record<number, number> = { 4: 60, 17: 60, 5: 30, 16: 30, 6: 17, 15: 17, 7: 12, 14: 12, 8: 8, 13: 8, 9: 6, 12: 6, 10: 6, 11: 6 };
const WAYS: Record<number, number> = { 4: 3, 5: 6, 6: 10, 7: 15, 8: 21, 9: 25, 10: 27, 11: 27, 12: 25, 13: 21, 14: 15, 15: 10, 16: 6, 17: 3 };

export default function SicBo() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [chip, setChip] = useState(50);
  const [bets, setBets] = useState<B[]>([]);
  const [rolling, setRolling] = useState(0);
  const [out, setOut] = useState<string | null>(null);
  const k = (b: Omit<B, 'amount'>) => `${b.kind}:${b.n ?? ''}`;
  const add = (b: Omit<B, 'amount'>) => { sfx.deal(); setBets((cur) => { const e = cur.find((x) => k(x) === k(b)); return e ? cur.map((x) => (x === e ? { ...x, amount: Math.min(5000, x.amount + chip) } : x)) : [...cur, { ...b, amount: chip }]; }); };
  const amt = (b: Omit<B, 'amount'>) => bets.find((x) => k(x) === k(b))?.amount;
  const roll = async () => {
    if (!bets.length) return;
    sfx.dice();
    try {
      const r = await ctl.act({ type: 'roll', bets });
      setRolling((x) => x + 1);
      const won = r.view.last.bets.reduce((t: number, b: any) => t + b.won, 0), st = bets.reduce((t, b) => t + b.amount, 0);
      setTimeout(() => { setOut(`${r.view.last.dice.join(' · ')} = ${r.view.last.dice.reduce((a: number, b: number) => a + b, 0)} · returned ${won} of ${st}`); won > st ? sfx.win() : won ? sfx.neutral() : sfx.lose(); }, 1300);
      setBets([]);
    } catch { /* toast */ }
  };
  const Spot = ({ b, children, sub }: { b: Omit<B, 'amount'>; children: React.ReactNode; sub?: string }) => (
    <button onClick={() => add(b)} title={sub} style={{ minHeight: 54, borderRadius: 10, border: amt(b) ? '2px solid #ffb547' : '1px solid rgba(255,181,71,.35)', background: amt(b) ? 'rgba(255,181,71,.2)' : 'rgba(0,0,0,.25)', color: '#fff', cursor: 'pointer', fontWeight: 800, fontSize: 12, padding: 4 }}>
      {children}{sub && <div style={{ fontSize: 10, opacity: 0.7 }}>{sub}</div>}{amt(b) ? <div className="mono" style={{ color: '#ffb547' }}>{amt(b)}</div> : null}
    </button>
  );
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#4a0f08', width: '100%', maxWidth: 820, display: 'grid', gap: 12 }}>
        <div style={{ height: 200, borderRadius: 18, overflow: 'hidden', background: 'radial-gradient(circle, #6a1a10, #2a0604)' }}>
          <Suspense fallback={<div className="center" style={{ height: '100%' }}>{v.last?.dice.join(' ') ?? '⚀ ⚀ ⚀'}</div>}>
            <Dice3D values={v.last?.dice ?? [1, 2, 3]} rollKey={rolling} />
          </Suspense>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <Spot b={{ kind: 'small' }} sub="4-10 · 1:1 · 48.6%">SMALL</Spot>
          <Spot b={{ kind: 'anyTriple' }} sub="30:1 · 2.8%">ANY TRIPLE</Spot>
          <Spot b={{ kind: 'big' }} sub="11-17 · 1:1 · 48.6%">BIG</Spot>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {Object.keys(TOTALS).map(Number).sort((a, b) => a - b).map((t) => <Spot key={t} b={{ kind: 'total', n: t }} sub={`${TOTALS[t]}:1 · ${((WAYS[t] / 216) * 100).toFixed(1)}%`}>{t}</Spot>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
          {[1, 2, 3, 4, 5, 6].map((n) => <Spot key={`d${n}`} b={{ kind: 'double', n }} sub="10:1">{n}{n}</Spot>)}
          {[1, 2, 3, 4, 5, 6].map((n) => <Spot key={`t${n}`} b={{ kind: 'triple', n }} sub="150:1">{n}{n}{n}</Spot>)}
          {[1, 2, 3, 4, 5, 6].map((n) => <Spot key={`s${n}`} b={{ kind: 'single', n }} sub="1-3:1">single {n}</Spot>)}
        </div>
      </div>
      <Outcome text={out} />
      <ChipPicker value={chip} onChange={setChip} />
      <div className="row"><button className="btn" onClick={() => setBets([])} disabled={!bets.length}>Clear</button><button className="btn btn-gold btn-lg" onClick={roll} disabled={!bets.length || ctl.busy}>Shake & roll</button></div>
      <Net net={v.net} />
    </>
  );
}
