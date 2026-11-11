/** Cosmetic catalogue. Cosmetics never affect gameplay, odds or scoring. */
export interface Cosmetic { id: string; kind: 'avatar' | 'frame' | 'theme'; name: string; priceZo: number | null; plusOnly?: boolean; colors: string[] }

const AV: [string, string[]][] = [
  ['Ember', ['#ff7a3d', '#ffd23f']], ['Lagoon', ['#00c2ff', '#6bffd8']], ['Orchid', ['#c86bff', '#ff6bd5']], ['Lime', ['#9dff6b', '#2fd66b']],
  ['Saffron', ['#ff9933', '#ffe066']], ['Glacier', ['#8fb3ff', '#e8f0ff']], ['Nebula', ['#7c3dff', '#ff3df0']], ['Monsoon', ['#1e5bff', '#3dffd0']],
  ['Solar', ['#ff3d6e', '#ffb547']], ['Jade', ['#00a86b', '#b6ff8f']], ['Cosmos', ['#0b1440', '#7cf3ff']], ['Royal', ['#4a0b8f', '#ffcf33']],
];
export const COSMETICS: Cosmetic[] = [
  ...AV.map(([name, colors], i) => ({ id: `orb-${i + 1}`, kind: 'avatar' as const, name: `${name} Orb`, priceZo: i < 6 ? 0 : 150 + (i - 6) * 50, colors })),
  { id: 'frame-bronze', kind: 'frame', name: 'Bronze Ring', priceZo: 100, colors: ['#cd7f32', '#8a5a2b'] },
  { id: 'frame-silver', kind: 'frame', name: 'Silver Ring', priceZo: 250, colors: ['#e3e8ef', '#9aa4b2'] },
  { id: 'frame-gold', kind: 'frame', name: 'Gold Ring', priceZo: 500, colors: ['#ffd56b', '#c99a2e'] },
  { id: 'frame-neon', kind: 'frame', name: 'Neon Pulse', priceZo: 800, colors: ['#ff3df0', '#3dfff0'] },
  { id: 'frame-aurora', kind: 'frame', name: 'Aurora Halo', priceZo: 1200, colors: ['#6bffb8', '#7c3dff', '#ff6bd5'] },
  { id: 'frame-plus', kind: 'frame', name: 'PLAYZO Plus Crown', priceZo: null, plusOnly: true, colors: ['#ffcf33', '#ff7a3d', '#ff3d6e'] },
  { id: 'theme-midnight', kind: 'theme', name: 'Midnight (default)', priceZo: 0, colors: ['#0a0716', '#ff3d8b'] },
  { id: 'theme-aurora', kind: 'theme', name: 'Aurora', priceZo: 300, colors: ['#03151a', '#3dffc0'] },
  { id: 'theme-sunset', kind: 'theme', name: 'Sunset Bazaar', priceZo: 300, colors: ['#1a0a06', '#ff8a3d'] },
  { id: 'theme-ocean', kind: 'theme', name: 'Deep Ocean', priceZo: 300, colors: ['#020b1a', '#3d8bff'] },
  { id: 'theme-royal', kind: 'theme', name: 'Royal Plus', priceZo: null, plusOnly: true, colors: ['#12041f', '#ffcf33'] },
];
export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

export const PLANS = [
  { id: 'plus-monthly', name: 'PLAYZO Plus - Monthly', priceInr: 99, days: 30, perks: ['No sponsored placements', 'Plus-only crown frame & Royal theme', 'Supporter badge'] },
  { id: 'plus-yearly', name: 'PLAYZO Plus - Yearly', priceInr: 899, days: 365, perks: ['Everything in Monthly', 'Two months free'] },
];
