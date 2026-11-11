import { Engine, GameError, Difficulty } from '../engine';
import { SeededRng } from '../rng';

export const COLS = 12, ROWS = 8;
export const TICK_HZ = 20;
export const WAYPOINTS: [number, number][] = [[-1, 1], [3, 1], [3, 5], [7, 5], [7, 2], [10, 2], [10, 6], [12, 6]];
export type TowerKind = 'spark' | 'frost' | 'boom';
export const TOWERS: Record<TowerKind, { cost: number; range: number; dmg: number; cd: number; slow?: number; splash?: number; label: string }> = {
  spark: { cost: 50, range: 2.3, dmg: 3, cd: 6, label: 'Spark' },
  frost: { cost: 60, range: 2.0, dmg: 1, cd: 10, slow: 40, label: 'Frost' },
  boom: { cost: 90, range: 2.6, dmg: 7, cd: 24, splash: 1.2, label: 'Boom' },
};
export const WAVES = 10;

export interface Tower { x: number; y: number; kind: TowerKind; cool: number }
export interface Enemy { id: number; d: number; hp: number; max: number; speed: number; slow: number; kind: 'gloom' | 'brute' | 'boss'; spawnAt: number; alive: boolean; leaked: boolean }
export interface Shot { from: [number, number]; to: [number, number]; kind: TowerKind }
export interface WaveSim { tick: number; enemies: Enemy[]; shots: Shot[]; done: boolean }
export interface TowerState {
  seed: string; difficulty: Difficulty; towers: Tower[]; gems: number; shields: number; wave: number;
  score: number; over: boolean; kills: number; sim: WaveSim | null;
}
export type TowerAction = { t: number; type: 'build'; x: number; y: number; kind: TowerKind } | { t: number; type: 'wave' } | { t: number; type: 'end' };

