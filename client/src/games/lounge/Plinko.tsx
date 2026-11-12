import { useEffect, useRef, useState } from 'react';
import { useCtl } from '../runtime';
import { Net, StakeInput, useStake } from './common';
import { api } from '../../lib/api';
import { sfx } from '../../lib/sound';
import { fmtMult, pct } from './Instant';

export default function Plinko() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [math, setMath] = useState<any>(null);
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState<'low' | 'medium' | 'high'>('medium');
  const [stake, setStake] = useStake('plinko', 50);
  const [balls, setBalls] = useState<{ id: number; path: number[]; t0: number; slot: number }[]>([]);
  const [hot, setHot] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { api.get('/api/games/plinko').then((r) => setMath(r.math)).catch(() => undefined); }, []);
  const table = math?.tables.find((t: any) => t.rows === rows && t.risk === risk);
  const STEP = 140;
  const drop = async () => {
    try {
      const r = await ctl.act({ type: 'drop', rows, risk, amount: stake });
      const L = r.view.last;
      setBalls((b) => [...b.slice(-8), { id: Date.now() + Math.random(), path: L.path, t0: performance.now(), slot: L.slot }]);
      setTimeout(() => { setHot(L.slot); L.mult > 1 ? sfx.coin() : L.mult === 1 ? sfx.neutral() : sfx.thud(); setTimeout(() => setHot(null), 600); }, rows * STEP);
    } catch { /* toast */ }
  };
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = canvas.current; if (!c) return;
      const g = c.getContext('2d')!;
      const W = c.width, H = c.height, gap = W / (rows + 3), top = 40;
      g.clearRect(0, 0, W, H);
      for (let r = 0; r < rows; r++) for (let k = 0; k <= r + 2; k++) {
        const x = W / 2 + (k - (r + 2) / 2) * gap, y = top + r * gap * 0.9;
        g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      }
      const now = performance.now();
      for (const b of balls) {
        const t = (now - b.t0) / STEP;
        if (t > rows + 6) continue;
        const step = Math.min(Math.floor(t), rows);
        const frac = Math.min(1, t - step);
        let pos = 0;
        for (let i = 0; i < step; i++) pos += b.path[i];
        const next = step < rows ? pos + b.path[step] : pos;
        const xA = W / 2 + (pos - step / 2) * gap, xB = W / 2 + (next - (step + 1) / 2) * gap;
        const x = step >= rows ? W / 2 + (pos - rows / 2) * gap : xA + (xB - xA) * frac;
        const y = top - gap * 0.5 + (step + frac) * gap * 0.9 - (step < rows ? Math.sin(frac * Math.PI) * gap * 0.35 : 0);
        g.fillStyle = '#4dd2ff'; g.shadowColor = '#4dd2ff'; g.shadowBlur = 16;
        g.beginPath(); g.arc(x, Math.min(y, top + rows * gap * 0.9 - 6), 8, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [balls, rows]);
  const colour = (m: number) => (m >= 10 ? '#ff4d6d' : m >= 2 ? '#ff9a3c' : m >= 1 ? '#ffd23f' : '#3d8bff');
  return (
    <>
      <div style={{ width: '100%', maxWidth: 680, borderRadius: 24, padding: 12, background: 'radial-gradient(circle at 50% 0%, #0f2a5a, #020714)', border: '1px solid rgba(77,210,255,.3)' }}>
        <canvas ref={canvas} width={680} height={rows * 46 + 40} style={{ width: '100%', display: 'block' }} role="img" aria-label="Plinko board" />
        {table && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows + 1}, 1fr)`, gap: 2, padding: `0 ${100 / (rows + 3)}%` }}>
            {table.multipliers.map((m: number, k: number) => (
              <div key={k} title={`Probability ${pct(table.probabilities[k])}`} className="center mono" style={{ minHeight: 30, borderRadius: 6, fontSize: 'clamp(8px, 1.8vw, 12px)', fontWeight: 800, background: colour(m), color: '#0a0a1a', transform: hot === k ? 'translateY(6px) scale(1.1)' : undefined, transition: 'transform .2s' }}>{fmtMult(m)}</div>
            ))}
          </div>
        )}
      </div>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <div className="seg" aria-label="Rows">{[8, 12, 16].map((n) => <button key={n} className={rows === n ? 'on' : ''} onClick={() => setRows(n)}>{n} rows</button>)}</div>
        <div className="seg" aria-label="Risk">{(['low', 'medium', 'high'] as const).map((x) => <button key={x} className={risk === x ? 'on' : ''} onClick={() => setRisk(x)} style={{ textTransform: 'capitalize' }}>{x}</button>)}</div>
      </div>
      <div className="row wrap" style={{ justifyContent: 'center' }}><StakeInput value={stake} onChange={(n) => setStake(Math.min(2000, n))} max={2000} /><button className="btn btn-gold btn-lg" onClick={drop} disabled={ctl.busy}>Drop ball</button></div>
      {table && <p className="dim" style={{ fontSize: 12 }}>Exact RTP for {rows} rows / {risk}: {table.rtp}% · each peg is a 50/50 cryptographic coin flip</p>}
      {v.last && <span className="chip mono">Last: slot {v.last.slot} · {fmtMult(v.last.mult)} · returned {v.last.won}</span>}
      <Net net={v.net} />
    </>
  );
}
