/**
 * PLAYZO adaptive music player. Renders the note events from musicTheory.ts with synthesised
 * instruments (FM bells and mallets, detuned analogue pads, filtered basses, a sitar-like pluck,
 * tanpura drone, Rhodes-style keys, brass swells and a full synthesised drum and tabla kit).
 *
 * Timing uses a look-ahead scheduler (notes are queued ~120 ms ahead on the audio clock), so the
 * groove stays tight even when the page is busy. Intensity and urgency change at bar boundaries.
 */
import { bus, prefs, onPrefs, isMuted, musicUnderwater, setDelayTime } from './sound';
import { buildTheme, composeBar, midiToHz, stepSeconds, Theme, NoteEvent } from './musicTheory';

type Bus = NonNullable<ReturnType<typeof bus>>;

interface PlayState { theme: Theme; bar: number; step: number; nextTime: number; intensity: number; urgency: number; timer: number | null; queued: NoteEvent[][]; startedAt: number; gain: GainNode }
let cur: PlayState | null = null;
let paused = false;
const LOOKAHEAD = 0.12, TICK_MS = 25;

/* ---------------- instruments ---------------- */
function adsr(g: GainNode, t: number, peak: number, a: number, d: number, sus: number, rel: number, len: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(peak * sus, t + a, d);
  g.gain.setTargetAtTime(0.0001, t + Math.max(a, len), rel / 3);
}
function osc(b: Bus, type: OscillatorType, f: number, t: number, end: number, detune = 0) {
  const o = b.a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune; o.start(t); o.stop(end); return o;
}
function sends(b: Bus, node: AudioNode, rev: number, del: number) {
  if (rev) { const g = b.a.createGain(); g.gain.value = rev; node.connect(g).connect(b.reverb); }
  if (del) { const g = b.a.createGain(); g.gain.value = del; node.connect(g).connect(b.delay); }
}
function noiseSrc(b: Bus, t: number, dur: number) {
  const s = b.a.createBufferSource(); s.buffer = b.noise; s.start(t, Math.random() * 0.6); s.stop(t + dur + 0.05); return s;
}

