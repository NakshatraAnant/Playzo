import { useState } from 'react';
import { motion } from 'framer-motion';
import { useCtl, Hud } from '../runtime';
import { sfx } from '../../lib/sound';
import { Icon } from '../../components/Icon';

const GEMS = [
  { c: '#ff5cad', s: 'M50 8 L92 50 L50 92 L8 50Z', n: 'pink diamond' },
  { c: '#5cc8ff', s: 'M50 10 a40 40 0 1 0 .1 0Z', n: 'blue circle' },
  { c: '#ffd23f', s: 'M50 6 L61 38 L94 38 L67 58 L78 92 L50 71 L22 92 L33 58 L6 38 L39 38Z', n: 'yellow star' },
  { c: '#7dffb2', s: 'M14 14 h72 v72 h-72Z', n: 'green square' },
  { c: '#ff8a5c', s: 'M50 8 L90 86 L10 86Z', n: 'orange triangle' },
  { c: '#b48aff', s: 'M30 10 h40 l22 40 l-22 40 h-40 l-22-40Z', n: 'violet hexagon' },
];
const Gem = ({ k, size = 34 }: { k: number; size?: number }) => <svg viewBox="0 0 100 100" width={size} height={size}><path d={GEMS[k].s} fill={GEMS[k].c} stroke="rgba(0,0,0,.3)" strokeWidth={4} /></svg>;

export default function CodeBreaker() {
  const ctl = useCtl();
  const v = ctl.view as { len: number; colours: number; guesses: { g: number[]; exact: number; partial: number }[]; max: number; solved: boolean; over: boolean; secret: number[] | null };
  const [cur, setCur] = useState<number[]>([]);
  const add = (k: number) => { if (cur.length < v.len) { setCur([...cur, k]); sfx.tap(); } };
  const submit = async () => {
    if (cur.length !== v.len) return;
    try {
      const r = await ctl.act({ type: 'guess', g: cur });
      setCur([]);
      const last = r.view.guesses[r.view.guesses.length - 1];
      last.exact === v.len ? sfx.fanfare() : last.exact || last.partial ? sfx.good() : sfx.flip();
    } catch { /* toast shown */ }
  };
  const rows = Array.from({ length: v.max }, (_, i) => v.guesses[i] ?? null);
  return (
    <>
      <Hud items={[['Guesses', `${v.guesses.length}/${v.max}`], ['Code', `${v.len} gems`], ['Colours', v.colours]]} />
      <div className="panel" style={{ width: '100%', maxWidth: 460, padding: 14, display: 'grid', gap: 8 }}>
        <div className="row" style={{ justifyContent: 'center', gap: 10, padding: 8, borderRadius: 12, background: 'rgba(0,0,0,.35)' }} aria-label="Secret code">
          {(v.secret ?? Array(v.len).fill(-1)).map((k, i) => k >= 0 ? <motion.div key={i} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ delay: i * 0.12 }}><Gem k={k} /></motion.div> : <span key={i} className="center" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)' }}><Icon name="lock" size={16} /></span>)}
        </div>
        {rows.map((r, i) => (
          <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '6px 10px', borderRadius: 12, background: i === v.guesses.length && !v.over ? 'var(--surface-2)' : 'transparent', opacity: r || i === v.guesses.length ? 1 : 0.35 }}>
            <span className="dim mono" style={{ width: 20 }}>{i + 1}</span>
            <div className="row" style={{ gap: 8 }}>
              {Array.from({ length: v.len }, (_, k) => {
                const g = r ? r.g[k] : i === v.guesses.length ? cur[k] : undefined;
                return g !== undefined ? <Gem key={k} k={g} size={30} /> : <span key={k} style={{ width: 30, height: 30, borderRadius: 15, border: '2px dashed var(--line-2)' }} />;
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 10px)', gap: 3, width: 36 }} aria-label={r ? `${r.exact} exact, ${r.partial} partial` : undefined}>
              {r && [...Array(r.exact).fill('#ffd23f'), ...Array(r.partial).fill('#d8dbe8'), ...Array(v.len - r.exact - r.partial).fill('rgba(255,255,255,.08)')].map((c, k) => <i key={k} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />)}
            </div>
          </div>
        ))}
      </div>
      {!v.over && (
        <>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {GEMS.slice(0, v.colours).map((g, k) => <button key={k} className="btn icon-btn" style={{ width: 54, height: 54 }} onClick={() => add(k)} aria-label={`Add ${g.n}`}><Gem k={k} /></button>)}
          </div>
          <div className="row">
            <button className="btn" onClick={() => setCur(cur.slice(0, -1))} disabled={!cur.length}><Icon name="undo" />Back</button>
            <button className="btn btn-primary" onClick={submit} disabled={cur.length !== v.len || ctl.busy}>Submit guess</button>
          </div>
        </>
      )}
      <p className="dim" style={{ fontSize: 13 }}>Gold peg = right gem, right place · Silver = right gem, wrong place</p>
    </>
  );
}
