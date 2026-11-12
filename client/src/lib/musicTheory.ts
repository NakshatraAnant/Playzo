/**
 * PLAYZO music composition (pure functions, no audio).
 *
 * Every game gets its own original, procedurally composed soundtrack: a style (instrumentation,
 * groove, tempo), a key and mode, a chord progression, and a melodic motif generated from a seed
 * derived from the game id, so each game always plays "its" theme. The renderer (music.ts) turns
 * the note events produced here into sound with the Web Audio API.
 *
 * Music is adaptive: `composeBar(theme, bar, intensity, urgency)` adds layers as intensity rises
 * (pad → bass → drums → arpeggio → lead) and tightens the groove when a timer is running out.
 */
import { SeededRng } from '@shared/rng';

export type PadKind = 'warm' | 'glass' | 'strings' | 'drone' | 'organ';
export type BassKind = 'sub' | 'pulse' | 'walking' | 'pluck' | 'octave';
export type DrumKind = 'lofi' | 'four' | 'breaks' | 'brush' | 'dhol' | 'toms' | 'tabla' | 'shaker' | 'march';
export type ArpKind = 'pluck' | 'bell' | 'harpsi' | 'marimba' | 'kalimba';
export type LeadKind = 'bell' | 'square' | 'flute' | 'sitar' | 'keys' | 'brass' | 'whistle';
export type Mode = 'major' | 'minor' | 'dorian' | 'mixolydian' | 'lydian' | 'phrygian' | 'harmonicMinor' | 'majorPent' | 'minorPent';

export interface Style {
  id: string; label: string; tempo: number; swing: number; mode: Mode; progressions: number[][];
  pad: PadKind | null; bass: BassKind | null; drums: DrumKind | null; arp: ArpKind | null; lead: LeadKind | null;
  /** 0..1 overall level of this style (Lounge styles are deliberately quieter). */
  level: number;
  /** Where the arpeggio sits (octave offset from the chord). */
  arpOctave: number;
  /** Notes per bar for the arpeggio: 8 or 16. */
  arpRate: 8 | 16;
  /** Base brightness of the music low-pass filter in Hz. */
  brightness: number;
}

export const SCALES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  majorPent: [0, 2, 4, 7, 9], minorPent: [0, 3, 5, 7, 10],
};

/* Progressions are scale-degree roots (0-based) per bar of a 4-bar loop. */
const P = {
  pop: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4]],
  minor: [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 4]],
  jazz: [[1, 4, 0, 0], [1, 4, 0, 5], [0, 5, 1, 4]],
  modal: [[0, 0, 6, 6], [0, 3, 0, 3], [0, 6, 3, 0]],
  epic: [[0, 5, 3, 4], [0, 4, 5, 3], [0, 6, 5, 6]],
  drone: [[0, 0, 0, 0], [0, 0, 3, 0], [0, 3, 0, 4]],
};

