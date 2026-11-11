/**
 * PLAYZO procedural sound: every effect is synthesised live with the Web Audio API
 * (original sounds, no sample files). Respects the global mute toggle.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem('pz-muted') === '1'; } catch { /* ignore */ }

export function setMuted(m: boolean) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; }
export function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx!.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx!.destination);
  }
  if (ctx!.state === 'suspended') ctx!.resume().catch(() => undefined);
  return ctx;
}
export const out = () => { audio(); return master!; };

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.25, when = 0, slideTo?: number) {
  const a = audio(); if (!a || muted) return;
  const t = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out());
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur: number, gain = 0.15, when = 0, hp = 800) {
  const a = audio(); if (!a || muted) return;
  const t = a.currentTime + when;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = a.createGain(); g.gain.value = gain;
  s.connect(f).connect(g).connect(out());
  s.start(t);
}

export const sfx = {
  tap: () => tone(660, 0.06, 'triangle', 0.12),
  select: () => tone(880, 0.08, 'sine', 0.14),
  good: () => { tone(660, 0.1, 'triangle', 0.18); tone(990, 0.14, 'triangle', 0.16, 0.06); },
  bad: () => { tone(220, 0.18, 'sawtooth', 0.08, 0, 140); },
  coin: () => { tone(1320, 0.08, 'square', 0.07); tone(1760, 0.16, 'square', 0.06, 0.06); },
  flip: () => noise(0.05, 0.12, 0, 2500),
  whoosh: () => noise(0.25, 0.08, 0, 600),
  tick: () => tone(1500, 0.025, 'square', 0.05),
  thud: () => tone(90, 0.15, 'sine', 0.3, 0, 50),
  deal: () => noise(0.04, 0.1, 0, 3000),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.09)),
  fanfare: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.08)),
  lose: () => [440, 370, 311].forEach((f, i) => tone(f, 0.25, 'sine', 0.12, i * 0.12)),
  pad: (i: number) => tone([392, 523.25, 659.25, 783.99][i % 4], 0.32, 'sine', 0.22),
  level: () => [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.35, 'sine', 0.13, i * 0.1)),
  dice: () => { for (let i = 0; i < 6; i++) noise(0.03, 0.12, i * 0.07, 1800); },
  spin: () => { for (let i = 0; i < 18; i++) tone(1200, 0.02, 'square', 0.03, i * (0.05 + i * 0.008)); },
  kick: (when = 0) => tone(120, 0.18, 'sine', 0.5, when, 40),
  hat: (when = 0) => noise(0.04, 0.06, when, 7000),
  note: (freq: number, when = 0, dur = 0.18) => tone(freq, dur, 'sawtooth', 0.05, when),
};
