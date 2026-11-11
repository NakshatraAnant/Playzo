import { motion, AnimatePresence } from 'framer-motion';
import { useCtl, Hud, TimeBar, useServerTick, useKeys } from '../runtime';
import { sfx } from '../../lib/sound';
import { useEffect, useRef } from 'react';

export default function GeoSprint() {
  const ctl = useCtl();
  const v = ctl.view as { start: number; endsAt: number; q: { kind: string; prompt: string; flag?: string; options: string[] }; score: number; correct: number; wrong: number; lockedUntil: number; last: any; over: boolean; missedRegions?: Record<string, number> };
  const now = useServerTick(v.endsAt, !v.over);
  const locked = now < v.lockedUntil || now < v.start;
  const pick = (i: number) => { if (!locked && !v.over) ctl.act({ type: 'answer', choice: i }).catch(() => undefined); };
  useKeys({ '1': () => pick(0), '2': () => pick(1), '3': () => pick(2), '4': () => pick(3) }, [v.q, locked]);
  const lastRef = useRef(v.last);
  useEffect(() => { if (v.last && v.last !== lastRef.current) v.last.correct ? sfx.good() : sfx.bad(); lastRef.current = v.last; }, [v.last]);
  const left = Math.max(0, v.endsAt - now);
  return (
    <>
      <Hud items={[['Time', Math.ceil(left / 1000)], ['Score', v.score], ['Correct', v.correct], ['Wrong', v.wrong]]} />
      <div className="board-wrap"><TimeBar frac={left / 60000} /></div>
      {v.last && <span className={`chip ${v.last.correct ? 'ok' : 'bad'}`} aria-live="polite">{v.last.flag} {v.last.correct ? 'Correct' : `Answer: ${v.last.answer}`}</span>}
      <AnimatePresence mode="wait">
        <motion.div key={v.q.prompt + (v.q.flag ?? '')} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.16 }} className="panel center" style={{ width: '100%', maxWidth: 560, minHeight: 150, gap: 8, textAlign: 'center' }}>
          {v.q.flag && <div style={{ fontSize: 84, lineHeight: 1 }} role="img" aria-label="Flag">{v.q.flag}</div>}
          <h3 style={{ fontSize: 'clamp(1.1rem, 1rem + 1vw, 1.45rem)' }}>{now < v.start ? 'Ready…' : v.q.prompt}</h3>
        </motion.div>
      </AnimatePresence>
      <div className="answer-grid" style={{ opacity: locked ? 0.55 : 1 }}>
        {v.q.options.map((o, i) => <button key={o + i} className="answer" disabled={locked} onClick={() => pick(i)}><span className="k">{i + 1}</span>{o}</button>)}
      </div>
    </>
  );
}
