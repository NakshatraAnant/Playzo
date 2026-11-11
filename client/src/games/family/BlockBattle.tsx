import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCtl, Hud } from '../runtime';
import { BlockState, SHAPES, SIZE, fits } from '@shared/games/blockBattle';
import { sfx } from '../../lib/sound';

const HUES = ['#ff6bd5', '#6bd5ff', '#ffd36b', '#7dffb2', '#ff8a5c', '#b48aff'];

export default function BlockBattle() {
  const ctl = useCtl();
  const s = ctl.view as BlockState;
  const [sel, setSel] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pulse, setPulse] = useState(0);
  const piece = sel !== null ? s.hand[sel] : null;
  const ghost = new Set<number>();
  let ghostOk = false;
  if (piece && hover !== null) {
    const r = Math.floor(hover / SIZE), c = hover % SIZE;
    ghostOk = fits(s.board, piece.shape, r, c);
    for (const [dr, dc] of SHAPES[piece.shape]) if (r + dr < SIZE && c + dc < SIZE) ghost.add((r + dr) * SIZE + c + dc);
  }
  const place = (i: number) => {
    if (sel === null) return;
    const r = Math.floor(i / SIZE), c = i % SIZE;
    const lines = s.lines;
    if (ctl.record({ p: sel, r, c })) {
      if (s.lines > lines) { sfx.win(); setPulse((x) => x + 1); } else sfx.thud();
      setSel(s.hand.findIndex((h) => h) >= 0 ? s.hand.findIndex((h) => h) : null);
    } else sfx.bad();
  };
  return (
    <>
      <Hud items={[['Score', s.score], ['Lines', s.lines], ['Best combo', `x${s.bestCombo}`]]} />
      <motion.div key={pulse} animate={pulse ? { scale: [1, 1.025, 1] } : undefined} className="board-wrap" style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gap: 3, padding: 6, borderRadius: 16, background: '#1a0820', maxWidth: 440, boxShadow: 'inset 0 0 30px rgba(0,0,0,.6)' }}
        onMouseLeave={() => setHover(null)}>
        {s.board.map((v, i) => {
          const g = ghost.has(i);
          return (
            <button key={i} onClick={() => place(i)} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} aria-label={`Cell ${Math.floor(i / SIZE) + 1},${(i % SIZE) + 1}${v ? ' filled' : ''}`}
              style={{ aspectRatio: '1', border: 0, borderRadius: 6, padding: 0, cursor: piece ? 'pointer' : 'default',
                background: v ? HUES[v - 1] : g ? (ghostOk ? `${HUES[piece!.hue]}88` : 'rgba(255,77,109,.35)') : 'rgba(255,255,255,.05)',
                boxShadow: v ? 'inset 0 -4px 0 rgba(0,0,0,.25), inset 0 2px 0 rgba(255,255,255,.35)' : undefined, transition: 'background .12s' }} />
          );
        })}
      </motion.div>
      <div className="row" style={{ gap: 12, justifyContent: 'center', minHeight: 110 }}>
        <AnimatePresence>
          {s.hand.map((h, k) => h && (
            <motion.button key={`${s.dealt}-${k}`} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1, scale: sel === k ? 1.08 : 1 }} exit={{ scale: 0, opacity: 0 }}
              onClick={() => { setSel(k); sfx.select(); }} className="btn" aria-pressed={sel === k} aria-label={`Piece ${k + 1}`}
              style={{ minHeight: 100, minWidth: 100, borderRadius: 18, borderColor: sel === k ? HUES[h.hue] : undefined, background: sel === k ? 'var(--surface-3)' : undefined, padding: 10 }}>
              <PieceView shape={h.shape} hue={HUES[h.hue]} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <p className="dim" style={{ fontSize: 13 }}>{piece ? 'Tap the board where the top-left of the piece should go.' : 'Choose a piece.'}</p>
    </>
  );
}

function PieceView({ shape, hue }: { shape: number; hue: string }) {
  const cells = SHAPES[shape];
  const rows = Math.max(...cells.map((c) => c[0])) + 1, cols = Math.max(...cells.map((c) => c[1])) + 1;
  const u = Math.min(16, 76 / Math.max(rows, cols));
  return (
    <svg width={cols * u} height={rows * u}>
      {cells.map(([r, c], i) => <rect key={i} x={c * u + 1} y={r * u + 1} width={u - 2} height={u - 2} rx={3} fill={hue} />)}
    </svg>
  );
}
