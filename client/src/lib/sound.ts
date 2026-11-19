/**
 * PLAYZO audio engine: every sound and every note of music is synthesised live with the Web Audio
 * API (original, no sample files).
 *
 * Mix bus:
 *   music ─► duck ─► tone filter ─┐            ┌─► reverb (generated stereo impulse) ─┐
 *   sfx ──────────────────────────┼─► sends ───┴─► ping-pong delay ─────────────────────┼─► glue compressor ─► master ─► speakers
 *                                 └─────────────────────────────────────────────────────┘
 * Sound effects briefly duck the music so feedback stays readable. Separate music / effects
 * volumes and the global mute are remembered on this device.
 */
let ctx: AudioContext | null = null;
let master: GainNode, comp: DynamicsCompressorNode, musicGain: GainNode, musicDuck: GainNode, musicTone: BiquadFilterNode, sfxGain: GainNode;
let reverbSend: GainNode, delaySend: GainNode, delayL: DelayNode, delayR: DelayNode;
let noiseBuf: AudioBuffer | null = null;

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

let muted = read('pz-muted', '0') === '1';
export const prefs = {
  musicOn: read('pz-music', '1') === '1',
  menuMusic: read('pz-menu-music', '0') === '1',
  musicVol: Number(read('pz-music-vol', '0.55')),
  sfxVol: Number(read('pz-sfx-vol', '0.8')),
};
const listeners = new Set<() => void>();
export const onPrefs = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };
export function setPref<K extends keyof typeof prefs>(k: K, v: (typeof prefs)[K]) {
  prefs[k] = v;
  write({ musicOn: 'pz-music', menuMusic: 'pz-menu-music', musicVol: 'pz-music-vol', sfxVol: 'pz-sfx-vol' }[k], typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  applyLevels();
  listeners.forEach((f) => f());
}
export const isMuted = () => muted;
export function setMuted(m: boolean) { muted = m; applyLevels(); listeners.forEach((f) => f()); }

function applyLevels() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : 0.9, t, 0.05);
  musicGain.gain.setTargetAtTime(prefs.musicOn ? prefs.musicVol * 0.55 : 0, t, 0.08);
  sfxGain.gain.setTargetAtTime(prefs.sfxVol * 0.75, t, 0.05);
}

function impulse(a: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      lp += (x - lp) * (0.35 - 0.25 * (i / len)); // darker tail, like a real room
      d[i] = i < a.sampleRate * 0.012 ? 0 : lp; // short pre-delay
    }
  }
  return buf;
}

export function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    const a: AudioContext = new AC({ latencyHint: 'interactive' });
    ctx = a;
    master = a.createGain();
    comp = a.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.22;
    comp.connect(master).connect(a.destination);
    // Music chain
    musicGain = a.createGain(); musicDuck = a.createGain(); musicTone = a.createBiquadFilter();
    musicTone.type = 'lowpass'; musicTone.frequency.value = 16000; musicTone.Q.value = 0.5;
    musicGain.connect(musicDuck).connect(musicTone).connect(comp);
    // Effects chain
    sfxGain = a.createGain();
    sfxGain.connect(comp);
    // Reverb send
    reverbSend = a.createGain(); reverbSend.gain.value = 1;
    const conv = a.createConvolver(); conv.buffer = impulse(a, 2.6, 2.4);
    const rvRet = a.createGain(); rvRet.gain.value = 0.32;
    reverbSend.connect(conv).connect(rvRet).connect(comp);
    // Ping-pong delay send (filtered feedback)
    delaySend = a.createGain();
    const dl = a.createDelay(1), dr = a.createDelay(1), fb1 = a.createGain(), fb2 = a.createGain(), lpf = a.createBiquadFilter();
    delayL = dl; delayR = dr;
    dl.delayTime.value = 0.36; dr.delayTime.value = 0.36; fb1.gain.value = 0.38; fb2.gain.value = 0.38; lpf.type = 'lowpass'; lpf.frequency.value = 3200;
    const pl = a.createStereoPanner(), pr = a.createStereoPanner(); pl.pan.value = -0.65; pr.pan.value = 0.65;
    const dRet = a.createGain(); dRet.gain.value = 0.22;
    delaySend.connect(lpf).connect(dl);
    dl.connect(pl).connect(dRet); dl.connect(fb1).connect(dr);
    dr.connect(pr).connect(dRet); dr.connect(fb2).connect(dl);
    dRet.connect(musicDuck);
    // 1 s of white noise reused by every drum / texture voice
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyLevels();
  }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => undefined);
  return ctx;
}