/* ----- path geometry ----- */
const SEGS = WAYPOINTS.slice(1).map((p, i) => ({ a: WAYPOINTS[i], b: p, len: Math.abs(p[0] - WAYPOINTS[i][0]) + Math.abs(p[1] - WAYPOINTS[i][1]) }));
export const PATH_LEN = SEGS.reduce((t, s) => t + s.len, 0);
export function pointAt(d: number): [number, number] {
  let rem = d;
  for (const s of SEGS) {
    if (rem <= s.len) {
      const f = s.len ? rem / s.len : 0;
      return [s.a[0] + (s.b[0] - s.a[0]) * f + 0.5, s.a[1] + (s.b[1] - s.a[1]) * f + 0.5];
    }
    rem -= s.len;
  }
  const last = WAYPOINTS[WAYPOINTS.length - 1];
  return [last[0] + 0.5, last[1] + 0.5];
}
export const PATH_CELLS: Set<string> = (() => {
  const set = new Set<string>();
  for (const s of SEGS) {
    const dx = Math.sign(s.b[0] - s.a[0]), dy = Math.sign(s.b[1] - s.a[1]);
    let [x, y] = s.a;
    for (let i = 0; i <= s.len; i++) { set.add(`${x},${y}`); x += dx; y += dy; }
  }
  return set;
})();
export const canBuild = (s: TowerState, x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < COLS && y < ROWS && !PATH_CELLS.has(`${x},${y}`) && !s.towers.some((t) => t.x === x && t.y === y);

/* ----- wave simulation ----- */
const HP_MULT: Record<Difficulty, number> = { easy: 0.8, normal: 1, hard: 1.3 };
export function beginWave(s: TowerState): void {
  const w = s.wave + 1;
  const rng = new SeededRng(`${s.seed}::wave-${w}`);
  const count = 6 + 2 * w;
  const enemies: Enemy[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    let kind: Enemy['kind'] = 'gloom';
    if (w % 3 === 0 && i % 4 === 3) kind = 'brute';
    if (w === WAVES && i === count - 1) kind = 'boss';
    const base = (8 + 4 * w + w * w * 0.6) * HP_MULT[s.difficulty];
    const hp = Math.round(kind === 'brute' ? base * 2.5 : kind === 'boss' ? base * 12 : base);
    const speed = (kind === 'gloom' ? 0.08 : kind === 'brute' ? 0.056 : 0.045) * (1 + w * 0.02);
    enemies.push({ id: i, d: 0, hp, max: hp, speed, slow: 0, kind, spawnAt: at, alive: true, leaked: false });
    at += 14 + rng.int(10);
  }
  s.sim = { tick: 0, enemies, shots: [], done: false };
}

/** Advance the current wave by one tick. Returns true when the wave is finished. */
export function stepWave(s: TowerState): boolean {
  const sim = s.sim!;
  if (sim.done) return true;
  sim.tick++;
  sim.shots = [];
  for (const e of sim.enemies) {
    if (!e.alive || sim.tick < e.spawnAt) continue;
    e.d += e.speed * (e.slow > 0 ? 0.5 : 1);
    if (e.slow > 0) e.slow--;
    if (e.d >= PATH_LEN) {
      e.alive = false; e.leaked = true;
      s.shields -= e.kind === 'boss' ? 5 : e.kind === 'brute' ? 2 : 1;
    }
  }
  for (const t of s.towers) {
    if (t.cool > 0) { t.cool--; continue; }
    const spec = TOWERS[t.kind];
    const cx = t.x + 0.5, cy = t.y + 0.5;
    let target: Enemy | null = null;
    for (const e of sim.enemies) {
      if (!e.alive || sim.tick < e.spawnAt) continue;
      const [ex, ey] = pointAt(e.d);
      if (Math.hypot(ex - cx, ey - cy) <= spec.range && (!target || e.d > target.d)) target = e;
    }
    if (!target) continue;
    const tp = pointAt(target.d);
    sim.shots.push({ from: [cx, cy], to: tp, kind: t.kind });
    const hitList = spec.splash
      ? sim.enemies.filter((e) => e.alive && sim.tick >= e.spawnAt && Math.hypot(pointAt(e.d)[0] - tp[0], pointAt(e.d)[1] - tp[1]) <= spec.splash!)
      : [target];
    for (const e of hitList) {
      e.hp -= spec.dmg;
      if (spec.slow) e.slow = spec.slow;
      if (e.hp <= 0 && e.alive) {
        e.alive = false;
        s.kills++;
        s.gems += e.kind === 'boss' ? 60 : e.kind === 'brute' ? 10 : 4 + Math.floor((s.wave + 1) / 3);
      }
    }
    t.cool = spec.cd;
  }
  if (s.shields <= 0 || sim.enemies.every((e) => !e.alive)) sim.done = true;
  if (sim.tick > 20 * 60 * 5) sim.done = true; // safety cap (5 min of wave time)
  return sim.done;
}

export function endWave(s: TowerState): void {
  s.sim = null;
  if (s.shields <= 0) { s.shields = 0; finish(s); return; }
  s.wave++;
  s.score += 100;
  s.gems += 20 + 5 * s.wave;
  if (s.wave >= WAVES) finish(s);
}
function finish(s: TowerState) {
  s.over = true;
  s.score += s.shields * 5 + s.gems;
}

export const towerTactics: Engine<TowerState, TowerAction> = {
  id: 'tower-tactics', rulesVersion: '1.0.0', mode: 'replay', players: { min: 1, max: 1 },
  init(o) {
    return { seed: o.seed ?? 'local', difficulty: o.difficulty, towers: [], gems: 120, shields: 20, wave: 0, score: 0, over: false, kills: 0, sim: null };
  },
  apply(s, a) {
    if (s.over) throw new GameError('Battle finished');
    if (a.type === 'end') { finish(s); return s; }
    if (a.type === 'build') {
      const spec = TOWERS[a.kind];
      if (!spec) throw new GameError('Unknown tower');
      if (!canBuild(s, a.x, a.y)) throw new GameError('Cannot build there');
      if (s.gems < spec.cost) throw new GameError('Not enough gems');
      s.gems -= spec.cost;
      s.towers.push({ x: a.x, y: a.y, kind: a.kind, cool: 0 });
      return s;
    }
    if (a.type === 'wave') {
      beginWave(s);
      while (!stepWave(s)) { /* deterministic full simulation */ }
      endWave(s);
      return s;
    }
    throw new GameError('Unknown action');
  },
  isOver: (s) => s.over,
  result: (s) => ({ scores: { p1: s.score }, summary: { waves: s.wave, shields: s.shields, kills: s.kills, towers: s.towers.length } }),
  view: (s) => s,
  maxDurationMs: () => 60 * 60_000,
};