export const STYLES: Record<string, Style> = {
  lofi:       { id: 'lofi', label: 'Lo-fi study beat', tempo: 82, swing: 0.18, mode: 'dorian', progressions: P.jazz, pad: 'warm', bass: 'sub', drums: 'lofi', arp: 'kalimba', lead: 'keys', level: 0.85, arpOctave: 1, arpRate: 8, brightness: 2600 },
  ambient:    { id: 'ambient', label: 'Ambient focus', tempo: 70, swing: 0, mode: 'lydian', progressions: P.modal, pad: 'glass', bass: 'sub', drums: null, arp: 'bell', lead: null, level: 0.6, arpOctave: 2, arpRate: 8, brightness: 3200 },
  marimba:    { id: 'marimba', label: 'Bright marimba pop', tempo: 112, swing: 0.08, mode: 'major', progressions: P.pop, pad: 'warm', bass: 'pluck', drums: 'shaker', arp: 'marimba', lead: 'whistle', level: 0.85, arpOctave: 1, arpRate: 8, brightness: 5200 },
  gameshow:   { id: 'gameshow', label: 'Quiz-show funk', tempo: 120, swing: 0.1, mode: 'mixolydian', progressions: P.pop, pad: 'organ', bass: 'octave', drums: 'breaks', arp: 'pluck', lead: 'brass', level: 0.85, arpOctave: 1, arpRate: 16, brightness: 6000 },
  world:      { id: 'world', label: 'Adventure explorer', tempo: 104, swing: 0.05, mode: 'majorPent', progressions: P.modal, pad: 'strings', bass: 'pluck', drums: 'toms', arp: 'kalimba', lead: 'flute', level: 0.85, arpOctave: 1, arpRate: 8, brightness: 4800 },
  cinematic:  { id: 'cinematic', label: 'Cinematic strategy', tempo: 92, swing: 0, mode: 'minor', progressions: P.epic, pad: 'strings', bass: 'pulse', drums: 'toms', arp: 'pluck', lead: 'brass', level: 0.8, arpOctave: 1, arpRate: 16, brightness: 3600 },
  baroque:    { id: 'baroque', label: 'Baroque chamber', tempo: 96, swing: 0, mode: 'harmonicMinor', progressions: P.minor, pad: 'strings', bass: 'walking', drums: null, arp: 'harpsi', lead: 'flute', level: 0.75, arpOctave: 1, arpRate: 16, brightness: 5200 },
  synthwave:  { id: 'synthwave', label: 'Neon synthwave', tempo: 118, swing: 0, mode: 'minor', progressions: P.minor, pad: 'glass', bass: 'pulse', drums: 'four', arp: 'pluck', lead: 'square', level: 0.85, arpOctave: 1, arpRate: 16, brightness: 4200 },
  arcade:     { id: 'arcade', label: 'Arcade chiptune', tempo: 138, swing: 0, mode: 'major', progressions: P.pop, pad: null, bass: 'octave', drums: 'breaks', arp: 'pluck', lead: 'square', level: 0.75, arpOctave: 2, arpRate: 16, brightness: 7000 },
  bhangra:    { id: 'bhangra', label: 'Desi party (dhol)', tempo: 124, swing: 0.12, mode: 'mixolydian', progressions: P.drone, pad: 'organ', bass: 'octave', drums: 'dhol', arp: 'pluck', lead: 'sitar', level: 0.85, arpOctave: 1, arpRate: 8, brightness: 5600 },
  epic:       { id: 'epic', label: 'Epic defence', tempo: 108, swing: 0, mode: 'dorian', progressions: P.epic, pad: 'strings', bass: 'pulse', drums: 'march', arp: 'pluck', lead: 'brass', level: 0.85, arpOctave: 1, arpRate: 16, brightness: 4200 },
  // Lounge styles: deliberately calm and low-level; no escalating "excitement" layers.
  loungeJazz: { id: 'loungeJazz', label: 'Velvet lounge jazz', tempo: 96, swing: 0.3, mode: 'dorian', progressions: P.jazz, pad: 'warm', bass: 'walking', drums: 'brush', arp: null, lead: 'keys', level: 0.55, arpOctave: 1, arpRate: 8, brightness: 2800 },
  loungeNoir: { id: 'loungeNoir', label: 'Midnight noir', tempo: 76, swing: 0.25, mode: 'minor', progressions: P.jazz, pad: 'warm', bass: 'walking', drums: 'brush', arp: null, lead: 'keys', level: 0.5, arpOctave: 1, arpRate: 8, brightness: 2200 },
  loungeDesi: { id: 'loungeDesi', label: 'Mehfil (tanpura & tabla)', tempo: 90, swing: 0.1, mode: 'phrygian', progressions: P.drone, pad: 'drone', bass: null, drums: 'tabla', arp: 'pluck', lead: 'sitar', level: 0.55, arpOctave: 1, arpRate: 8, brightness: 3800 },
  loungeEast: { id: 'loungeEast', label: 'Lantern garden', tempo: 84, swing: 0.05, mode: 'minorPent', progressions: P.modal, pad: 'glass', bass: 'sub', drums: 'shaker', arp: 'kalimba', lead: 'flute', level: 0.5, arpOctave: 1, arpRate: 8, brightness: 3600 },
  loungeNeon: { id: 'loungeNeon', label: 'Neon lounge', tempo: 100, swing: 0, mode: 'dorian', progressions: P.minor, pad: 'glass', bass: 'sub', drums: 'lofi', arp: 'bell', lead: null, level: 0.5, arpOctave: 2, arpRate: 8, brightness: 3000 },
  loungeSpace:{ id: 'loungeSpace', label: 'Orbit drift', tempo: 72, swing: 0, mode: 'lydian', progressions: P.modal, pad: 'glass', bass: 'sub', drums: null, arp: 'bell', lead: null, level: 0.5, arpOctave: 2, arpRate: 8, brightness: 3400 },
  loungeTense:{ id: 'loungeTense', label: 'Low pulse', tempo: 88, swing: 0, mode: 'phrygian', progressions: P.drone, pad: 'drone', bass: 'pulse', drums: null, arp: null, lead: null, level: 0.45, arpOctave: 1, arpRate: 8, brightness: 1800 },
  hub:        { id: 'hub', label: 'PLAYZO hub theme', tempo: 98, swing: 0.1, mode: 'mixolydian', progressions: P.pop, pad: 'warm', bass: 'sub', drums: 'lofi', arp: 'kalimba', lead: 'keys', level: 0.5, arpOctave: 1, arpRate: 8, brightness: 3000 },
};

