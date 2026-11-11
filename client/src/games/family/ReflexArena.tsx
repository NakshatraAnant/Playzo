import { useEffect } from 'react';
import { useCtl, Hud, TimeBar, useFrame } from '../runtime';
import { ReflexState, REFLEX_DURATION, REFLEX_MIN_MS } from '@shared/games/reflexArena';
import { sfx } from '../../lib/sound';

export default function ReflexArena() {
  const ctl = useCtl();
  const s = ctl.view as ReflexState;
  const t = useFrame(!s.over);
  useEffect(() => { if (t >= REFLEX_DURATION && !s.over) ctl.record({ end: true }, REFLEX_DURATION); }, [t, s.over, ctl]);
  const live = s.targets.filter((g) => t >= g.spawn && t <= g.spawn + g.life && !s.hit.includes(g.id));
  const hit = (id: number) => {
    const tg = s.targets[id];
    if (t < tg.spawn + REFLEX_MIN_MS) return;
    if (ctl.record({ i: id })) tg.decoy ? sfx.bad() : sfx.good();
  };
  return (
    <>
      <Hud items={[['Time', Math.max(0, Math.ceil((REFLEX_DURATION - t) / 1000))], ['Score', s.score], ['Combo', s.combo], ['Hits', s.hits]]} />
      <div className="board-wrap"><TimeBar frac={1 - t / REFLEX_DURATION} /></div>
      <div className="board-wrap" style={{ position: 'relative', aspectRatio: '1', maxWidth: 560, borderRadius: 24, overflow: 'hidden', background: 'radial-gradient(circle at 50% 50%, #003a6a, #000a14 70%)', border: '1px solid rgba(0,229,255,.25)', touchAction: 'manipulation' }}>
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
          {[15, 30, 45].map((r) => <circle key={r} cx={50} cy={50} r={r} fill="none" stroke="rgba(0,229,255,.08)" />)}
        </svg>
        {live.map((g) => {
          const age = (t - g.spawn) / g.life;
          const size = g.r * 2 * (age < 0.15 ? age / 0.15 : 1);
          return (
            <button key={g.id} onPointerDown={(e) => { e.preventDefault(); hit(g.id); }} aria-label={g.decoy ? 'Decoy, do not tap' : 'Target'}
              style={{ position: 'absolute', left: `${g.x}%`, top: `${g.y}%`, width: `${size}%`, aspectRatio: '1', transform: 'translate(-50%,-50%)', borderRadius: '50%', border: 0, padding: 0, cursor: 'crosshair',
                opacity: 1 - Math.max(0, age - 0.7) / 0.3,
                background: g.decoy ? 'radial-gradient(circle, #ff4d6d 30%, #7a0a1a 31%, #7a0a1a 55%, #ff4d6d 56%)' : 'radial-gradient(circle, #fff 18%, #00e5ff 19%, #00e5ff 40%, #003a6a 41%, #003a6a 58%, #00e5ff 59%)',
                boxShadow: g.decoy ? '0 0 20px #ff4d6d' : '0 0 24px #00e5ff' }}>
              {g.decoy && <span style={{ color: '#fff', fontWeight: 900, fontSize: 'clamp(12px, 3vw, 20px)' }}>✕</span>}
            </button>
          );
        })}
      </div>
      <p className="dim" style={{ fontSize: 13 }}>Hit blue targets fast. Avoid red ✕ decoys.</p>
    </>
  );
}
