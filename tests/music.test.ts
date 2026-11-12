/** Procedural soundtrack: every game has its own theme, music is in key, adaptive, and Lounge audio stays restrained. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CATALOGUE } from '../shared/catalogue';
import { GAME_STYLE, STYLES, SCALES, buildTheme, composeBar, layersFor, stepSeconds, INTENSITY_CAP } from '../client/src/lib/musicTheory';

const IDS = CATALOGUE.map((g) => g.id);

describe('soundtrack catalogue', () => {
  it('assigns a music style to every one of the 50 games', () => {
    expect(IDS).toHaveLength(50);
    for (const id of IDS) expect(GAME_STYLE[id], id).toBeTruthy();
    for (const s of Object.values(GAME_STYLE)) if (s !== 'none') expect(STYLES[s], s).toBeTruthy();
    // Only Rhythm Rush plays its own beat-matched track.
    expect(Object.entries(GAME_STYLE).filter(([, s]) => s === 'none').map(([k]) => k)).toEqual(['rhythm-rush']);
  });
  it('themes are deterministic per game and unique across games', () => {
    const fingerprints = new Set<string>();
    for (const id of IDS) {
      const a = buildTheme(id), b = buildTheme(id);
      if (!a) continue;
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      fingerprints.add(JSON.stringify([a.style.id, a.root, a.tempo, a.motif, a.progression]));
    }
    expect(fingerprints.size).toBe(49);
  });
  it('Lounge themes are quieter and never reach the "excited" lead layer', () => {
    for (const g of CATALOGUE.filter((x) => x.env === 'lounge')) {
      const t = buildTheme(g.id)!;
      expect(t.style.level, g.id).toBeLessThanOrEqual(0.55);
      expect(layersFor(t, 1).lead, g.id).toBe(false);
    }
  });
});

describe('composition', () => {
  it('pitched notes stay in the key of the theme (except chromatic walking-bass approach notes)', () => {
    for (const id of IDS) {
      const t = buildTheme(id);
      if (!t) continue;
      const pcs = new Set(SCALES[t.style.mode].map((x) => (x + t.root) % 12));
      for (let bar = 0; bar < 16; bar++) for (const e of composeBar(t, bar, 1, 0)) {
        if (!['pad', 'arp', 'lead', 'bass'].includes(e.voice)) continue;
        if (e.voice === 'bass' && t.style.bass === 'walking' && e.step === 12) continue;
        if (e.voice === 'pad' && t.style.pad === 'drone') continue; // drone uses root and fifth
        expect(pcs.has(e.midi % 12), `${id} ${e.voice} midi ${e.midi}`).toBe(true);
        expect(e.midi).toBeGreaterThanOrEqual(24);
        expect(e.midi).toBeLessThanOrEqual(100);
        expect(e.step).toBeGreaterThanOrEqual(0);
        expect(e.step).toBeLessThan(16);
      }
    }
  });
  it('adds layers as intensity rises (pad → bass → drums/arp → lead)', () => {
    const t = buildTheme('tower-tactics')!;
    const voices = (i: number) => new Set(Array.from({ length: 8 }, (_, b) => composeBar(t, b, i)).flat().map((e) => e.voice));
    expect([...voices(0.1)]).toEqual(['pad']);
    expect(voices(0.3).has('bass')).toBe(true);
    expect(voices(0.3).has('kick')).toBe(false);
    expect(voices(0.6).has('kick')).toBe(true);
    expect(voices(0.6).has('arp')).toBe(true);
    expect(voices(0.6).has('lead')).toBe(false);
    expect(voices(1).has('lead')).toBe(true);
  });
  it('urgency doubles the hats and speeds the tempo slightly', () => {
    const t = buildTheme('geo-sprint')!;
    const hats = (u: number) => composeBar(t, 1, 1, u).filter((e) => e.voice === 'hat').length;
    expect(hats(1)).toBeGreaterThan(hats(0));
    expect(stepSeconds(t.tempo, 1)).toBeLessThan(stepSeconds(t.tempo, 0));
  });
  it('memory games keep the music to pad and bass so it never competes with the tones to remember', () => {
    for (const id of Object.keys(INTENSITY_CAP)) {
      const t = buildTheme(id)!;
      expect(layersFor(t, 1).lead, id).toBe(false);
    }
    expect(layersFor(buildTheme('sequence-master')!, 1).arp).toBe(false);
  });
});

describe('responsible Lounge audio (source checks)', () => {
  const dir = path.resolve('client/src/games/lounge');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'));
  it('never plays the escalating fanfare in the Lounge', () => {
    for (const f of files) expect(fs.readFileSync(path.join(dir, f), 'utf8'), f).not.toContain('sfx.fanfare');
  });
  it('returns smaller than the stake sound neutral, not like a win', () => {
    const slots = fs.readFileSync(path.join(dir, 'Slots.tsx'), 'utf8');
    expect(slots).toMatch(/total > b \? sfx\.win\(\) : r\.view\.last\.total \? sfx\.neutral\(\)/);
    for (const f of ['Roulette.tsx', 'SicBo.tsx']) expect(fs.readFileSync(path.join(dir, f), 'utf8'), f).toMatch(/sfx\.neutral\(\)/);
  });
});
