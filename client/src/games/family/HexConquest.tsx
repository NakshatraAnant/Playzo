import { motion } from 'framer-motion';
import { useCtl, Hud } from '../runtime';
import { TurnBanner, myTurn } from './TurnBanner';
import { sfx } from '../../lib/sound';

const COL = ['#3d8bff', '#ff7d6b'];

export default function HexConquest() {
  const ctl = useCtl();
  const s = ctl.view as { n: number; cells: number[]; players: string[]; turn: number; winner: number | null; last: number | null; moves: number; path: number[] };
  const turnId = s.winner !== null ? null : s.players[s.turn];
  const can = myTurn(ctl, turnId);
  const R = 5, dx = R * Math.sqrt(3), dy = R * 1.5;
  const pos = (i: number) => { const r = Math.floor(i / s.n), c = i % s.n; return [c * dx + r * dx / 2 + dx, r * dy + R * 1.6]; };
  const w = s.n * dx + (s.n - 1) * dx / 2 + dx * 1.5, h = (s.n - 1) * dy + R * 3.2;
  const hex = (x: number, y: number, r: number) => Array.from({ length: 6 }, (_, k) => { const t = (Math.PI / 3) * k + Math.PI / 6; return `${x + r * Math.cos(t)},${y + r * Math.sin(t)}`; }).join(' ');
  const place = (i: number) => { if (can && s.cells[i] < 0) { sfx.tap(); ctl.act({ type: 'place', i }).catch(() => undefined); } };
  return (
    <>
      <Hud items={[['Moves', s.moves], ['Board', `${s.n}x${s.n}`]]} />
      <TurnBanner turn={turnId} colours={COL} labels={['left ↔ right', 'top ↕ bottom']} />
      <div className="board-wrap" style={{ maxWidth: 640 }}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%' }} role="img" aria-label="Hex board">
          <line x1={pos(0)[0] - dx * 0.4} y1={2} x2={pos(s.n - 1)[0] + dx * 0.4} y2={2} stroke={COL[1]} strokeWidth={2.2} strokeLinecap="round" />
          <line x1={pos(s.n * (s.n - 1))[0] - dx * 0.4} y1={h - 2} x2={pos(s.n * s.n - 1)[0] + dx * 0.4} y2={h - 2} stroke={COL[1]} strokeWidth={2.2} strokeLinecap="round" />
          <line x1={pos(0)[0] - dx * 0.75} y1={pos(0)[1]} x2={pos(s.n * (s.n - 1))[0] - dx * 0.75} y2={pos(s.n * (s.n - 1))[1]} stroke={COL[0]} strokeWidth={2.2} strokeLinecap="round" />
          <line x1={pos(s.n - 1)[0] + dx * 0.75} y1={pos(s.n - 1)[1]} x2={pos(s.n * s.n - 1)[0] + dx * 0.75} y2={pos(s.n * s.n - 1)[1]} stroke={COL[0]} strokeWidth={2.2} strokeLinecap="round" />
          {s.cells.map((c, i) => {
            const [x, y] = pos(i);
            const onPath = s.path.includes(i);
            return (
              <g key={i} onClick={() => place(i)} style={{ cursor: can && c < 0 ? 'pointer' : 'default' }} role="button" aria-label={`Cell ${i + 1}${c >= 0 ? ` taken by ${c === 0 ? 'blue' : 'coral'}` : ''}`}>
                <polygon points={hex(x, y, R * 0.96)} fill={c < 0 ? '#0a3a52' : COL[c]} stroke={onPath ? '#fff' : '#7fd4ff'} strokeOpacity={onPath ? 1 : 0.35} strokeWidth={onPath ? 0.9 : 0.4} />
                {c >= 0 && <motion.text initial={{ scale: 0 }} animate={{ scale: 1 }} x={x} y={y + 1.6} textAnchor="middle" fontSize={4.4} fill="#fff" fontWeight={900}>{c === 0 ? '◆' : '●'}</motion.text>}
                {s.last === i && <circle cx={x} cy={y} r={R * 0.3} fill="none" stroke="#fff" strokeWidth={0.5} />}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="dim" style={{ fontSize: 13 }}>{s.winner !== null ? `${s.winner === 0 ? 'Blue' : 'Coral'} connected their shores!` : can ? 'Tap a hex to claim it.' : 'Opponent is thinking…'}</p>
    </>
  );
}
