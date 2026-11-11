import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCtl, Hud, TimeBar, useServerTick, playerName } from '../runtime';
import { sfx } from '../../lib/sound';
import { Icon } from '../../components/Icon';

const hexPts = (r: number) => Array.from({ length: 6 }, (_, i) => { const t = (Math.PI / 3) * i; return `${50 + r * Math.cos(t)},${50 + r * Math.sin(t)}`; }).join(' ');

export default function WordDuel() {
  const ctl = useCtl();
  const v = ctl.view as { letters: string[]; centre: string; start: number; endsAt: number; over: boolean; mine: string[]; scores: Record<string, number>; msg: string; counts: Record<string, number>; all?: Record<string, string[]> };
  const now = useServerTick(v.endsAt, !v.over);
  const [word, setWord] = useState('');
  const [shuffle, setShuffle] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const outer = useMemo(() => {
    const o = v.letters.filter((l) => l !== v.centre);
    for (let i = o.length - 1; i > 0; i--) { const j = (i * 7 + shuffle * 3) % (i + 1); [o[i], o[j]] = [o[j], o[i]]; }
    return o;
  }, [v.letters, v.centre, shuffle]);
  const left = Math.max(0, v.endsAt - now), total = v.endsAt - v.start;
  const started = now >= v.start;
  const submit = async () => {
    if (word.length < 1) return;
    const w = word;
    setWord('');
    try {
      const r = await ctl.act({ type: 'word', w });
      if (ctl.room) return;
      (r?.view?.msg ?? '').startsWith('+') || (r?.view?.msg ?? '').startsWith('Pangram') ? sfx.coin() : sfx.bad();
    } catch { /* toast */ }
    input.current?.focus();
  };
  const pos = [[50, 20], [76, 35], [76, 65], [50, 80], [24, 65], [24, 35]];
  const myScore = v.scores[ctl.me] ?? 0;
  return (
    <>
      <Hud items={[['Time', Math.ceil(left / 1000)], ['Score', myScore], ['Words', v.mine.length], ...(Object.keys(v.scores).length > 1 ? Object.entries(v.scores).filter(([p]) => p !== ctl.me).map(([p, s]) => [playerName(ctl, p), `${s} · ${v.counts[p]}w`] as [string, string]) : [])]} />
      <div className="board-wrap"><TimeBar frac={left / total} /></div>
      {!started && <p className="pulse">Starting…</p>}
      <div style={{ position: 'relative', width: 'min(84vw, 340px)', aspectRatio: '1' }}>
        {[[50, 50, v.centre, true] as const, ...outer.map((l, i) => [pos[i][0], pos[i][1], l, false] as const)].map(([x, y, l, c], i) => (
          <motion.button key={`${l}-${i}-${shuffle}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.03 }}
            onClick={() => { setWord((w) => w + l); sfx.tap(); }} aria-label={`Letter ${l}${c ? ' (centre)' : ''}`}
            style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: '30%', aspectRatio: '1', transform: 'translate(-50%,-50%)', border: 0, background: 'none', cursor: 'pointer', padding: 0 }}>
            <svg viewBox="0 0 100 100" style={{ width: '100%', overflow: 'visible' }}>
              <polygon points={hexPts(48)} fill={c ? '#ffcf33' : '#3a2d00'} stroke="#ffcf33" strokeWidth={3} />
              <text x={50} y={64} textAnchor="middle" fontSize={40} fontWeight={900} fill={c ? '#2a1d00' : '#fff'} fontFamily="Unbounded">{l.toUpperCase()}</text>
            </svg>
          </motion.button>
        ))}
      </div>
      <form className="row" style={{ width: '100%', maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input ref={input} className="input mono" style={{ textTransform: 'uppercase', fontSize: 22, letterSpacing: '0.12em', textAlign: 'center', fontFamily: 'var(--font-display)' }} value={word} maxLength={15}
          onChange={(e) => setWord(e.target.value.toLowerCase().replace(/[^a-z]/g, ''))} placeholder="Type or tap" aria-label="Your word" disabled={v.over || !started} autoComplete="off" autoCapitalize="off" />
        <button className="btn icon-btn" type="button" onClick={() => setWord(word.slice(0, -1))} aria-label="Delete letter"><Icon name="back" /></button>
        <button className="btn btn-primary" type="submit" disabled={v.over || !started || ctl.busy}>Enter</button>
      </form>
      <div className="row" style={{ gap: 8 }}>
        <span className="chip" aria-live="polite">{v.msg || 'Every word needs the gold letter'}</span>
        <button className="btn btn-sm" onClick={() => setShuffle((x) => x + 1)}><Icon name="refresh" size={14} />Shuffle</button>
      </div>
      <div className="row wrap" style={{ maxWidth: 520, justifyContent: 'center', gap: 6 }}>
        {v.mine.slice().reverse().map((w) => <span key={w} className={`chip ${v.letters.every((l) => w.includes(l)) ? 'on' : ''}`} style={{ textTransform: 'uppercase' }}>{w}</span>)}
      </div>
      {v.over && v.all && Object.keys(v.all).length > 1 && (
        <div className="panel" style={{ maxWidth: 520, width: '100%' }}>
          {Object.entries(v.all).map(([p, ws]) => <p key={p} style={{ fontSize: 14 }}><b>{playerName(ctl, p)}:</b> <span className="muted">{ws.join(', ') || '-'}</span></p>)}
        </div>
      )}
    </>
  );
}