/** Bus access for the music renderer. */
export function bus() {
  const a = audio();
  if (!a) return null;
  return { a, music: musicGain, sfx: sfxGain, reverb: reverbSend, delay: delaySend, tone: musicTone, noise: noiseBuf! };
}
export const out = () => { audio(); return sfxGain; };
/** Keep the ping-pong echo in time with the song (dotted eighth). */
export function setDelayTime(seconds: number) {
  if (!ctx) return;
  const v = Math.min(0.9, Math.max(0.1, seconds));
  delayL.delayTime.setTargetAtTime(v, ctx.currentTime, 0.05);
  delayR.delayTime.setTargetAtTime(v, ctx.currentTime, 0.05);
}

let lastDuck = 0;
function duck() {
  if (!ctx || !prefs.musicOn) return;
  const t = ctx.currentTime;
  if (t - lastDuck < 0.08) return;
  lastDuck = t;
  musicDuck.gain.cancelScheduledValues(t);
  musicDuck.gain.setTargetAtTime(0.55, t, 0.01);
  musicDuck.gain.setTargetAtTime(1, t + 0.12, 0.18);
}

/** Pause effect: the music sinks "under water" and quietens; resume brings it back. */
export function musicUnderwater(on: boolean) {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicTone.frequency.cancelScheduledValues(t);
  musicTone.frequency.setTargetAtTime(on ? 420 : 16000, t, on ? 0.12 : 0.25);
  musicDuck.gain.setTargetAtTime(on ? 0.45 : 1, t, 0.15);
}

/* ---------------- effect voices ---------------- */
function env(g: GainNode, t: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.25, when = 0, slideTo?: number, wet = 0.18) {
  const a = audio(); if (!a || muted) return;
  const t = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, gain, 0.008, dur);
  o.connect(g).connect(sfxGain);
  if (wet) { const s = a.createGain(); s.gain.value = wet; g.connect(s).connect(reverbSend); }
  o.start(t); o.stop(t + dur + 0.05);
  duck();
}
/** Two-operator FM bell / mallet. */
function bell(freq: number, dur: number, gain = 0.18, when = 0, ratio = 3.5, index = 2.2, wet = 0.3) {
  const a = audio(); if (!a || muted) return;
  const t = a.currentTime + when;
  const c = a.createOscillator(), m = a.createOscillator(), mg = a.createGain(), g = a.createGain();
  c.frequency.value = freq; m.frequency.value = freq * ratio;
  mg.gain.setValueAtTime(freq * index, t); mg.gain.exponentialRampToValueAtTime(1, t + dur);
  m.connect(mg).connect(c.frequency);
  env(g, t, gain, 0.004, dur);
  c.connect(g).connect(sfxGain);
  const s = a.createGain(); s.gain.value = wet; g.connect(s).connect(reverbSend);
  c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
  duck();
}
function noise(dur: number, gain = 0.15, when = 0, freq = 800, type: BiquadFilterType = 'highpass', q = 0.7, attack = 0.002) {
  const a = audio(); if (!a || muted || !noiseBuf) return;
  const t = a.currentTime + when;
  const s = a.createBufferSource(); s.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); env(g, t, gain, attack, dur);
  s.connect(f).connect(g).connect(sfxGain);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function sweep(dur: number, from: number, to: number, gain = 0.12, when = 0) {
  const a = audio(); if (!a || muted || !noiseBuf) return;
  const t = a.currentTime + when;
  const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const r = a.createGain(); r.gain.value = 0.4;
  s.connect(f).connect(g).connect(sfxGain); g.connect(r).connect(reverbSend);
  s.start(t); s.stop(t + dur + 0.05);
}

