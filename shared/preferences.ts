/** Player taste categories (onboarding step 3 and Settings). Used only to order recommendations. */
import { CATALOGUE } from './catalogue';

export const PREF_CATEGORIES = [
  { key: 'puzzle', label: 'Puzzle & logic', icon: 'target', games: ['mind-maze', 'pattern-hunter', 'logic-lock', 'sequence-master', 'grid-genius', 'code-breaker', 'number-rush'] },
  { key: 'word', label: 'Word games', icon: 'quill', games: ['word-duel', 'emoji-decode', 'word-ladder'] },
  { key: 'trivia', label: 'Trivia', icon: 'sparkle', games: ['trivia-clash', 'geo-sprint', 'fact-or-fiction'] },
  { key: 'strategy', label: 'Strategy', icon: 'swords', games: ['chess-blitz', 'territory-wars', 'hex-conquest', 'connect-five', 'tower-tactics'] },
  { key: 'arcade', label: 'Arcade', icon: 'play', games: ['obstacle-sprint', 'block-battle', 'color-dash', 'number-rush'] },
  { key: 'reflex', label: 'Reflex games', icon: 'bolt', games: ['reflex-arena', 'color-dash', 'rhythm-rush'] },
  { key: 'party', label: 'Party games', icon: 'users', games: ['party-chaos', 'trivia-clash', 'memory-duel'] },
  { key: 'multiplayer', label: 'Multiplayer', icon: 'users', games: CATALOGUE.filter((g) => g.env === 'family' && g.formats.some((f) => ['versus', 'teams', 'group', 'race'].includes(f))).map((g) => g.id) },
] as const;
export type PrefKey = (typeof PREF_CATEGORIES)[number]['key'];
export const PREF_KEYS = PREF_CATEGORIES.map((c) => c.key) as readonly string[];

/** 0..n score of how well a game matches a player's chosen categories. */
export function prefScore(gameId: string, prefs: readonly string[]): number {
  return PREF_CATEGORIES.filter((c) => prefs.includes(c.key) && (c.games as readonly string[]).includes(gameId)).length;
}
