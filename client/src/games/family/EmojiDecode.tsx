import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCtl, Hud } from '../runtime';
import { sfx } from '../../lib/sound';

export default function EmojiDecode() {
  const ctl = useCtl();
  const v = ctl.view as { idx: number; total: number; emoji: string | null; hint: string | null; pattern: string; hints: number; score: number; last: { answer: string; correct: boolean; points: number } | null; over: boolean };
  const [guess, setGuess] = useState('');
  const [shake, setShake] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submit = async () => {
    if (!guess.trim()) return;
    const idx = v.idx;
    try {
      const r = await ctl.act({ type: 'guess', text: guess });
      if (r.view.idx > idx) { sfx.good(); setGuess(''); } else { sfx.bad(); setShake(true); setTimeout(() => setShake(false), 400); }
    } catch { /* toast */ }
    input.current?.focus();
  };
  return (
    <>
      <Hud items={[['Puzzle', `${Math.min(v.idx + 1, v.total)}/${v.total}`], ['Score', v.score], ['Hints used', v.hints]]} />
      {v.last && v.last.answer && <span className={`chip ${v.last.correct ? 'ok' : 'warn'}`} aria-live="polite">{v.last.correct ? `Yes! "${v.last.answer}" +${v.last.points}` : `It was "${v.last.answer}"`}</span>}
      <AnimatePresence mode="wait">
        <motion.div key={v.idx} initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: -90, opacity: 0 }} className={`panel center ${shake ? 'shake' : ''}`} style={{ width: '100%', maxWidth: 520, minHeight: 200, gap: 12, background: 'radial-gradient(circle at 50% 30%, rgba(255,210,63,.18), transparent 60%), var(--surface)' }}>
          <div style={{ fontSize: 'clamp(3rem, 14vw, 5.5rem)', letterSpacing: '0.1em' }} role="img" aria-label="Emoji clue">{v.emoji}</div>
          <span className="dim">Hint: {v.hint}</span>
          <div className="mono" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem, 4vw, 1.5rem)', letterSpacing: '0.3em', textTransform: 'uppercase' }} aria-label="Revealed letters">{v.pattern}</div>
        </motion.div>
      </AnimatePresence>
      <form className="row" style={{ width: '100%', maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input ref={input} className="input" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="What do the emojis mean?" maxLength={60} aria-label="Your answer" autoComplete="off" />
        <button className="btn btn-primary" disabled={ctl.busy}>Guess</button>
      </form>
      <div className="row">
        <button className="btn" onClick={() => { sfx.flip(); ctl.act({ type: 'hint' }).catch(() => undefined); }}>Reveal a letter (-30)</button>
        <button className="btn btn-ghost" onClick={() => ctl.act({ type: 'skip' }).catch(() => undefined)}>Skip</button>
      </div>
    </>
  );
}
