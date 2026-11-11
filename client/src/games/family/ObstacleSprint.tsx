import { useEffect, useRef } from 'react';
import { useCtl, Hud, useKeys } from '../runtime';
import { SprintState, stepFrame, FRAME_MS, PLAYER_W, STAND_H, DUCK_H } from '@shared/games/obstacleSprint';
import { sfx } from '../../lib/sound';

/** Fixed-timestep runner: the canvas advances the exact same physics the server replays. */
export default function ObstacleSprint() {
  const ctl = useCtl();
  const s = ctl.view as SprintState;
  const canvas = useRef<HTMLCanvasElement>(null);
  const ended = useRef(false);
  const accent = ctl.meta.theme.accent;

  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      acc += Math.min(250, now - last); last = now;
      while (acc >= FRAME_MS && !s.dead) { stepFrame(s); acc -= FRAME_MS; if (s.orbsTaken && s.frame % 1 === 0) { /* orb sfx via diff below */ } }
      draw();
      if (s.dead && !ended.current) {
        ended.current = true;
        sfx.lose();
        ctl.record({ a: 'end' }, s.frame * FRAME_MS);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const orbs = useRef(0);
  function draw() {
    const c = canvas.current; if (!c) return;
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height, U = 46, ground = H - 70, camX = s.dist - 2.2;
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#2a1040'); sky.addColorStop(1, '#5a1f4a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,181,71,.85)'; g.beginPath(); g.arc(W * 0.8, 80, 36, 0, Math.PI * 2); g.fill();
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.5 : 0.2;
      g.fillStyle = layer ? '#1a0a2a' : '#2a1340';
      for (let i = -1; i < 12; i++) {
        const bx = ((i * 120 - (s.dist * U * par) % 120) + 120) % (W + 240) - 120;
        const bh = 60 + ((i * 37 + layer * 53) % 90) + layer * 30;
        g.fillRect(bx, ground - bh, 90, bh);
      }
    }
    g.fillStyle = '#12061e'; g.fillRect(0, ground, W, H - ground);
    g.fillStyle = accent; g.fillRect(0, ground, W, 3);
    for (const o of s.obstacles) {
      const x = (o.x - camX) * U;
      if (x < -60 || x > W + 60) continue;
      g.fillStyle = o.kind === 'drone' ? '#ff4d6d' : '#8a7aa8';
      g.fillRect(x, ground - o.y1 * U, o.w * U, (o.y1 - o.y0) * U);
      if (o.kind === 'drone') { g.fillStyle = '#ffe066'; g.fillRect(x + 4, ground - o.y1 * U + 6, 6, 6); }
    }
    for (const orb of s.orbs) {
      if (orb.taken) continue;
      const x = (orb.x - camX) * U;
      g.fillStyle = '#7cf3ff'; g.shadowColor = '#7cf3ff'; g.shadowBlur = 14;
      g.beginPath(); g.arc(x, ground - orb.y * U, 8, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
    }
    const h = s.ducking && s.y === 0 ? DUCK_H : STAND_H;
    const px = (s.dist - camX) * U, py = ground - (s.y + h) * U;
    g.fillStyle = s.dead ? '#888' : accent;
    g.beginPath(); g.roundRect(px, py, PLAYER_W * U, h * U, 10); g.fill();
    g.fillStyle = '#fff'; g.fillRect(px + PLAYER_W * U - 12, py + 8, 6, 6);
    if (s.orbsTaken > orbs.current) { sfx.coin(); orbs.current = s.orbsTaken; }
  }
  const jump = () => { if (!s.dead && s.y === 0) { ctl.record({ a: 'jump' }, s.frame * FRAME_MS); sfx.whoosh(); } };
  const duck = (on: boolean) => { if (!s.dead && s.ducking !== on) ctl.record({ a: on ? 'duck' : 'unduck' }, s.frame * FRAME_MS); };
  useKeys({ ' ': jump, ArrowUp: jump, w: jump }, [s]);
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); duck(true); } };
    const up = (e: KeyboardEvent) => { if (e.key === 'ArrowDown' || e.key === 's') duck(false); };
    addEventListener('keydown', dn); addEventListener('keyup', up);
    return () => { removeEventListener('keydown', dn); removeEventListener('keyup', up); };
  });
  return (
    <>
      <Hud items={[['Distance', Math.floor(s.dist)], ['Orbs', s.orbsTaken], ['Speed', s.speed.toFixed(1)], ['Score', s.score]]} />
      <div className="board-wrap" style={{ maxWidth: 820, position: 'relative', touchAction: 'none', userSelect: 'none' }}>
        <canvas ref={canvas} width={820} height={420} style={{ width: '100%', borderRadius: 18, display: 'block' }} role="img" aria-label="Rooftop runner" />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateRows: '1fr 1fr' }}>
          <button aria-label="Jump" onPointerDown={(e) => { e.preventDefault(); jump(); }} style={{ background: 'transparent', border: 0 }} />
          <button aria-label="Duck (hold)" onPointerDown={(e) => { e.preventDefault(); duck(true); }} onPointerUp={() => duck(false)} onPointerLeave={() => duck(false)} style={{ background: 'transparent', border: 0 }} />
        </div>
      </div>
      <p className="dim" style={{ fontSize: 13 }}>Tap top half / Space to jump · Hold bottom half / ↓ to duck</p>
    </>
  );
}