/** Style per game (every one of the 50 games is listed; `none` = the game makes its own music). */
export const GAME_STYLE: Record<string, string> = {
  // Family · Brain & Logic
  'mind-maze': 'lofi', 'pattern-hunter': 'ambient', 'number-rush': 'arcade', 'logic-lock': 'lofi', 'sequence-master': 'ambient', 'grid-genius': 'lofi', 'code-breaker': 'synthwave',
  // Family · Word & Knowledge
  'word-duel': 'marimba', 'trivia-clash': 'gameshow', 'emoji-decode': 'marimba', 'word-ladder': 'lofi', 'geo-sprint': 'world', 'fact-or-fiction': 'gameshow',
  // Family · Strategy
  'territory-wars': 'cinematic', 'hex-conquest': 'cinematic', 'connect-five': 'ambient', 'block-battle': 'arcade', 'tower-tactics': 'epic', 'chess-blitz': 'baroque',
  // Family · Reaction & Party
  'reflex-arena': 'synthwave', 'color-dash': 'arcade', 'memory-duel': 'marimba', 'rhythm-rush': 'none', 'obstacle-sprint': 'synthwave', 'party-chaos': 'bhangra',
  // Lounge (internal QA only until legal clearance)
  'eu-roulette': 'loungeJazz', 'us-roulette': 'loungeJazz', 'fr-roulette': 'loungeNoir', blackjack: 'loungeJazz', 'blackjack-duel': 'loungeNoir', baccarat: 'loungeNoir',
  'sic-bo': 'loungeEast', holdem: 'loungeNoir', omaha: 'loungeNoir', 'teen-patti': 'loungeDesi', 'andar-bahar': 'loungeDesi', 'dragon-tiger': 'loungeEast',
  'three-card-poker': 'loungeJazz', 'video-poker': 'loungeNeon', 'classic-slots': 'loungeNeon', 'adventure-slots': 'loungeEast', 'vault-slots': 'loungeNoir',
  'cosmic-reels': 'loungeSpace', 'neon-fruit': 'loungeNeon', 'mystery-jackpot': 'loungeSpace', plinko: 'loungeNeon', 'dice-arena': 'loungeJazz', 'hi-lo': 'loungeJazz',
  mines: 'loungeTense', 'crash-flight': 'loungeTense',
};

/** Games where melody would interfere with play (memorising tones/patterns) keep the music to pad and bass. */
export const INTENSITY_CAP: Record<string, number> = { 'sequence-master': 0.3, 'pattern-hunter': 0.5, 'memory-duel': 0.6 };

