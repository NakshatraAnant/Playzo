import { useState } from 'react';
import { useCtl, Hud, useFrame, useKeys } from '../runtime';
import { GridState, conflicts } from '@shared/games/gridGenius';
import { sfx } from '../../lib/sound';

export default function GridGenius() {
  const ctl = useCtl();
  const s = ctl.view as GridState;
  const t = useFrame(!s.over);
  const { n, bh, bw, givens } = s.puzzle;
  const [sel, setSel] = useState<number | null>(null);
  const place = (v: number) => {
    if (sel === null || givens[sel]) return;
    const m = s.mistakes;
    if (ctl.record({ i: sel, v })) s.mistakes > m ? sfx.bad() : v ? sfx.tap() : sfx.flip();
    if (s.over) sfx.fanfare();
  };
  const keys: Record<string, () => void> = { Backspace: () => place(0), Delete: () => place(0), '0': () => place(0) };
  for (let v = 1; v <= n; v++) keys[String(v)] = () => place(v);
  keys.ArrowRight = () => setSel((x) => (x === null ? 0 : Math.min(n * n - 1, x + 1)));
  keys.ArrowLeft = () => setSel((x) => (x === null ? 0 : Math.max(0, x - 1)));
  keys.ArrowDown = () => setSel((x) => (x === null ? 0 : Math.min(n * n - 1, x + n)));
  keys.ArrowUp = () => setSel((x) => (x === null ? 0 : Math.max(0, x - n)));
  useKeys(keys, [sel, s.cells, ctl.record]);
  const selR = sel !== null ? Math.floor(sel / n) : -1, selC = sel !== null ? sel % n : -1;
  return (
    <>
      <Hud items={[['Time', `${Math.floor(t / 60000)}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}`], ['Mistakes', s.mistakes], ['Filled', `${s.cells.filter(Boolean).length}/${n * n}`]]} />
      <div className="board-wrap" style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, background: 'var(--accent, #5cc8ff)', gap: 1, padding: 3, borderRadius: 14, ['--accent' as any]: ctl.meta.theme.accent, maxWidth: n === 9 ? 520 : 420 }}>
        {s.cells.map((v, i) => {
          const r = Math.floor(i / n), c = i % n;
          const bad = v && conflicts(s.cells, n, bh, bw, i, v);
          const same = sel !== null && v && s.cells[sel] === v;
          const peer = r === selR || c === selC;
          return (
            <button key={i} onClick={() => { setSel(i); sfx.tap(); }} aria-label={`Row ${r + 1} column ${c + 1}${v ? `, ${v}` : ', empty'}${givens[i] ? ', given' : ''}`}
              style={{
                aspectRatio: '1', border: 0, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: givens[i] ? 900 : 600, fontSize: n === 9 ? 'clamp(14px, 4.4vw, 24px)' : 'clamp(18px, 6vw, 30px)',
                color: bad ? '#ff4d6d' : givens[i] ? '#fff' : '#9fdcff',
                background: sel === i ? 'rgba(92,200,255,.35)' : same ? 'rgba(92,200,255,.18)' : peer ? '#0f2f52' : '#08203a',
                marginRight: (c + 1) % bw === 0 && c < n - 1 ? 2 : 0, marginBottom: (r + 1) % bh === 0 && r < n - 1 ? 2 : 0,
              }}>
              {v || ''}{bad ? <span className="sr-only"> conflict</span> : null}
            </button>
          );
        })}
      </div>
      <div className="row wrap" style={{ justifyContent: 'center', gap: 8, maxWidth: 520 }}>
        {Array.from({ length: n }, (_, k) => <button key={k} className="btn icon-btn" style={{ fontFamily: 'var(--font-display)', fontSize: 18 }} onClick={() => place(k + 1)}>{k + 1}</button>)}
        <button className="btn" onClick={() => place(0)}>Clear</button>
      </div>
    </>
  );
}
