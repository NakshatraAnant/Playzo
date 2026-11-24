import { motion } from 'framer-motion';
import { useCtl, Hud, cellProps } from '../runtime';
import { TurnBanner, myTurn } from './TurnBanner';
import { sfx } from '../../lib/sound';

export default function ConnectFive() {
  const ctl = useCtl();
  const s = ctl.view as { n: number; cells: number[]; players: string[]; turn: number; winner: number | null; draw: boolean; last: number | null; line: number[]; moves: number };
  const turnId = s.winner !== null || s.draw ? null : s.players[s.turn];
  const can = myTurn(ctl, turnId);
  const G = 10, pad = G;
  const size = (s.n - 1) * G + pad * 2;
  const place = (i: number) => { if (can && s.cells[i] < 0) { sfx.thud(); ctl.act({ type: 'place', i }).catch(() => undefined); } };
  return (
    <>
      <Hud items={[['Moves', s.moves], ['Goal', '5 in a row']]} />
      <TurnBanner turn={turnId} colours={['#111', '#f6f1e6']} labels={['black', 'white']} />
      <div className="board-wrap" style={{ maxWidth: 560 }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', borderRadius: 14, background: 'linear-gradient(135deg, #d9b47a, #b88a4a)', boxShadow: 'var(--sh-2)' }} role="group" aria-label="Go-style board">
          {Array.from({ length: s.n }, (_, i) => <g key={i}><line x1={pad} y1={pad + i * G} x2={size - pad} y2={pad + i * G} stroke="#5a3a12" strokeWidth={0.5} /><line x1={pad + i * G} y1={pad} x2={pad + i * G} y2={size - pad} stroke="#5a3a12" strokeWidth={0.5} /></g>)}
          {s.cells.map((c, i) => {
            const x = pad + (i % s.n) * G, y = pad + Math.floor(i / s.n) * G;
            return (
              <g key={i} {...cellProps(can && c < 0, `Row ${Math.floor(i / s.n) + 1} column ${(i % s.n) + 1}${c >= 0 ? `, ${c === 0 ? 'black' : 'white'}` : ''}`, () => place(i))} className="board-cell" style={{ cursor: can && c < 0 ? 'pointer' : 'default' }}>
                <rect x={x - G / 2} y={y - G / 2} width={G} height={G} fill="transparent" />
                {c >= 0 && <motion.circle initial={{ r: 0 }} animate={{ r: G * 0.42 }} cx={x} cy={y} fill={c === 0 ? 'url(#blk)' : 'url(#wht)'} stroke={s.line.includes(i) ? '#ff3d8b' : 'rgba(0,0,0,.35)'} strokeWidth={s.line.includes(i) ? 1.2 : 0.3} />}
                {s.last === i && <circle cx={x} cy={y} r={1.3} fill="#ff3d8b" />}
              </g>
            );
          })}
          <defs>
            <radialGradient id="blk" cx="0.35" cy="0.3"><stop offset="0" stopColor="#666" /><stop offset="1" stopColor="#0a0a0a" /></radialGradient>
            <radialGradient id="wht" cx="0.35" cy="0.3"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#cfc6b3" /></radialGradient>
          </defs>
        </svg>
      </div>
      <p className="dim" style={{ fontSize: 13 }}>{s.draw ? 'Board full: draw.' : s.winner !== null ? 'Five in a row!' : can ? 'Tap an intersection.' : 'Opponent is thinking…'}</p>
    </>
  );
}
