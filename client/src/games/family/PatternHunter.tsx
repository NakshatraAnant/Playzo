import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useCtl, Hud, TimeBar, useFrame } from '../runtime';
import { PatternState, PATTERN_DURATION } from '@shared/games/patternHunter';
import { sfx } from '../../lib/sound';

const GLYPHS = [
  'M50 12 L88 82 L12 82Z', 'M50 10 a40 40 0 1 0 0.1 0Z', 'M18 18 h64 v64 h-64Z', 'M50 8 L61 38 L93 38 L67 57 L77 88 L50 69 L23 88 L33 57 L7 38 L39 38Z',
  'M50 8 L90 50 L50 92 L10 50Z', 'M30 12 h40 l20 38 l-20 38 h-40 l-20-38Z', 'M20 20 h60 v20 h-40 v20 h40 v20 h-60Z', 'M50 10 L90 30 L90 70 L50 90 L50 50 L10 30Z',
];

export default function PatternHunter() {
  const ctl = useCtl();
  const s = ctl.view as PatternState;
  const t = useFrame(!s.over);
  const [flash, setFlash] = useState<number | null>(null);
  const left = PATTERN_DURATION - s.penalty - t;
  useEffect(() => { if (left <= 0 && !s.over) ctl.record({ end: true }, PATTERN_DURATION - s.penalty); }, [left, s.over, ctl, s.penalty]);
  const r = s.current;
  const tap = (i: number) => {
    const found = s.found;
    ctl.record({ i });
    if (s.found > found) sfx.good(); else { sfx.bad(); setFlash(i); setTimeout(() => setFlash(null), 300); }
  };
  return (
    <>
      <Hud items={[['Time', Math.max(0, Math.ceil(left / 1000))], ['Score', s.score], ['Found', s.found], ['Grid', `${r.n}x${r.n}`]]} />
      <div className="board-wrap"><TimeBar frac={left / PATTERN_DURATION} /></div>
      <motion.div key={s.round} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="board-wrap" style={{ display: 'grid', gridTemplateColumns: `repeat(${r.n}, 1fr)`, gap: 6 }}>
        {Array.from({ length: r.n * r.n }, (_, i) => {
          const odd = i === r.odd;
          const glyph = odd && r.kind === 'shape' ? r.altGlyph : r.glyph;
          const rot = r.rot + (odd && r.kind === 'rotation' ? r.delta : 0);
          const hue = (r.hue + (odd && r.kind === 'hue' ? r.delta : 0)) % 360;
          return (
            <button key={i} onClick={() => tap(i)} aria-label={`Tile ${i + 1}`} className={flash === i ? 'shake' : ''}
              style={{ aspectRatio: '1', border: '1px solid var(--line)', borderRadius: 12, background: flash === i ? 'rgba(255,77,109,.3)' : 'var(--surface)', padding: '14%', cursor: 'pointer' }}>
              <svg viewBox="0 0 100 100" style={{ width: '100%', transform: `rotate(${rot}deg)` }}><path d={GLYPHS[glyph]} fill={`hsl(${hue} 85% 66%)`} /></svg>
            </button>
          );
        })}
      </motion.div>
      <p className="dim" style={{ fontSize: 13 }}>Find the tile that differs by {r.kind === 'hue' ? 'colour' : r.kind}.</p>
    </>
  );
}
