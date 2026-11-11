import { useState } from 'react';
import { motion } from 'framer-motion';
import { useCtl, Hud } from '../runtime';
import { LockState } from '@shared/games/logicLock';
import { sfx } from '../../lib/sound';
import { Icon } from '../../components/Icon';

const DIAL_COLOURS = ['#ffc857', '#ff7ae0', '#5cc8ff', '#7dffb2', '#ff8a5c', '#b48aff'];

export default function LogicLock() {
  const ctl = useCtl();
  const s = ctl.view as LockState;
  const [hover, setHover] = useState<number | null>(null);
  const P = s.lock.positions;
  const pull = (lever: number) => {
    const idx = s.index;
    if (ctl.record({ lever })) idx !== s.index ? sfx.win() : sfx.tick();
  };
  return (
    <>
      <Hud items={[['Lock', `${Math.min(s.index + 1, s.total)}/${s.total}`], ['Score', s.score], ['Moves', s.moves.length], ['Minimum', s.lock.minMoves]]} />
      <motion.div key={s.index} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="panel" style={{ width: '100%', maxWidth: 560, background: 'radial-gradient(circle at 50% 30%, #3a2a10, #120c04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.lock.dials}, 1fr)`, gap: 10 }}>
          {s.dials.map((v, d) => {
            const linked = hover !== null && s.lock.links[hover].includes(d);
            return (
              <div key={d} className="col" style={{ alignItems: 'center', gap: 6 }}>
                <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: 90 }} aria-label={`Dial ${d + 1} at position ${v} of ${P}`}>
                  <circle cx={50} cy={50} r={44} fill="#2d1f08" stroke={linked ? '#fff' : DIAL_COLOURS[d]} strokeWidth={linked ? 6 : 4} />
                  {Array.from({ length: P }, (_, k) => <circle key={k} cx={50 + 34 * Math.sin((k / P) * Math.PI * 2)} cy={50 - 34 * Math.cos((k / P) * Math.PI * 2)} r={k === 0 ? 6 : 3} fill={k === 0 ? '#fff' : '#8a6a2a'} />)}
                  <motion.g animate={{ rotate: (v / P) * 360 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }} style={{ originX: '50px', originY: '50px' }}>
                    <path d="M50 50 L50 20" stroke={DIAL_COLOURS[d]} strokeWidth={8} strokeLinecap="round" />
                  </motion.g>
                  <circle cx={50} cy={50} r={10} fill={v === 0 ? '#3ddc97' : DIAL_COLOURS[d]} />
                </svg>
                <span className="mono dim" style={{ fontSize: 12 }}>{v === 0 ? '✓ set' : `${v}/${P}`}</span>
              </div>
            );
          })}
        </div>
      </motion.div>
      <div className="row wrap" style={{ justifyContent: 'center', maxWidth: 560 }}>
        {s.lock.links.map((l, i) => (
          <button key={i} className="btn btn-lg" style={{ flexDirection: 'column', minHeight: 72, gap: 4, borderRadius: 18 }} onClick={() => pull(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`Lever ${i + 1}: turns dials ${l.map((d) => d + 1).join(', ')}`}>
            <span>Lever {String.fromCharCode(65 + i)}</span>
            <span className="row" style={{ gap: 4 }}>{l.map((d) => <i key={d} style={{ width: 10, height: 10, borderRadius: 5, background: DIAL_COLOURS[d], display: 'inline-block' }} />)}</span>
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" onClick={() => ctl.record({ undo: true })} disabled={!s.moves.length}><Icon name="undo" />Undo</button>
    </>
  );
}
