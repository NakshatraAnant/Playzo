import { useEffect, useRef, useState } from 'react';
import { useCtl, Hud } from '../runtime';
import { TowerState, TOWERS, TowerKind, COLS, ROWS, PATH_CELLS, canBuild, beginWave, stepWave, pointAt, WAVES, TICK_HZ } from '@shared/games/towerTactics';
import { sfx } from '../../lib/sound';

const TCOL: Record<TowerKind, string> = { spark: '#ffe066', frost: '#7cf3ff', boom: '#ff8a5c' };

export default function TowerTactics() {
  const ctl = useCtl();
  const s = ctl.view as TowerState;
  const [pick, setPick] = useState<{ x: number; y: number } | null>(null);
  const [anim, setAnim] = useState<TowerState | null>(null);
  const [speed, setSpeed] = useState(2);
  const canvas = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<TowerState | null>(null);

  const startWave = () => {
    if (anim) return;
    // Animate a copy with the exact same deterministic simulation the server will replay.
    const copy: TowerState = JSON.parse(JSON.stringify(s));
    beginWave(copy);
    animRef.current = copy;
    setAnim(copy);
    sfx.whoosh();
  };
  useEffect(() => {
    if (!anim) return;
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (t: number) => {
      acc += (t - last) * speed; last = t;
      const st = animRef.current!;
      let done = false;
      while (acc >= 1000 / TICK_HZ && !done) { done = stepWave(st); acc -= 1000 / TICK_HZ; }
      draw(st);
      if (done) {
        ctl.record({ type: 'wave' });
        setAnim(null);
        s.over ? (s.shields > 0 ? sfx.fanfare() : sfx.lose()) : sfx.good();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, speed]);
  useEffect(() => { if (!anim) draw(s); });

  function draw(st: TowerState) {
    const c = canvas.current; if (!c) return;
    const g = c.getContext('2d')!;
    const W = c.width, U = W / COLS;
    g.clearRect(0, 0, W, c.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const path = PATH_CELLS.has(`${x},${y}`);
      g.fillStyle = path ? '#6b5636' : (x + y) % 2 ? '#22381a' : '#26401d';
      g.fillRect(x * U, y * U, U, U);
      if (pick && pick.x === x && pick.y === y) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(x * U + 2, y * U + 2, U - 4, U - 4); }
    }
    // crystal
    g.fillStyle = '#9dff6b'; g.shadowColor = '#9dff6b'; g.shadowBlur = 20;
    g.beginPath(); g.moveTo(11.9 * U, 6.1 * U); g.lineTo(12.3 * U, 6.5 * U); g.lineTo(11.9 * U, 7 * U); g.lineTo(11.5 * U, 6.5 * U); g.fill(); g.shadowBlur = 0;
    for (const t of st.towers) {
      const cx = t.x * U + U / 2, cy = t.y * U + U / 2;
      g.fillStyle = '#2b3442'; g.beginPath(); g.arc(cx, cy, U * 0.42, 0, Math.PI * 2); g.fill();
      g.fillStyle = TCOL[t.kind]; g.beginPath(); g.arc(cx, cy, U * 0.26, 0, Math.PI * 2); g.fill();
      if (pick && pick.x === t.x && pick.y === t.y) { g.strokeStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(cx, cy, TOWERS[t.kind].range * U, 0, Math.PI * 2); g.stroke(); }
    }
    if (st.sim) {
      for (const e of st.sim.enemies) {
        if (!e.alive || st.sim.tick < e.spawnAt) continue;
        const [x, y] = pointAt(e.d);
        const r = e.kind === 'boss' ? U * 0.42 : e.kind === 'brute' ? U * 0.3 : U * 0.2;
        g.fillStyle = e.slow ? '#7cf3ff' : e.kind === 'boss' ? '#b04aff' : '#5a2a7a'; g.beginPath(); g.arc(x * U, y * U, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ff4d6d'; g.fillRect(x * U - r, y * U - r - 6, 2 * r, 3);
        g.fillStyle = '#3ddc97'; g.fillRect(x * U - r, y * U - r - 6, 2 * r * Math.max(0, e.hp / e.max), 3);
      }
      for (const sh of st.sim.shots) { g.strokeStyle = TCOL[sh.kind]; g.lineWidth = sh.kind === 'boom' ? 3 : 2; g.beginPath(); g.moveTo(sh.from[0] * U, sh.from[1] * U); g.lineTo(sh.to[0] * U, sh.to[1] * U); g.stroke(); }
    }
  }

  const cellClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (anim) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * COLS), y = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS);
    setPick({ x, y }); sfx.tap();
  };
  const build = (kind: TowerKind) => {
    if (!pick) return;
    if (ctl.record({ type: 'build', x: pick.x, y: pick.y, kind })) { sfx.coin(); setPick(null); } else sfx.bad();
  };
  const view = anim ?? s;
  return (
    <>
      <Hud items={[['Wave', `${Math.min(s.wave + (anim ? 1 : 0), WAVES)}/${WAVES}`], ['Shields', view.shields], ['Gems', view.gems], ['Score', s.score]]} />
      <div className="board-wrap" style={{ maxWidth: 720 }}>
        <canvas ref={canvas} width={720} height={480} onClick={cellClick} style={{ width: '100%', borderRadius: 16, cursor: anim ? 'default' : 'pointer', boxShadow: 'var(--sh-2)' }} aria-label="Battlefield. Tap a grass tile to build." role="img" />
      </div>
      {!anim && pick && canBuild(s, pick.x, pick.y) && (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {(Object.keys(TOWERS) as TowerKind[]).map((k) => (
            <button key={k} className="btn" disabled={s.gems < TOWERS[k].cost} onClick={() => build(k)} style={{ borderColor: TCOL[k] }}>
              <i style={{ width: 12, height: 12, borderRadius: 6, background: TCOL[k], display: 'inline-block' }} />{TOWERS[k].label} · {TOWERS[k].cost}
            </button>
          ))}
        </div>
      )}
      {!anim && pick && !canBuild(s, pick.x, pick.y) && <span className="chip warn">Can't build on the path or an existing tower</span>}
      <div className="row">
        <button className="btn btn-primary btn-lg" onClick={startWave} disabled={!!anim || s.over}>{anim ? `Wave ${s.wave + 1} in progress…` : `Start wave ${s.wave + 1}`}</button>
        <div className="seg" role="group" aria-label="Simulation speed">{[1, 2, 4].map((x) => <button key={x} className={speed === x ? 'on' : ''} onClick={() => setSpeed(x)}>{x}x</button>)}</div>
      </div>
      <p className="dim" style={{ fontSize: 12, textAlign: 'center', maxWidth: 560 }}>Spark: fast single shots · Frost: slows · Boom: splash. The battle is a deterministic simulation the server replays to verify your score.</p>
    </>
  );
}
