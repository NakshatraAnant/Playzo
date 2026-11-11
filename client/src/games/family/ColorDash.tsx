import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCtl, Hud, TimeBar, useFrame, useKeys } from '../runtime';
import { DashState, DASH_DURATION, DASH_COLOURS } from '@shared/games/colorDash';
import { sfx } from '../../lib/sound';

export default function ColorDash() {
  const ctl = useCtl();
  const s = ctl.view as DashState;
  const t = useFrame(!s.over);
  const [cb, setCb] = useState(() => { try { return localStorage.getItem('pz-cb') === '1'; } catch { return false; } });
  useEffect(() => { if (t >= DASH_DURATION && !s.over) ctl.record({ end: true }, DASH_DURATION); }, [t, s.over, ctl]);
  const pick = (c: number) => {
    const ok = s.correct;
    if (ctl.record({ c })) s.correct > ok ? sfx.good() : sfx.bad();
  };
  useKeys(Object.fromEntries(s.prompt.options.map((c, i) => [String(i + 1), () => pick(c)])), [s.idx, ctl.record]);
  const ink = DASH_COLOURS[s.prompt.ink], word = DASH_COLOURS[s.prompt.word];
  return (
    <>
      <Hud items={[['Time', Math.max(0, Math.ceil((DASH_DURATION - t) / 1000))], ['Score', s.score], ['Streak', s.streak]]} />
      <div className="board-wrap"><TimeBar frac={1 - t / DASH_DURATION} /></div>
      <div className="panel center" style={{ width: '100%', maxWidth: 520, minHeight: 190, background: '#140814' }}>
        <AnimatePresence mode="popLayout">
          <motion.div key={s.idx} initial={{ scale: 1.6, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(3rem, 14vw, 5rem)', color: ink.hex, textShadow: `0 0 30px ${ink.hex}55` }}
            aria-label={`The word ${word.name} written in ${ink.name.toLowerCase()} ink`}>
            {word.name}{cb && <span style={{ fontSize: '0.45em', marginLeft: 10, verticalAlign: 'middle' }}>{ink.symbol}</span>}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="answer-grid" style={{ gridTemplateColumns: `repeat(${Math.min(s.prompt.options.length, 3)}, 1fr)` }}>
        {s.prompt.options.map((c, i) => (
          <button key={c} className="answer" onClick={() => pick(c)} style={{ background: DASH_COLOURS[c].hex, color: '#140814', borderColor: 'transparent', fontFamily: 'var(--font-display)' }} aria-label={DASH_COLOURS[c].name.toLowerCase()}>
            <span className="k" style={{ background: 'rgba(0,0,0,.18)', color: '#140814' }}>{i + 1}</span>{cb ? DASH_COLOURS[c].symbol : ''}
          </button>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={cb} onChange={(e) => { setCb(e.target.checked); try { localStorage.setItem('pz-cb', e.target.checked ? '1' : '0'); } catch { /* ignore */ } }} />Colour-blind symbols</label>
    </>
  );
}
