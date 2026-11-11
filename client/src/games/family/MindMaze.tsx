import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useCtl, Hud, useKeys } from '../runtime';
import { N, E, S, W, MazeState } from '@shared/games/mindMaze';
import { sfx } from '../../lib/sound';
import { Icon } from '../../components/Icon';

export default function MindMaze() {
  const ctl = useCtl();
  const s = ctl.view as MazeState;
  const { w, h, walls, orbs } = s.maze;
  const cell = 100 / w;
  const move = (d: 'N' | 'E' | 'S' | 'W') => {
    const before = s.collected.length, lvl = s.level;
    const pos = s.pos;
    if (ctl.record({ d })) {
      if (s.level !== lvl) sfx.win(); else if (s.collected.length > before) sfx.coin(); else if (s.pos === pos) sfx.thud(); else sfx.tap();
    }
  };
  useKeys({ ArrowUp: () => move('N'), ArrowRight: () => move('E'), ArrowDown: () => move('S'), ArrowLeft: () => move('W'), w: () => move('N'), d: () => move('E'), s: () => move('S'), a: () => move('W') }, [s, ctl.record]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const px = (s.pos % w) * cell + cell / 2, py = Math.floor(s.pos / w) * cell + cell / 2;
  const accent = ctl.meta.theme.accent;
  return (
    <>
      <Hud items={[['Maze', `${Math.min(s.level + 1, s.levels)}/${s.levels}`], ['Score', s.score], ['Steps', s.steps], ['Best path', s.maze.optimal]]} />
      <div className="board-wrap" style={{ touchAction: 'none' }}
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          if (!touch.current) return;
          const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');
          touch.current = null;
        }}>
        <svg viewBox="-2 -2 104 104" style={{ width: '100%', borderRadius: 18, background: 'radial-gradient(circle at 50% 40%, #0d2c4f, #030b18)' }} role="img" aria-label={`Maze ${s.level + 1}, ${s.collected.length} of ${orbs.length} orbs collected`}>
          <rect x={(w - 1) * cell + cell * 0.12} y={(h - 1) * cell + cell * 0.12} width={cell * 0.76} height={cell * 0.76} rx={cell * 0.2} fill="#ffd23f" opacity={0.85}>
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1.6s" repeatCount="indefinite" />
          </rect>
          {orbs.filter((o) => !s.collected.includes(o)).map((o) => <circle key={o} cx={(o % w) * cell + cell / 2} cy={Math.floor(o / w) * cell + cell / 2} r={cell * 0.18} fill="#7cf3ff" style={{ filter: 'drop-shadow(0 0 1.5px #7cf3ff)' }} />)}
          <g stroke="#7fb8ff" strokeWidth={Math.max(0.6, cell * 0.08)} strokeLinecap="round">
            {walls.map((m, i) => {
              const x = (i % w) * cell, y = Math.floor(i / w) * cell;
              return (
                <g key={i}>
                  {m & N ? <line x1={x} y1={y} x2={x + cell} y2={y} /> : null}
                  {m & W ? <line x1={x} y1={y} x2={x} y2={y + cell} /> : null}
                  {(m & E) && i % w === w - 1 ? <line x1={x + cell} y1={y} x2={x + cell} y2={y + cell} /> : null}
                  {(m & S) && Math.floor(i / w) === h - 1 ? <line x1={x} y1={y + cell} x2={x + cell} y2={y + cell} /> : null}
                </g>
              );
            })}
          </g>
          <motion.circle animate={{ cx: px, cy: py }} transition={{ type: 'spring', stiffness: 600, damping: 32 }} r={cell * 0.26} fill={accent} style={{ filter: `drop-shadow(0 0 ${cell * 0.2}px ${accent})` }} />
        </svg>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 58px)', gap: 8 }} aria-label="Direction pad">
        <span /><button className="btn icon-btn" style={{ width: 58, height: 58 }} onClick={() => move('N')} aria-label="Up"><Icon name="back" className="" size={22} /></button><span />
        <button className="btn icon-btn" style={{ width: 58, height: 58 }} onClick={() => move('W')} aria-label="Left"><Icon name="back" /></button>
        <button className="btn icon-btn" style={{ width: 58, height: 58 }} onClick={() => move('S')} aria-label="Down"><Icon name="next" /></button>
        <button className="btn icon-btn" style={{ width: 58, height: 58 }} onClick={() => move('E')} aria-label="Right"><Icon name="next" /></button>
      </div>
      <style>{`[aria-label="Up"] svg{transform:rotate(90deg)} [aria-label="Down"] svg{transform:rotate(90deg)}`}</style>
      <button className="btn btn-ghost btn-sm" onClick={() => ctl.record({ end: true })}>End run & submit</button>
    </>
  );
}