export interface Theme {
  gameId: string; style: Style; root: number; tempo: number; progression: number[]; scale: number[];
  /** Two-bar motif: [step(0..31), scaleDegree, lengthInSteps]. */
  motif: [number, number, number][];
  answer: [number, number, number][];
  arpPattern: number[];
  seed: string;
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Build the deterministic theme for a game (same game → same music, different games → different music). */
export function buildTheme(gameId: string, styleOverride?: string): Theme | null {
  const sid = styleOverride ?? GAME_STYLE[gameId] ?? 'hub';
  if (sid === 'none') return null;
  const style = STYLES[sid];
  const rng = new SeededRng(`music:${gameId}`);
  const scale = SCALES[style.mode];
  // Root between A2 (45) and G#3 (56): spread games across keys.
  const root = 45 + (hash(gameId) % 12);
  const tempo = Math.round(style.tempo * (0.94 + rng.next() * 0.12));
  const progression = style.progressions[rng.int(style.progressions.length)].slice();
  const motif = makeMotif(rng, scale.length);
  // The answer phrase reuses the motif rhythm and resolves toward the tonic.
  const answer = motif.map(([s, d, l], i) => [s, i === motif.length - 1 ? 0 : (d + (rng.next() < 0.5 ? 1 : -1) + scale.length) % (scale.length + 2), l] as [number, number, number]);
  const arpShapes = [[0, 1, 2, 1], [0, 2, 1, 2], [0, 1, 2, 3], [2, 1, 0, 1], [0, 2, 3, 1]];
  return { gameId, style, root, tempo, progression, scale, motif, answer, arpPattern: arpShapes[rng.int(arpShapes.length)], seed: `music:${gameId}` };
}

function makeMotif(rng: SeededRng, degrees: number): [number, number, number][] {
  const rhythms = [[0, 4, 6, 8, 12, 16, 20, 24], [0, 3, 6, 8, 10, 16, 19, 22], [0, 2, 4, 8, 12, 14, 16, 24], [0, 6, 8, 12, 16, 18, 22, 24]];
  const r = rhythms[rng.int(rhythms.length)];
  let d = rng.int(3) * 2; // start on 1, 3 or 5
  return r.map((step, i) => {
    if (i > 0) d = Math.max(0, Math.min(degrees + 2, d + [-2, -1, -1, 1, 1, 2, 0][rng.int(7)]));
    const next = r[i + 1] ?? 32;
    return [step, d, Math.max(1, Math.min(6, next - step))] as [number, number, number];
  });
}

/* ---------------- note events ---------------- */
export type Voice = 'pad' | 'bass' | 'arp' | 'lead' | 'kick' | 'snare' | 'hat' | 'openhat' | 'clap' | 'tom' | 'shaker' | 'brush' | 'dha' | 'tin' | 'ghe';
export interface NoteEvent { voice: Voice; step: number; midi: number; len: number; vel: number; instrument?: string }

const DRUMS: Record<DrumKind, Partial<Record<Voice, number[]>>> = {
  lofi:   { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  four:   { kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], openhat: [14] },
  breaks: { kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], clap: [15] },
  brush:  { brush: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], kick: [0, 8] },
  dhol:   { kick: [0, 3, 6, 8, 11, 14], clap: [4, 12], shaker: [0, 2, 4, 6, 8, 10, 12, 14] },
  toms:   { kick: [0, 8], tom: [6, 10, 14], shaker: [2, 6, 10, 14] },
  tabla:  { dha: [0, 6, 8], tin: [3, 11, 14], ghe: [2, 10], shaker: [4, 12] },
  shaker: { shaker: [0, 2, 4, 6, 8, 10, 12, 14], kick: [0, 8], clap: [12] },
  march:  { kick: [0, 8, 10], snare: [4, 12, 13], tom: [14, 15], hat: [0, 4, 8, 12] },
};

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** Scale degree (can exceed the scale length: wraps up an octave) → MIDI note. */
export function degreeToMidi(t: Theme, degree: number, octave = 0): number {
  const n = t.scale.length;
  const o = Math.floor(degree / n);
  const d = ((degree % n) + n) % n;
  return t.root + 12 * (octave + o) + t.scale[d];
}
export function chordFor(t: Theme, bar: number): number[] {
  const deg = t.progression[bar % t.progression.length] % t.scale.length;
  const triad = t.scale.length === 5 ? [deg, deg + 1, deg + 2] : [deg, deg + 2, deg + 4];
  // Jazz styles voice 7ths; everything else triads.
  if (t.style.id.startsWith('lounge') || t.style.id === 'lofi') triad.push(deg + 6);
  return triad.map((d) => degreeToMidi(t, d, 1));
}

/** Layers enabled at a given intensity (0..1). Lounge styles cap at a calm level by design. */
export function layersFor(t: Theme, intensity: number) {
  let i = t.style.id.startsWith('lounge') ? Math.min(intensity, 0.6) : intensity;
  if (INTENSITY_CAP[t.gameId] !== undefined) i = Math.min(i, INTENSITY_CAP[t.gameId]);
  return { pad: i > 0, bass: i >= 0.25, hats: i >= 0.4, drums: i >= 0.55, arp: i >= 0.55, lead: i >= 0.7 };
}