function playPad(b: Bus, out: GainNode, kind: string, f: number, t: number, len: number, vel: number) {
  const end = t + len + 1.6;
  const g = b.a.createGain(); adsr(g, t, 0.07 * vel, kind === 'organ' ? 0.05 : 0.7, 0.8, 0.85, 1.2, len);
  const lp = b.a.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = kind === 'glass' ? 3800 : kind === 'organ' ? 2600 : kind === 'drone' ? 900 : 1500; lp.Q.value = 0.6;
  if (kind === 'drone') { // tanpura-like: slow filter shimmer
    const lfo = osc(b, 'sine', 0.18, t, end), lg = b.a.createGain(); lg.gain.value = 500; lfo.connect(lg).connect(lp.frequency);
  }
  const types: [OscillatorType, number, number][] =
    kind === 'glass' ? [['triangle', 1, -5], ['sine', 2, 4]]
    : kind === 'strings' ? [['sawtooth', 1, -9], ['sawtooth', 1, 8], ['sawtooth', 0.5, 0]]
    : kind === 'organ' ? [['square', 1, 0], ['sine', 2, 0], ['sine', 0.5, 0]]
    : kind === 'drone' ? [['sawtooth', 1, -4], ['sawtooth', 1, 5]]
    : [['sawtooth', 1, -7], ['sawtooth', 1, 7], ['triangle', 0.5, 0]];
  for (const [ty, mult, det] of types) osc(b, ty, f * mult, t, end, det).connect(lp);
  lp.connect(g).connect(out); sends(b, g, 0.55, 0);
}
function playBass(b: Bus, out: GainNode, kind: string, f: number, t: number, len: number, vel: number) {
  const end = t + len + 0.3;
  const g = b.a.createGain(); adsr(g, t, 0.2 * vel, 0.006, kind === 'sub' ? 0.4 : 0.12, kind === 'sub' ? 0.8 : 0.4, 0.15, len);
  const lp = b.a.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = kind === 'pulse' || kind === 'octave' ? 6 : 1;
  lp.frequency.setValueAtTime(kind === 'sub' ? 600 : 2400, t); lp.frequency.exponentialRampToValueAtTime(kind === 'sub' ? 400 : 320, t + 0.18);
  osc(b, kind === 'sub' ? 'sine' : kind === 'walking' ? 'triangle' : kind === 'pluck' ? 'sawtooth' : 'square', f, t, end).connect(lp);
  // An octave-up harmonic keeps the bass audible on phone speakers.
  const h = osc(b, 'triangle', f * 2, t, end), hg = b.a.createGain(); hg.gain.value = 0.35; h.connect(hg).connect(lp);
  lp.connect(g).connect(out);
}
function fm(b: Bus, out: GainNode, f: number, t: number, len: number, peak: number, ratio: number, index: number, decay: number, rev: number, del: number) {
  const end = t + decay + 0.1;
  const c = osc(b, 'sine', f, t, end), m = osc(b, 'sine', f * ratio, t, end), mg = b.a.createGain();
  mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + decay);
  m.connect(mg).connect(c.frequency);
  const g = b.a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(decay, len * 0.5));
  c.connect(g).connect(out); sends(b, g, rev, del);
}
function playArp(b: Bus, out: GainNode, kind: string, f: number, t: number, len: number, vel: number) {
  const v = 0.06 * vel;
  if (kind === 'bell') return fm(b, out, f, t, len, v, 3.5, 2, 1.1, 0.5, 0.35);
  if (kind === 'kalimba') return fm(b, out, f, t, len, v * 1.2, 5.4, 1.4, 0.55, 0.4, 0.25);
  if (kind === 'marimba') return fm(b, out, f, t, len, v * 1.3, 4, 1.1, 0.35, 0.25, 0.1);
  const end = t + 0.5;
  const g = b.a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * (kind === 'harpsi' ? 0.8 : 1), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'harpsi' ? 0.35 : 0.22));
  const lp = b.a.createBiquadFilter(); lp.type = kind === 'harpsi' ? 'highpass' : 'lowpass';
  if (kind === 'harpsi') lp.frequency.value = 600; else { lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.2); lp.Q.value = 4; }
  osc(b, kind === 'harpsi' ? 'square' : 'sawtooth', f, t, end).connect(lp);
  if (kind === 'harpsi') osc(b, 'sawtooth', f * 2, t, end, 6).connect(lp);
  lp.connect(g).connect(out); sends(b, g, 0.25, 0.4);
}
function playLead(b: Bus, out: GainNode, kind: string, f: number, t: number, len: number, vel: number, stepDur: number) {
  const dur = len * stepDur;
  const v = 0.07 * vel;
  if (kind === 'bell') return fm(b, out, f, t, dur, v, 3.5, 2.4, 1.4, 0.55, 0.45);
  if (kind === 'keys') return fm(b, out, f, t, dur, v * 1.2, 1, 1.8, Math.max(0.6, dur), 0.4, 0.2); // Rhodes-like
  const end = t + dur + 0.5;
  const g = b.a.createGain(); adsr(g, t, v, kind === 'brass' ? 0.06 : 0.02, 0.2, 0.8, 0.25, dur);
  const vib = osc(b, 'sine', 5.2, t, end), vg = b.a.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.25); vib.connect(vg);
  const lp = b.a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'square' ? 3000 : 5000;
  if (kind === 'sitar') {
    // Sitar-like: bright saw through a resonant band with a meend (pitch glide) into the note.
    const o = osc(b, 'sawtooth', f * 0.94, t, end); o.frequency.exponentialRampToValueAtTime(f, t + 0.09); vg.connect(o.frequency);
    const bp = b.a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 3; bp.Q.value = 3;
    o.connect(bp).connect(lp);
    const o2 = osc(b, 'sawtooth', f, t, end, 9); o2.connect(lp);
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 1.1, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.6, dur));
  } else if (kind === 'flute' || kind === 'whistle') {
    const o = osc(b, 'sine', kind === 'whistle' ? f * 2 : f, t, end); vg.connect(o.frequency); o.connect(lp);
    const n = noiseSrc(b, t, dur), bp = b.a.createBiquadFilter(), ng = b.a.createGain(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2; ng.gain.value = 0.25;
    n.connect(bp).connect(ng).connect(lp);
  } else if (kind === 'brass') {
    const o = osc(b, 'sawtooth', f, t, end), o2 = osc(b, 'sawtooth', f, t, end, 7); vg.connect(o.frequency);
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(3200, t + 0.12); lp.frequency.setTargetAtTime(1800, t + 0.12, 0.2);
    o.connect(lp); o2.connect(lp);
  } else { // square chip lead
    const o = osc(b, 'square', f, t, end); vg.connect(o.frequency); o.connect(lp);
  }
  lp.connect(g).connect(out); sends(b, g, 0.35, 0.35);
}
function playDrum(b: Bus, out: GainNode, voice: string, t: number, vel: number) {
  const noiseThrough = (type: BiquadFilterType, freq: number, q: number, dur: number, peak: number) => {
    const f = b.a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const ng = b.a.createGain(); ng.gain.setValueAtTime(peak * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    noiseSrc(b, t, dur).connect(f).connect(ng).connect(out); return ng;
  };
  const pitched = (f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'sine') => {
    const o = osc(b, type, f0, t, t + dur + 0.05); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
    const pg = b.a.createGain(); pg.gain.setValueAtTime(peak * vel, t); pg.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(pg).connect(out); return pg;
  };
  switch (voice) {
    case 'kick': pitched(150, 42, 0.32, 0.55); noiseThrough('highpass', 3000, 0.7, 0.01, 0.05); break;
    case 'snare': pitched(200, 160, 0.12, 0.12, 'triangle'); sends(b, noiseThrough('bandpass', 1900, 0.8, 0.18, 0.16), 0.3, 0); break;
    case 'clap': for (const d of [0, 0.012, 0.026]) { const f = b.a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; const cg = b.a.createGain(); cg.gain.setValueAtTime(0.12 * vel, t + d); cg.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.09); noiseSrc(b, t + d, 0.1).connect(f).connect(cg).connect(out); sends(b, cg, 0.35, 0); } break;
    case 'hat': noiseThrough('highpass', 8500, 0.7, 0.035, 0.05); break;
    case 'openhat': noiseThrough('highpass', 7500, 0.7, 0.22, 0.04); break;
    case 'shaker': { const f = b.a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 6500; f.Q.value = 1.2; const sg = b.a.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.035 * vel, t + 0.02); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); noiseSrc(b, t, 0.1).connect(f).connect(sg).connect(out); break; }
    case 'brush': { const f = b.a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(5500, t + 0.14); const bg = b.a.createGain(); bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.04 * vel, t + 0.03); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); noiseSrc(b, t, 0.18).connect(f).connect(bg).connect(out); break; }
    case 'tom': sends(b, pitched(190, 95, 0.3, 0.3), 0.3, 0); break;
    case 'dha': pitched(130, 175, 0.4, 0.4); noiseThrough('bandpass', 2500, 2, 0.05, 0.05); break; // bayan + dayan
    case 'tin': sends(b, pitched(540, 520, 0.22, 0.12, 'triangle'), 0.25, 0); break; // dayan ring
    case 'ghe': pitched(85, 135, 0.35, 0.35); break; // bayan with pitch bend
  }
}

