import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { useCtl, Hud, useKeys } from '../runtime';
import { sfx } from '../../lib/sound';
import { Icon } from '../../components/Icon';

export default function FactOrFiction() {
  const ctl = useCtl();
  const v = ctl.view as { idx: number; total: number; statement: string | null; score: number; streak: number; last: { fact: boolean; why: string; correct: boolean; s: string } | null; over: boolean };
  const x = useMotionValue(0);
  const rot = useTransform(x, [-200, 200], [-14, 14]);
  const factO = useTransform(x, [0, 120], [0, 1]);
  const fictO = useTransform(x, [-120, 0], [1, 0]);
  const answer = async (fact: boolean) => {
    if (v.over || ctl.busy) return;
    try {
      const r = await ctl.act({ type: 'answer', fact });
      r.view.last.correct ? sfx.good() : sfx.bad();
    } catch { /* toast */ }
    x.set(0);
  };
  useKeys({ ArrowRight: () => answer(true), ArrowLeft: () => answer(false) }, [v.idx, ctl.busy]);
  const onEnd = (_: unknown, info: PanInfo) => { if (info.offset.x > 110) answer(true); else if (info.offset.x < -110) answer(false); };
  return (
    <>
      <Hud items={[['Card', `${Math.min(v.idx + 1, v.total)}/${v.total}`], ['Score', v.score], ['Streak', v.streak]]} />
      {v.last && (
        <motion.div key={v.idx} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="panel panel-tight" style={{ maxWidth: 520, width: '100%', borderColor: v.last.correct ? 'var(--ok)' : 'var(--bad)' }} aria-live="polite">
          <b style={{ color: v.last.correct ? 'var(--ok)' : 'var(--bad)' }}>{v.last.correct ? 'Correct!' : 'Not quite.'} It's {v.last.fact ? 'FACT' : 'FICTION'}.</b>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>{v.last.why}</p>
        </motion.div>
      )}
      {v.statement && (
        <motion.div key={v.idx} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.9} onDragEnd={onEnd} style={{ x, rotate: rot, width: '100%', maxWidth: 420, touchAction: 'pan-y', cursor: 'grab' }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="panel center" style={{ minHeight: 260, textAlign: 'center', position: 'relative', background: 'linear-gradient(160deg, #24345e, #111a33)', border: '1px solid var(--line-2)' }}>
            <motion.span style={{ opacity: factO, position: 'absolute', top: 16, left: 16 }} className="chip ok">FACT</motion.span>
            <motion.span style={{ opacity: fictO, position: 'absolute', top: 16, right: 16 }} className="chip bad">FICTION</motion.span>
            <p style={{ fontSize: 'clamp(1.1rem, 1rem + 1vw, 1.4rem)', fontWeight: 700, lineHeight: 1.35 }}>{v.statement}</p>
          </div>
        </motion.div>
      )}
      <div className="row">
        <button className="btn btn-lg btn-danger" onClick={() => answer(false)} disabled={ctl.busy}><Icon name="back" />Fiction</button>
        <button className="btn btn-lg" style={{ background: 'rgba(61,220,151,.18)', borderColor: 'rgba(61,220,151,.5)' }} onClick={() => answer(true)} disabled={ctl.busy}>Fact<Icon name="next" /></button>
      </div>
      <p className="dim" style={{ fontSize: 12 }}>Swipe the card, tap a button, or use ← →</p>
    </>
  );
}