/** All note events for one bar (16 sixteenth-note steps). Pure and deterministic. */
export function composeBar(t: Theme, bar: number, intensity: number, urgency = 0): NoteEvent[] {
  const L = layersFor(t, intensity);
  const s = t.style;
  const ev: NoteEvent[] = [];
  const chord = chordFor(t, bar);
  const nextChord = chordFor(t, bar + 1);
  const rootMidi = chord[0] - 12;
  if (L.pad && s.pad) for (const m of (s.pad === 'drone' ? [rootMidi, rootMidi + 7, rootMidi + 12] : chord)) ev.push({ voice: 'pad', step: 0, midi: m, len: 16, vel: 0.5, instrument: s.pad });
  if (L.bass && s.bass) {
    const b = rootMidi - 12;
    const pat: [number, number, number][] =
      s.bass === 'sub' ? [[0, b, 6], [10, b, 4]]
      : s.bass === 'pulse' ? [0, 2, 4, 6, 8, 10, 12, 14].map((x) => [x, b, 2])
      : s.bass === 'octave' ? [0, 2, 4, 6, 8, 10, 12, 14].map((x, k) => [x, k % 2 ? b + 12 : b, 2])
      : s.bass === 'pluck' ? [[0, b, 3], [3, b, 2], [6, b + 7, 2], [10, b, 2], [12, b + 12, 3]]
      : /* walking */ [[0, b, 4], [4, chord[1] - 24, 4], [8, chord[2] - 24, 4], [12, nextChord[0] - 24 + (nextChord[0] - 24 > b ? -1 : 1), 4]];
    for (const [step, m, len] of pat) ev.push({ voice: 'bass', step, midi: m, len, vel: 0.8, instrument: s.bass });
  }
  if (s.drums && (L.hats || L.drums)) {
    const kit = DRUMS[s.drums];
    for (const [voice, steps] of Object.entries(kit) as [Voice, number[]][]) {
      const isTime = voice === 'hat' || voice === 'shaker' || voice === 'brush';
      if (!L.drums && !isTime) continue;
      for (const step of steps) ev.push({ voice, step, midi: 0, len: 1, vel: isTime ? (step % 4 === 0 ? 0.7 : 0.45) : 0.9 });
    }
    // Urgency: double-time hats and a fill on the last beat.
    if (urgency > 0 && L.drums) {
      for (let st = 1; st < 16; st += 2) ev.push({ voice: 'hat', step: st, midi: 0, len: 1, vel: 0.35 });
      if (bar % 2 === 1) for (const st of [12, 13, 14, 15]) ev.push({ voice: s.drums === 'tabla' ? 'tin' : 'tom', step: st, midi: 0, len: 1, vel: 0.6 });
    }
  }
  if (L.arp && s.arp) {
    const stepLen = s.arpRate === 16 ? 1 : 2;
    const notes = [...chord, chord[0] + 12];
    for (let k = 0, st = 0; st < 16; k++, st += stepLen) {
      const n = notes[t.arpPattern[k % t.arpPattern.length] % notes.length] + 12 * (s.arpOctave - 1);
      ev.push({ voice: 'arp', step: st, midi: n, len: stepLen, vel: st % 4 === 0 ? 0.65 : 0.45, instrument: s.arp });
    }
  }
  if (L.lead && s.lead) {
    // 8-bar phrase: motif on bars 0-1, answer on bars 4-5, rests elsewhere (space is musical).
    const phraseBar = bar % 8;
    const src = phraseBar < 2 ? t.motif : phraseBar >= 4 && phraseBar < 6 ? t.answer : null;
    if (src) {
      const half = phraseBar % 2;
      for (const [step, deg, len] of src) {
        if (Math.floor(step / 16) !== half) continue;
        ev.push({ voice: 'lead', step: step % 16, midi: degreeToMidi(t, deg, 2), len, vel: 0.7, instrument: s.lead });
      }
    }
  }
  return ev;
}

/** Seconds per sixteenth-note step at a tempo, with urgency speeding things up slightly. */
export const stepSeconds = (tempo: number, urgency = 0) => 60 / (tempo * (1 + 0.08 * urgency)) / 4;