function render(b: Bus, out: GainNode, e: NoteEvent, t: number, stepDur: number) {
  const f = midiToHz(e.midi);
  switch (e.voice) {
    case 'pad': return playPad(b, out, e.instrument ?? 'warm', f, t, e.len * stepDur, e.vel);
    case 'bass': return playBass(b, out, e.instrument ?? 'sub', f, t, e.len * stepDur, e.vel);
    case 'arp': return playArp(b, out, e.instrument ?? 'pluck', f, t, e.len * stepDur, e.vel);
    case 'lead': return playLead(b, out, e.instrument ?? 'bell', f, t, e.len, e.vel, stepDur);
    default: return playDrum(b, out, e.voice, t, e.vel);
  }
}

/* ---------------- scheduler ---------------- */
function tick() {
  const b = bus();
  if (!b || !cur) return;
  const s = cur;
  const ahead = b.a.currentTime + LOOKAHEAD;
  while (s.nextTime < ahead) {
    if (s.step === 0) s.queued = bucket(composeBar(s.theme, s.bar, s.intensity, s.urgency));
    const stepDur = stepSeconds(s.theme.tempo, s.urgency);
    const swing = s.step % 2 === 1 ? s.theme.style.swing * stepDur : 0;
    if (!paused) for (const e of s.queued[s.step] ?? []) render(b, s.gain, e, s.nextTime + swing, stepDur);
    s.nextTime += stepDur;
    s.step = (s.step + 1) % 16;
    if (s.step === 0) s.bar++;
  }
}
function bucket(ev: NoteEvent[]) { const out: NoteEvent[][] = Array.from({ length: 16 }, () => []); for (const e of ev) out[e.step].push(e); return out; }