const C5 = 523.25;
export const sfx = {
  tap: () => { tone(740, 0.05, 'triangle', 0.1, 0, 680, 0.05); },
  select: () => { bell(880, 0.18, 0.1, 0, 2, 1.2, 0.15); },
  good: () => { bell(C5 * 1.5, 0.22, 0.14, 0, 3, 1.5); bell(C5 * 2, 0.3, 0.12, 0.06, 3, 1.5); },
  bad: () => { tone(233, 0.2, 'sawtooth', 0.06, 0, 155, 0.05); tone(220, 0.22, 'square', 0.03, 0.01, 147, 0); },
  coin: () => { bell(1568, 0.12, 0.08, 0, 5.4, 1.2, 0.12); bell(2093, 0.22, 0.07, 0.06, 5.4, 1.2, 0.2); },
  flip: () => noise(0.05, 0.1, 0, 2600, 'bandpass', 1.2),
  whoosh: () => sweep(0.3, 400, 3200, 0.1),
  tick: () => tone(1500, 0.025, 'square', 0.04, 0, undefined, 0),
  thud: () => { tone(110, 0.18, 'sine', 0.28, 0, 48, 0.1); noise(0.06, 0.05, 0, 900, 'lowpass'); },
  deal: () => { noise(0.05, 0.09, 0, 3200, 'bandpass', 1.5); noise(0.02, 0.05, 0.03, 6000); },
  win: () => [C5, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, 0.42, 0.11, i * 0.08, 3, 1.8)),
  fanfare: () => stinger('victory'),
  lose: () => [440, 392, 329.63].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, i * 0.13, undefined, 0.3)),
  pad: (i: number) => bell([392, 523.25, 659.25, 783.99][i % 4], 0.5, 0.17, 0, 2, 1.4, 0.35),
  level: () => stinger('levelUp'),
  dice: () => { for (let i = 0; i < 6; i++) { noise(0.03, 0.1, i * 0.07, 1800 + i * 200, 'bandpass', 2); tone(900 + i * 40, 0.02, 'square', 0.02, i * 0.07, undefined, 0); } },
  spin: () => { for (let i = 0; i < 18; i++) tone(1300 - i * 20, 0.02, 'square', 0.025, i * (0.05 + i * 0.008), undefined, 0); },
  kick: (when = 0) => { tone(150, 0.2, 'sine', 0.45, when, 42, 0); noise(0.01, 0.06, when, 3000); },
  hat: (when = 0) => noise(0.04, 0.05, when, 8000),
  note: (freq: number, when = 0, dur = 0.18) => bell(freq, dur + 0.1, 0.07, when, 1, 0.8, 0.15),
  riser: () => { sweep(0.65, 300, 6000, 0.12); tone(220, 0.65, 'sawtooth', 0.03, 0, 880, 0.2); },
  count: (last = false) => (last ? bell(1046.5, 0.5, 0.16, 0, 2, 2) : bell(523.25, 0.18, 0.12, 0, 2, 1.5, 0.1)),
  achievement: () => [1318.5, 1568, 2093, 2637].forEach((f, i) => bell(f, 0.5, 0.08, i * 0.06, 5.4, 1.4, 0.4)),
  neutral: () => bell(659.25, 0.25, 0.07, 0, 2, 0.8, 0.15),
};

/** Short musical stingers for results screens. */
export function stinger(kind: 'victory' | 'defeat' | 'complete' | 'levelUp') {
  if (kind === 'victory') {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => bell(f, 0.5, 0.11, i * 0.09, 2, 1.6, 0.35));
    [261.63, 329.63, 392].forEach((f) => tone(f, 1.2, 'sawtooth', 0.025, 0.36, undefined, 0.5));
    bell(1046.5, 1.4, 0.12, 0.36, 3, 2, 0.5);
    noise(1.2, 0.035, 0.36, 7000, 'highpass', 0.7, 0.01); // soft cymbal swell
  } else if (kind === 'defeat') {
    [392, 349.23, 311.13, 261.63].forEach((f, i) => tone(f, 0.45, 'triangle', 0.07, i * 0.16, undefined, 0.4));
  } else if (kind === 'levelUp') {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => bell(f, 0.5, 0.09, i * 0.06, 3.5, 1.8, 0.45));
    sweep(0.5, 800, 8000, 0.06);
  } else {
    bell(659.25, 0.5, 0.1, 0, 2, 1.2, 0.35); bell(987.77, 0.7, 0.1, 0.12, 2, 1.2, 0.35);
  }
}

/** True when the browser is holding audio back until the first tap/click (autoplay policy). */
export function audioBlocked(): boolean {
  return !!ctx && ctx.state === 'suspended' && !document.hidden && !muted;
}
/** Resume audio inside a user gesture. */
export function unlockAudio() {
  const a = audio();
  a?.resume().catch(() => undefined);
}
export function onAudioState(f: () => void) {
  const a = audio();
  if (!a) return () => undefined;
  a.addEventListener('statechange', f);
  return () => a.removeEventListener('statechange', f);
}
