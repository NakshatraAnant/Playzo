import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCtl, Hud, TimeBar, useFrame, useKeys } from '../runtime';
import { RushState, RUSH_DURATION } from '@shared/games/numberRush';
import { sfx } from '../../lib/sound';

export default function NumberRush() {
  const ctl = useCtl();
  const s = ctl.view as RushState;
  const t = useFrame(!s.over);
  const [fb, setFb] = useState<'ok' | 'bad' | null>(null);
  const left = RUSH_DURATION - t;
  useEffect(() => { if (left <= 0 && !s.over) ctl.record({ end: true }, RUSH_DURATION); }, [left, s.over, ctl]);
  const pick = (a: number) => {
    const c = s.correct;
    if (!ctl.record({ a })) return;
    const ok = s.correct > c;
    setFb(ok ? 'ok' : 'bad'); ok ? sfx.good() : sfx.bad();
    setTimeout(() => setFb(null), 220);
  };
  useKeys({ '1': () => pick(0), '2': () => pick(1), '3': () => pick(2), '4': () => pick(3) }, [s.idx, ctl.record]);
  const mult = Math.min(5, 1 + Math.floor(s.streak / 3));
  return (
    <>
      <Hud items={[['Time', Math.max(0, Math.ceil(left / 1000))], ['Score', s.score], ['Streak', s.streak], ['Multiplier', `x${mult}`]]} />
      <div className="board-wrap"><TimeBar frac={left / RUSH_DURATION} /></div>
      <div className="panel center" style={{ width: '100%', maxWidth: 560, minHeight: 170, background: fb === 'ok' ? 'rgba(61,220,151,.12)' : fb === 'bad' ? 'rgba(255,77,109,.12)' : undefined, transition: 'background .2s' }}>
        <AnimatePresence mode="popLayout">
          <motion.div key={s.idx} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -60, opacity: 0 }} transition={{ duration: 0.18 }}
            style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(2.4rem, 10vw, 4rem)', fontVariantNumeric: 'tabular-nums' }}>
            {s.problem.text.replace(' x ', ' × ').replace(' / ', ' ÷ ')} = ?
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="answer-grid">
        {s.problem.options.map((o, i) => <button key={`${s.idx}-${i}`} className="answer mono" style={{ fontSize: 26, fontFamily: 'var(--font-display)' }} onClick={() => pick(i)}><span className="k">{i + 1}</span>{o}</button>)}
      </div>
    </>
  );
}