export interface MusicState { playing: boolean; gameId: string | null; style: string | null; tempo: number | null; intensity: number; urgency: number; bar: number; paused: boolean }

export const music = {
  /** Start (or keep playing) the soundtrack for a game. Safe to call repeatedly. */
  play(gameId: string, opts: { intensity?: number; style?: string } = {}) {
    const intensity = opts.intensity ?? 0.6;
    if (cur && cur.theme.gameId === gameId && (!opts.style || cur.theme.style.id === opts.style)) { cur.intensity = intensity; return; }
    music.stop(0.5);
    const theme = buildTheme(gameId, opts.style);
    if (!theme || !prefs.musicOn || isMuted()) { pending = { gameId, opts }; return; }
    const b = bus();
    if (!b) return;
    const g = b.a.createGain();
    g.gain.setValueAtTime(0.0001, b.a.currentTime);
    g.gain.linearRampToValueAtTime(theme.style.level, b.a.currentTime + 1.8);
    g.connect(b.music);
    setDelayTime(stepSeconds(theme.tempo) * 3); // dotted eighth
    cur = { theme, bar: 0, step: 0, nextTime: b.a.currentTime + 0.1, intensity, urgency: 0, timer: null, queued: [], startedAt: b.a.currentTime, gain: g };
    cur.timer = window.setInterval(tick, TICK_MS);
    tick();
    pending = null;
  },
  stop(fade = 0.8) {
    const b = bus();
    const s = cur;
    cur = null; paused = false; pending = null;
    if (!s) return;
    if (s.timer) clearInterval(s.timer);
    if (b) {
      const t = b.a.currentTime;
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setValueAtTime(Math.max(0.0001, s.gain.gain.value), t);
      s.gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
      setTimeout(() => s.gain.disconnect(), (fade + 2) * 1000);
      musicUnderwater(false);
    }
  },
  setIntensity(v: number) { if (cur) cur.intensity = Math.max(0, Math.min(1, v)); },
  setUrgency(v: number) { if (cur) cur.urgency = Math.max(0, Math.min(1, v)); },
  pause() { if (!cur || paused) return; paused = true; musicUnderwater(true); },
  resume() { if (!paused) return; paused = false; musicUnderwater(false); },
  state(): MusicState {
    return { playing: !!cur, gameId: cur?.theme.gameId ?? pending?.gameId ?? null, style: cur?.theme.style.id ?? null, tempo: cur?.theme.tempo ?? null, intensity: cur?.intensity ?? 0, urgency: cur?.urgency ?? 0, bar: cur?.bar ?? 0, paused };
  },
};

// Remember what should be playing while music is off/muted, so turning it on resumes the right theme.
let pending: { gameId: string; opts: { intensity?: number; style?: string } } | null = null;
onPrefs(() => {
  if ((!prefs.musicOn || isMuted()) && cur) { const keep = { gameId: cur.theme.gameId, opts: { intensity: cur.intensity } }; music.stop(0.3); pending = keep; }
  else if (prefs.musicOn && !isMuted() && !cur && pending) { const p = pending; music.play(p.gameId, p.opts); }
});
// Hidden tab: stop scheduling sound (saves battery); the game pauses itself separately.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const b = bus();
    if (!b) return;
    if (document.hidden) b.a.suspend().catch(() => undefined);
    else b.a.resume().catch(() => undefined);
  });
}
// Debug hook for automated browser tests (read-only state).
if (typeof window !== 'undefined') (window as any).__pzMusic = { state: () => music.state() };
