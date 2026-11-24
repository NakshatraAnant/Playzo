import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useCtl, Hud, cellProps } from '../runtime';
import { TurnBanner, myTurn } from './TurnBanner';
import { sfx } from '../../lib/sound';

const COL = ['#ff6b6b', '#4dabff'];

export default function TerritoryWars() {
  const ctl = useCtl();
  const s = ctl.view as { R: number; C: number; h: number[]; v: number[]; boxes: number[]; players: string[]; turn: number; scores: number[]; over: boolean; last: any };
  const turnId = s.over ? null : s.players[s.turn];
  const can = myTurn(ctl, turnId);
  const prevBoxes = useRef(s.boxes.filter((b) => b >= 0).length);
  useEffect(() => { const n = s.boxes.filter((b) => b >= 0).length; if (n > prevBoxes.current) sfx.coin(); prevBoxes.current = n; }, [s.boxes]);
  const U = 100 / Math.max(s.R, s.C);
  const P = 6;
  const line = (o: 'h' | 'v', r: number, c: number) => { if (can) { sfx.tap(); ctl.act({ type: 'line', o, r, c }).catch(() => undefined); } };
  const isLast = (o: string, r: number, c: number) => s.last && s.last.o === o && s.last.r === r && s.last.c === c;
  return (
    <>
      <Hud items={[['Red', s.scores[0]], ['Blue', s.scores[1]], ['Left', s.boxes.filter((b) => b < 0).length]]} />
      <TurnBanner turn={turnId} colours={COL} />
      <div className="board-wrap" style={{ maxWidth: 480 }}>
        <svg viewBox={`${-P} ${-P} ${100 + 2 * P} ${100 + 2 * P}`} style={{ width: '100%', background: 'radial-gradient(circle, #1e3a1e, #0b160b)', borderRadius: 18 }} role="group" aria-label={`Board ${s.R} by ${s.C}`}>
          {s.boxes.map((b, i) => b >= 0 && (
            <motion.rect key={i} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 0.7, scale: 1 }} style={{ originX: `${(i % s.C) * U + U / 2}px`, originY: `${Math.floor(i / s.C) * U + U / 2}px` }}
              x={(i % s.C) * U + 1.5} y={Math.floor(i / s.C) * U + 1.5} width={U - 3} height={U - 3} rx={2} fill={COL[b]} />
          ))}
          {s.boxes.map((b, i) => b >= 0 && <path key={`f${i}`} d={`M${(i % s.C) * U + U * 0.38} ${Math.floor(i / s.C) * U + U * 0.7} v${-U * 0.42} h${U * 0.3} l-${U * 0.08} ${U * 0.1} l${U * 0.08} ${U * 0.1} h${-U * 0.3}`} stroke="#fff" strokeWidth={1.2} fill={COL[b]} opacity={0.95} />)}
          {Array.from({ length: s.R + 1 }, (_, r) => Array.from({ length: s.C }, (_, c) => {
            const on = s.h[r * s.C + c];
            return <g key={`h${r}-${c}`} {...cellProps(can && !on, `Horizontal border, row ${r + 1} column ${c + 1}${on ? ', drawn' : ''}`, () => { if (!on) line('h', r, c); })} className="board-cell" style={{ cursor: !on && can ? 'pointer' : 'default' }}>
              <rect x={c * U + 2} y={r * U - 3} width={U - 4} height={6} fill="transparent" />
              <line x1={c * U + 2.5} y1={r * U} x2={(c + 1) * U - 2.5} y2={r * U} stroke={on ? (isLast('h', r, c) ? '#ffcf4a' : '#fff') : 'rgba(255,255,255,.12)'} strokeWidth={on ? 2.2 : 1.4} strokeLinecap="round" strokeDasharray={on ? undefined : '2 2'} />
            </g>;
          }))}
          {Array.from({ length: s.R }, (_, r) => Array.from({ length: s.C + 1 }, (_, c) => {
            const on = s.v[r * (s.C + 1) + c];
            return <g key={`v${r}-${c}`} {...cellProps(can && !on, `Vertical border, row ${r + 1} column ${c + 1}${on ? ', drawn' : ''}`, () => { if (!on) line('v', r, c); })} className="board-cell" style={{ cursor: !on && can ? 'pointer' : 'default' }}>
              <rect x={c * U - 3} y={r * U + 2} width={6} height={U - 4} fill="transparent" />
              <line x1={c * U} y1={r * U + 2.5} x2={c * U} y2={(r + 1) * U - 2.5} stroke={on ? (isLast('v', r, c) ? '#ffcf4a' : '#fff') : 'rgba(255,255,255,.12)'} strokeWidth={on ? 2.2 : 1.4} strokeLinecap="round" strokeDasharray={on ? undefined : '2 2'} />
            </g>;
          }))}
          {Array.from({ length: (s.R + 1) * (s.C + 1) }, (_, i) => <circle key={`d${i}`} cx={(i % (s.C + 1)) * U} cy={Math.floor(i / (s.C + 1)) * U} r={1.6} fill="#fff" />)}
        </svg>
      </div>
      <p className="dim" style={{ fontSize: 13 }}>{can ? 'Tap a dashed border to draw it.' : turnId ? 'Waiting for opponent…' : ''}</p>
    </>
  );
}
