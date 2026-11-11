import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCtl, Hud } from '../runtime';
import { sfx } from '../../lib/sound';
import { Icon } from '../../components/Icon';

export default function WordLadder() {
  const ctl = useCtl();
  const v = ctl.view as { idx: number; total: number; start: string; target: string; optimal: number; path: string[]; score: number; msg: string; over: boolean; done: { steps: number; optimal: number; gaveUp: boolean }[] };
  const [w, setW] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const len = v.start.length;
  const cur = v.path[v.path.length - 1];
  const submit = async () => {
    if (w.length !== len) return;
    const idx = v.idx, n = v.path.length;
    try {
      const r = await ctl.act({ type: 'word', w });
      if (r.view.idx > idx) sfx.win(); else if (r.view.path.length > n) sfx.good(); else sfx.bad();
      setW('');
    } catch { /* toast */ }
    input.current?.focus();
  };
  return (
    <>
      <Hud items={[['Ladder', `${Math.min(v.idx + 1, v.total)}/${v.total}`], ['Score', v.score], ['Steps', v.path.length - 1], ['Best', v.optimal]]} />
      <div className="panel" style={{ width: '100%', maxWidth: 420, display: 'grid', gap: 8, justifyItems: 'center', background: 'linear-gradient(180deg, rgba(125,255,178,.08), transparent)' }}>
        <Rung word={v.target} kind="target" />
        <span className="dim" style={{ fontSize: 12 }}>⋮ {Math.max(0, v.optimal - (v.path.length - 1))}+ steps to go</span>
        {v.path.slice().reverse().map((p, i) => <Rung key={`${p}-${i}`} word={p} kind={i === 0 ? 'current' : 'past'} prev={v.path[v.path.length - 2 - i]} />)}
      </div>
      <form className="row" style={{ width: '100%', maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input ref={input} className="input" style={{ textTransform: 'uppercase', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '0.3em' }} value={w} maxLength={len}
          onChange={(e) => setW(e.target.value.toLowerCase().replace(/[^a-z]/g, ''))} placeholder={cur.toUpperCase()} aria-label={`Next word, ${len} letters, one letter different from ${cur}`} autoComplete="off" autoCapitalize="off" />
        <button className="btn btn-primary" disabled={w.length !== len || ctl.busy}>Climb</button>
      </form>
      {v.msg && <span className="chip" aria-live="polite">{v.msg}</span>}
      <div className="row">
        <button className="btn" onClick={() => ctl.act({ type: 'undo' }).catch(() => undefined)} disabled={v.path.length < 2}><Icon name="undo" />Undo</button>
        <button className="btn btn-ghost" onClick={() => ctl.act({ type: 'giveup' }).catch(() => undefined)}>Show a route & skip</button>
      </div>
    </>
  );
}

function Rung({ word, kind, prev }: { word: string; kind: 'target' | 'current' | 'past'; prev?: string }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="row" style={{ gap: 6 }}>
      {word.split('').map((ch, i) => (
        <span key={i} className="center" style={{
          width: 46, height: 50, borderRadius: 10, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, textTransform: 'uppercase',
          background: kind === 'target' ? '#7dffb2' : kind === 'current' ? 'var(--surface-3)' : 'var(--surface)', color: kind === 'target' ? '#0b3a2b' : '#fff',
          outline: prev && prev[i] !== ch ? '2px solid #7dffb2' : undefined,
        }}>{ch}</span>
      ))}
    </motion.div>
  );
}
