import { lazy, Suspense, useState } from 'react';
import { useCtl } from '../runtime';
import { Net, Outcome, StakeInput, useStake } from './common';
import { sfx } from '../../lib/sound';
const Dice3D = lazy(() => import('../../three/Dice3D'));

const BETS = [
  { kind: 'under', label: 'Under 7', pays: '2.35×', p: 15 / 36 },
  { kind: 'seven', label: 'Exactly 7', pays: '5.8×', p: 6 / 36 },
  { kind: 'over', label: 'Over 7', pays: '2.35×', p: 15 / 36 },
] as const;

export default function DiceArena() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [stake, setStake] = useStake('dice', 100);
  const [bet, setBet] = useState<{ kind: string; n?: number }>({ kind: 'over' });
  const [rollKey, setRollKey] = useState(0);
  const [out, setOut] = useState<{ t: string; good: boolean } | null>(null);
  const roll = async () => {
    sfx.dice(); setOut(null);
    try {
      const r = await ctl.act({ type: 'roll', bet: { ...bet, amount: stake } });
      setRollKey((k) => k + 1);
      const d = r.view.last.dice;
      setTimeout(() => { setOut({ t: `${d[0]} + ${d[1]} = ${d[0] + d[1]}${r.view.last.won ? ` · returned ${r.view.last.won}` : ''}`, good: r.view.last.won > 0 }); r.view.last.won ? sfx.win() : sfx.lose(); }, 1250);
    } catch { /* toast */ }
  };
  return (
    <>
      <div style={{ width: '100%', maxWidth: 640, height: 260, borderRadius: 28, overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 80%, #4a1010, #120404)', border: '1px solid rgba(255,77,77,.35)' }}>
        <Suspense fallback={<div className="center" style={{ height: '100%' }}><div className="spinner" /></div>}>
          <Dice3D values={v.last?.dice ?? [6, 1]} rollKey={rollKey} colors={['#ff4d4d', '#ffffff']} />
        </Suspense>
      </div>
      <Outcome text={out?.t ?? null} good={out?.good} />
      <div className="answer-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {BETS.map((b) => <button key={b.kind} className={`answer ${bet.kind === b.kind ? 'right' : ''}`} onClick={() => setBet({ kind: b.kind })}>{b.label}<div className="dim" style={{ fontSize: 12 }}>{b.pays} · {(b.p * 100).toFixed(1)}%</div></button>)}
      </div>
      <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}>
        <span className="muted" style={{ fontSize: 13 }}>Specific double (35× · 2.8%):</span>
        {[1, 2, 3, 4, 5, 6].map((n) => <button key={n} className={`btn btn-sm ${bet.kind === 'double' && bet.n === n ? 'btn-cool' : ''}`} onClick={() => setBet({ kind: 'double', n })}>{n}+{n}</button>)}
      </div>
      <div className="row wrap" style={{ justifyContent: 'center' }}><StakeInput value={stake} onChange={setStake} /><button className="btn btn-gold btn-lg" onClick={roll} disabled={ctl.busy}>Roll</button></div>
      <Net net={v.net} />
    </>
  );
}
