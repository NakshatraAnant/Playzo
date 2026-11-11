import { useEffect, useRef, useState } from 'react';
import { useCtl, Hud, useKeys } from '../runtime';
import { RhythmState, RHYTHM_DURATION, LEAD_IN, WINDOWS } from '@shared/games/rhythmRush';
import { sfx, audio } from '../../lib/sound';

const LANE_COL = ['#3dd9ff', '#ff3df0', '#ffe066', '#7dffb2'];
const SCALE = [261.63, 311.13, 349.23, 392, 466.16, 523.25]; // C minor pentatonic + octave
const TRAVEL = 1400; // ms a note takes to reach the line

export default function RhythmRush() {
  const ctl = useCtl();
  const s = ctl.view as RhythmState;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [flash, setFlash] = useState<{ lane: number; j: string; at: number } | null>(null);
  const [offset, setOffset] = useState(() => { try { return Number(localStorage.getItem('pz-rhythm-offset') ?? 0); } catch { return 0; } });

  // Procedural backing track scheduled on the audio clock, aligned with the chart.
  useEffect(() => {
    const a = audio(); if (!a) return;
    const beat = 60000 / s.bpm;
    const start = a.currentTime - ctl.elapsed() / 1000;
    const timers: number[] = [];
    for (let b = 0; LEAD_IN + b * beat < RHYTHM_DURATION; b++) {
      const at = start + (LEAD_IN + b * beat) / 1000;
      if (at < a.currentTime) continue;
      const when = at - a.currentTime;
      sfx.kick(when);
      if (b % 2) sfx.hat(when);
      sfx.hat(when + beat / 2000);
      if (b % 4 === 0) sfx.note(SCALE[(b / 4) % SCALE.length] / 2, when, beat / 1000 * 1.8);
    }
    for (const n of s.notes) {
      const at = start + n.t / 1000;
      if (at > a.currentTime) sfx.note(SCALE[(n.lane + (n.id % 3)) % SCALE.length], at - a.currentTime, 0.12);
    }
    return () => { timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const t = ctl.elapsed();
      if (t >= RHYTHM_DURATION && !s.over) { ctl.record({ end: true }, RHYTHM_DURATION); return; }
      const c = canvas.current; if (!c) return;
      const g = c.getContext('2d')!;
      const W = c.width, H = c.height, lineY = H * 0.86;
      g.clearRect(0, 0, W, H);
      for (let l = 0; l < 4; l++) {
        const x0 = (W / 4) * l;
        g.fillStyle = l % 2 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.055)';
        g.fillRect(x0, 0, W / 4, H);
      }
      g.fillStyle = '#fff'; g.globalAlpha = 0.9; g.fillRect(0, lineY - 2, W, 4); g.globalAlpha = 1;
      for (const n of s.notes) {
        const dt = n.t - t;
        if (dt > TRAVEL || dt < -WINDOWS.good - 60) continue;
        const j = s.judged[n.id];
        if (j && j !== 'miss') continue;
        const y = lineY - (dt / TRAVEL) * lineY;
        g.fillStyle = j === 'miss' ? 'rgba(255,255,255,.2)' : LANE_COL[n.lane];
        g.shadowColor = LANE_COL[n.lane]; g.shadowBlur = j === 'miss' ? 0 : 18;
        const x = (W / 4) * n.lane + 10;
        g.beginPath(); g.roundRect(x, y - 12, W / 4 - 20, 24, 12); g.fill();
      }
      g.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [s, ctl]);

  const hit = (lane: number) => {
    const before = { ...s.counts };
    const t = ctl.elapsed() - offset;
    if (!ctl.record({ lane }, Math.max(0, Math.round(t)))) return;
    const j = (['perfect', 'great', 'good'] as const).find((k) => s.counts[k] > before[k]);
    if (j) setFlash({ lane, j, at: performance.now() });
  };
  useKeys({ d: () => hit(0), f: () => hit(1), j: () => hit(2), k: () => hit(3) }, [s, offset]);
  const total = s.notes.length;
  return (
    <>
      <Hud items={[['Score', s.score.toLocaleString()], ['Combo', s.combo], ['Perfect', s.counts.perfect], ['Miss', s.counts.miss]]} />
      <div className="board-wrap" style={{ position: 'relative', maxWidth: 480 }}>
        <canvas ref={canvas} width={480} height={560} style={{ width: '100%', borderRadius: 18, background: 'linear-gradient(180deg, #12052a, #2a0a3d)', display: 'block' }} aria-label={`Rhythm lanes, ${total} notes`} role="img" />
        {flash && performance.now() - flash.at < 400 && <div className="pop-in" style={{ position: 'absolute', top: '62%', left: `${flash.lane * 25 + 12.5}%`, transform: 'translateX(-50%)', fontFamily: 'var(--font-display)', fontWeight: 900, color: LANE_COL[flash.lane], textTransform: 'uppercase', fontSize: 14 }}>{flash.j}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
          {['D', 'F', 'J', 'K'].map((k, i) => (
            <button key={k} onPointerDown={(e) => { e.preventDefault(); hit(i); }} className="btn" style={{ minHeight: 70, borderRadius: 16, borderColor: LANE_COL[i], fontFamily: 'var(--font-display)', fontSize: 18, touchAction: 'manipulation' }} aria-label={`Lane ${i + 1}`}>{k}</button>
          ))}
        </div>
      </div>
      <label className="row dim" style={{ fontSize: 13 }}>Audio offset
        <input type="range" min={-120} max={120} step={10} value={offset} onChange={(e) => { const v = Number(e.target.value); setOffset(v); try { localStorage.setItem('pz-rhythm-offset', String(v)); } catch { /* ignore */ } }} aria-label="Audio offset in milliseconds" />
        <span className="mono">{offset}ms</span>
      </label>
    </>
  );
}
