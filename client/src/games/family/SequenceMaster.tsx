import { useEffect, useRef, useState } from 'react';
import { useCtl, Hud, useFrame, useKeys } from '../runtime';
import { SeqState, ROUND_GAP_MS } from '@shared/games/sequenceMaster';
import { sfx } from '../../lib/sound';

const PADS = [{ c: '#8fb3ff', k: '1' }, { c: '#ff7ae0', k: '2' }, { c: '#7dffb2', k: '3' }, { c: '#ffd23f', k: '4' }];

export default function SequenceMaster() {
  const ctl = useCtl();
  const s = ctl.view as SeqState;
  const t = useFrame(!s.over);
  const [pressed, setPressed] = useState<number | null>(null);
  // Playback: derive the lit pad from the engine's own schedule (inputOpensAt).
  const showStart = s.inputOpensAt - s.length * s.stepMs;
  const playing = t < s.inputOpensAt;
  const step = Math.floor((t - showStart) / s.stepMs);
  const lit = playing && t >= showStart && step >= 0 && step < s.length && (t - showStart) % s.stepMs < s.stepMs * 0.7 ? s.seq[step] : null;
  const lastLit = useRef<number | null>(null);
  useEffect(() => { if (lit !== null && lastLit.current !== step) { sfx.pad(lit); lastLit.current = step; } if (lit === null) lastLit.current = playing ? lastLit.current : null; }, [lit, step, playing]);
  const tap = (p: number) => {
    if (playing) return;
    sfx.pad(p);
    setPressed(p); setTimeout(() => setPressed(null), 160);
    const before = s.rounds;
    ctl.record({ pad: p });
    if (s.over) sfx.lose(); else if (s.rounds > before) setTimeout(() => sfx.good(), 120);
  };
  useKeys({ '1': () => tap(0), '2': () => tap(1), '3': () => tap(2), '4': () => tap(3) }, [s.inputIdx, playing, ctl.record]);
  return (
    <>
      <Hud items={[['Length', s.length], ['Score', s.score], ['Rounds', s.rounds], ['Input', playing ? 'watch' : `${s.inputIdx}/${s.length}`]]} />
      <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }} aria-live="polite">{s.over ? 'Sequence broken!' : playing ? (t < showStart ? 'Get ready…' : 'Watch carefully…') : 'Your turn!'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, width: 'min(88vw, 420px)', transform: 'rotate(45deg)', margin: '40px 0' }}>
        {PADS.map((p, i) => {
          const on = lit === i || pressed === i;
          return (
            <button key={i} onClick={() => tap(i)} aria-label={`Pad ${i + 1}`} disabled={playing || s.over}
              style={{ aspectRatio: '1', borderRadius: 24, border: 0, cursor: playing ? 'default' : 'pointer', background: on ? p.c : `color-mix(in srgb, ${p.c} 28%, #0c1430)`, boxShadow: on ? `0 0 50px ${p.c}, inset 0 0 20px #fff` : 'inset 0 0 0 2px rgba(255,255,255,.08)', transition: 'all .12s' }}>
              <span style={{ display: 'inline-block', transform: 'rotate(-45deg)', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: on ? '#0c1430' : 'rgba(255,255,255,.4)' }}>{i + 1}</span>
            </button>
          );
        })}
      </div>
      {!s.over && <span className="dim" style={{ fontSize: 12 }}>Gap between rounds: {ROUND_GAP_MS}ms · step {s.stepMs}ms</span>}
    </>
  );
}
