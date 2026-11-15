/**
 * Generates docs/games/*.md (one Game Design Document per game), docs/GAME_CATALOGUE.md,
 * docs/ASSET_REGISTER.md and docs/LOUNGE_MATH.md from the live catalogue + engine registry,
 * so documentation never drifts from the code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CATALOGUE, GameMeta } from '../shared/catalogue';
import { ENGINES } from '../server/games/registry';
import { loungeMath } from '../server/loungeMath';
import { buildTheme, GAME_STYLE, INTENSITY_CAP } from '../client/src/lib/musicTheory';

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function musicLine(id: string): string {
  const t = buildTheme(id);
  if (!t) return 'Own beat-matched backing track composed from the chart seed (client/src/games/family/RhythmRush.tsx).';
  const s = t.style;
  const parts = [s.pad && `${s.pad} pad`, s.bass && `${s.bass} bass`, s.drums && `${s.drums} drums`, s.arp && `${s.arp} arpeggio`, s.lead && `${s.lead} lead`].filter(Boolean).join(', ');
  const cap = INTENSITY_CAP[id] !== undefined ? ' Capped to pad and bass so it never competes with the tones or patterns the player memorises.' : '';
  const lounge = s.id.startsWith('lounge') ? ' Lounge rule: calm level, no escalating layers; returns below the stake use a neutral cue, never a win sound.' : '';
  return `Original adaptive theme "${s.label}": ${NOTE[t.root % 12]} ${s.mode}, ${t.tempo} BPM; ${parts}.${cap}${lounge}`;
}

const out = path.resolve('docs/games');
fs.mkdirSync(out, { recursive: true });

const ENGINE_FILE: Record<string, string> = {
  'mind-maze': 'shared/games/mindMaze.ts', 'pattern-hunter': 'shared/games/patternHunter.ts', 'number-rush': 'shared/games/numberRush.ts', 'logic-lock': 'shared/games/logicLock.ts',
  'sequence-master': 'shared/games/sequenceMaster.ts', 'grid-genius': 'shared/games/gridGenius.ts', 'block-battle': 'shared/games/blockBattle.ts', 'tower-tactics': 'shared/games/towerTactics.ts',
  'reflex-arena': 'shared/games/reflexArena.ts', 'color-dash': 'shared/games/colorDash.ts', 'rhythm-rush': 'shared/games/rhythmRush.ts', 'obstacle-sprint': 'shared/games/obstacleSprint.ts',
  'code-breaker': 'server/games/family/codeBreaker.ts', 'word-duel': 'server/games/family/wordDuel.ts', 'trivia-clash': 'server/games/family/triviaClash.ts', 'emoji-decode': 'server/games/family/emojiDecode.ts',
  'word-ladder': 'server/games/family/wordLadder.ts', 'geo-sprint': 'server/games/family/geoSprint.ts', 'fact-or-fiction': 'server/games/family/factOrFiction.ts', 'territory-wars': 'server/games/family/territoryWars.ts',
  'hex-conquest': 'server/games/family/hexConquest.ts', 'connect-five': 'server/games/family/connectFive.ts', 'chess-blitz': 'server/games/family/chessBlitz.ts', 'memory-duel': 'server/games/family/memoryDuel.ts',
  'party-chaos': 'server/games/family/partyChaos.ts', 'eu-roulette': 'server/games/lounge/roulette.ts', 'us-roulette': 'server/games/lounge/roulette.ts', 'fr-roulette': 'server/games/lounge/roulette.ts',
  blackjack: 'server/games/lounge/blackjack.ts', 'blackjack-duel': 'server/games/lounge/blackjack.ts', baccarat: 'server/games/lounge/baccaratSicbo.ts', 'sic-bo': 'server/games/lounge/baccaratSicbo.ts',
  holdem: 'server/games/lounge/poker.ts', omaha: 'server/games/lounge/poker.ts', 'teen-patti': 'server/games/lounge/poker.ts', 'andar-bahar': 'server/games/lounge/tableCards.ts',
  'dragon-tiger': 'server/games/lounge/tableCards.ts', 'three-card-poker': 'server/games/lounge/tableCards.ts', 'video-poker': 'server/games/lounge/tableCards.ts',
  plinko: 'server/games/lounge/instant.ts', 'dice-arena': 'server/games/lounge/instant.ts', 'hi-lo': 'server/games/lounge/instant.ts', mines: 'server/games/lounge/instant.ts', 'crash-flight': 'server/games/lounge/instant.ts',
};
const UI_FILE = (g: GameMeta) => {
  const map: Record<string, string> = { 'trivia-clash': 'RoundsGame', 'party-chaos': 'RoundsGame', 'eu-roulette': 'Roulette', 'us-roulette': 'Roulette', 'fr-roulette': 'Roulette', holdem: 'Poker', omaha: 'Poker' };
  if (map[g.id]) return `client/src/games/${g.env === 'family' ? 'family' : 'lounge'}/${map[g.id]}.tsx`;
  if (g.category === 'Slots') return 'client/src/games/lounge/Slots.tsx';
  const pascal = g.id.split('-').map((x) => x[0].toUpperCase() + x.slice(1)).join('').replace('Geo', 'Geo').replace('HiLo', 'HiLo');
  const fix: Record<string, string> = { HiLo: 'HiLo', GeoSprint: 'GeoSprint', MemoryDuel: 'MemoryDuel', WordLadder: 'WordLadder', ThreeCardPoker: 'ThreeCardPoker' };
  return `client/src/games/${g.env}/${fix[pascal] ?? pascal}.tsx`;
};

function stateMachine(g: GameMeta, mode: string): string {
  if (g.env === 'lounge') {
    if (['blackjack', 'blackjack-duel', 'three-card-poker', 'video-poker'].includes(g.id)) return 'bet -> (deal) -> decide/act -> settle -> bet. Open rounds on session close resolve by published close-out rules.';
    if (['hi-lo', 'mines', 'crash-flight'].includes(g.id)) return 'idle -> start (stake) -> active (calls / reveals / flight) -> bank | lose -> idle.';
    if (['holdem', 'omaha', 'teen-patti'].includes(g.id)) return 'not seated -> sit (buy-in) -> idle -> deal -> betting rounds (bots act until player turn) -> showdown/award -> idle -> leave (stack returned).';
    return 'idle -> place bets -> resolve (single server action) -> settle -> idle.';
  }
  if (mode === 'replay') return 'loading -> tutorial (first time) -> countdown -> playing (local engine, actions logged) -> over -> submit log -> server replay verification -> results.';
  if (g.formats.includes('versus')) return 'lobby (rooms) / init (solo vs AI) -> playing (turn or simultaneous actions validated server-side) -> over -> results + persistence.';
  return 'init (server holds state) -> playing (each action validated server-side) -> over -> results.';
}

function gdd(g: GameMeta): string {
  const e = ENGINES[g.id];
  const lounge = g.env === 'lounge';
  const math = lounge ? loungeMath(g.id) : null;
  const multi = g.formats.filter((f) => ['versus', 'teams', 'group', 'race', 'async', 'daily'].includes(f));
  return `# ${g.n}. ${g.title}

> ${g.tagline}

| Field | Value |
|---|---|
| Game id | \`${g.id}\` |
| Environment | ${lounge ? 'PLAYZO Lounge (21+, legally gated, Fun Chips only)' : 'Family'} |
| Engine | \`${ENGINE_FILE[g.id]}\` (mode: **${e.mode}**, rules v${e.rulesVersion}) |
| UI | \`${UI_FILE(g)}\` |
| Status | Implemented · unit/integration tested${lounge ? ' · DISABLED pending legal review' : ''} |

## 1. Game title
${g.title}

## 2. Game category
${g.category}

## 3. Target age group
${g.age}${lounge ? ' (verified adults only; invisible to minors and guests)' : ' (family-safe content; age label is advisory)'}

## 4. Core concept
${g.description}

## 5. Unique selling proposition
${g.usp}

## 6. Core gameplay loop
${g.loop}

## 7. Game rules
${g.rules.map((r) => `- ${r}`).join('\n')}

## 8. User controls
${g.controls}

## 9. Game state machine
${stateMachine(g, e.mode)}

## 10. Difficulty model
${lounge ? 'Not applicable (chance simulation); identical probabilities for every player.' : 'Easy / Normal / Hard select engine parameters (board size, timing windows, AI depth, problem tiers). See engine constants.'}

## 11. Scoring model
${g.scoring}

## 12. Multiplayer rules
${lounge ? 'Solo against the house or rule-driven bots only. No player-to-player transfer of chips.' : multi.length ? `Formats: ${g.formats.join(', ')}. Max ${g.maxPlayers} players. ${e.mode === 'replay' ? 'Live races share a seed; each score comes from a server-verified replay.' : 'Rooms run the server-authoritative engine; emotes-only communication.'}` : 'Solo (with async friend challenges where listed).'}

## 13. Match duration
${g.session}

## 14. Reward rules
${lounge ? 'No XP, achievements or ZO from Lounge outcomes. Fun Chips are free, non-purchasable, non-transferable and non-redeemable.' : 'XP (participation + bounded performance + win, difficulty multiplier), ZO coins (capped at 400/day from games), mission progress, achievements. Rewards never use randomised loot.'}

## 15. Progression system
${lounge ? 'None by design (no reward loop around chance play).' : 'Account level from XP; per-game mastery (plays/wins/best); weekly leaderboards; daily/weekly missions; streak achievements.'}

## 16. User interface
Mobile-first stage: HUD, ${e.mode === 'replay' ? 'animated board driven by the local deterministic engine' : 'server view rendered with animated transitions'}, controls and an accessible tutorial modal (Info button). Results screen with verification badge, rewards, replay, share and challenge.

## 17. Art direction
World: **${g.theme.world}**. Palette ${g.theme.bg[0]} -> ${g.theme.bg[1]}, accent ${g.theme.accent}. Original vector cover art (\`client/src/art/covers.tsx\`, motif \`${g.id}\`).

## 18. 3D asset requirements
${['dice-arena', 'sic-bo'].includes(g.id) ? 'WebGL dice (client/src/three/Dice3D.tsx), canvas-generated pip textures, eased tumble settling on server values.' : 'None required; 2D vector / canvas presentation chosen for performance on mid-range phones.'}

## 19. Animation requirements
Spring-based UI transitions (framer-motion), ${['obstacle-sprint', 'rhythm-rush', 'tower-tactics', 'plinko', 'crash-flight'].includes(g.id) ? 'canvas render loop at display refresh' : 'state-change micro-animations'}; reduced-motion users get instant transitions.

## 20. Sound requirements
${musicLine(g.id)} Music builds up during play, tightens when the clock runs low, sinks under pause and ends with a result stinger. Effects: procedural Web Audio (\`client/src/lib/sound.ts\`) through a reverb, delay and compressor bus with music ducking. Separate music and effects volume, in-game music toggle, global mute.

## 21. Backend requirements
${e.mode === 'replay' ? 'Session start returns a seed; POST /submit re-simulates the action log with the same engine (`verifyReplay`), enforcing timeline/wall-clock and engine plausibility rules.' : `State stored in \`game_sessions.state\`; actions via POST /api/sessions/:id/action${lounge ? '; RNG = HMAC-SHA256 stream with committed seed; stakes/payouts settled through the idempotent CHIPS ledger' : ''}.`}

## 22. Data events
game_start, game_complete / game_rejected / game_end, achievement_unlocked${multi.length ? ', room_created, room_started, room_finished' : ''}.

## 23. Edge cases
${[
    e.mode === 'replay' ? 'Out-of-order or superhuman timestamps -> run rejected (422) and logged for admin review.' : 'Illegal/out-of-turn actions -> 422 with a friendly message; state unchanged.',
    e.timed ? 'Deadlines enforced on server time; late actions rejected; ticks advance rounds.' : 'Abandoned sessions are reaped after 2 hours.',
    lounge ? 'Session closed mid-round -> resolved by published close-out rules (e.g. blackjack auto-stand, poker fold + chips returned).' : 'Network failure -> retry/resume (server-mode sessions can be resumed from Continue Playing).',
    lounge ? 'Insufficient Fun Chips -> 422 INSUFFICIENT_CHIPS; balances can never go negative (DB CHECK + ledger guard).' : 'Guests can play fully; progress transfers on registration.',
  ].map((x) => `- ${x}`).join('\n')}

## 24. Security requirements
Server-authoritative results; ${e.mode === 'server' ? 'redacted views (no hidden information leaves the server)' : 'deterministic replay verification'}; per-session locks; rate limits; CSRF header; ${lounge ? 'age assurance + lounge terms + legal gate checked on every action; Lounge invisible (404) without entitlement.' : 'no client-submitted scores accepted.'}

## 25. Test scenarios
${lounge && math ? `- Statistical RTP/z-test and distribution checks in \`tests/fairness.test.ts\`.\n- Published mathematics: ${JSON.stringify((math as any).rtp ?? (math as any).bets?.map?.((b: any) => `${b.bet}: ${b.rtp ?? '-'}%`) ?? '').slice(0, 300)}` : `- Determinism and rule tests in \`tests/${e.mode === 'replay' ? 'replayEngines' : 'serverEngines'}.test.ts\`.\n- Session flow + anti-cheat in \`tests/api.test.ts\`${multi.length ? '; live multiplayer in `tests/multiplayer.test.ts` (representative games)' : ''}.`}
`;
}

for (const g of CATALOGUE) fs.writeFileSync(path.join(out, `${String(g.n).padStart(2, '0')}-${g.id}.md`), gdd(g));

/* ---------------- GAME_CATALOGUE.md ---------------- */
const cat = `# PLAYZO Game Catalogue

Generated by \`npm run gdd\` from \`shared/catalogue.ts\` and the engine registry. 50 games = 25 family + 25 Lounge (21+, legally gated).

| # | Game | Env | Category | Age | Engine mode | Formats | Implementation | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|
${CATALOGUE.map((g) => `| ${g.n} | [${g.title}](games/${String(g.n).padStart(2, '0')}-${g.id}.md) | ${g.env} | ${g.category} | ${g.age} | ${ENGINES[g.id].mode} | ${g.formats.join(', ')} | Done | ${g.env === 'lounge' ? 'fairness + unit' : 'unit + API'} | ${g.env === 'lounge' ? 'Disabled: pending legal review' : 'Live (local)'} |`).join('\n')}
`;
fs.writeFileSync('docs/GAME_CATALOGUE.md', cat);

/* ---------------- ASSET_REGISTER.md ---------------- */
const assets = `# PLAYZO Asset Register

No AI image/video generation tool was available in this environment (inspected: none exposed to the build agent; Blender and ffmpeg not installed). Therefore **every visual and audio asset is original and produced procedurally in code**. No stock, scraped or third-party artwork is used. No video files exist and none are claimed.

| Asset | Game | Type | Source / provenance | Resolution | Location | License | Used in |
|---|---|---|---|---|---|---|---|
${CATALOGUE.map((g) => `| Cover art: ${g.theme.world} | ${g.title} | Vector illustration (SVG, generated) | Original, hand-authored motif in code | Vector (400x500 viewBox) | client/src/art/covers.tsx#${g.id} | Owned (PLAYZO) | Tiles, detail pages, rooms, results |`).join('\n')}
| PLAYZO logo / wordmark | Platform | CSS + SVG | Original | Vector | client/src/components/ui.tsx (Logo), client/public/favicon.svg | Owned | Everywhere |
| PLAYZO 3D orb hero | Platform | Real-time 3D (Three.js / WebGL) | Original procedural geometry + materials | Runtime | client/src/three/Hero3D.tsx | Owned | Home hero |
| 3D dice | Dice Arena, Sic Bo | Real-time 3D + canvas textures | Original | Runtime | client/src/three/Dice3D.tsx | Owned | Lounge dice games |
| Slot symbol set (40 symbols) | 6 slot games | Vector (SVG) | Original | Vector | client/src/games/lounge/Slots.tsx | Owned | Reels, paytables |
| Avatars (12 orbs), frames, themes | Platform | CSS gradients | Original | Vector | shared/cosmetics.ts | Owned | Profiles, shop |
| Icon set (50 icons) | Platform | SVG paths | Original | 24px grid | client/src/components/Icon.tsx | Owned | UI |
| Sound effects and mix bus (reverb from a generated impulse, ping-pong delay, compressor, ducking) | All games | Procedural Web Audio synthesis | Original | Runtime | client/src/lib/sound.ts | Owned | All games |
| Adaptive soundtrack: 18 styles, a unique theme for each of ${Object.keys(GAME_STYLE).length} games | All games | Procedural composition + synthesis (FM bells and mallets, analogue pads, basses, sitar-like pluck, tanpura drone, drum and tabla kits) | Original; composed from a seed per game | Runtime | client/src/lib/musicTheory.ts, client/src/lib/music.ts | Owned | All games, Settings previews |
| Rhythm Rush music | Rhythm Rush | Procedural composition | Original, seeded per chart | Runtime | client/src/games/family/RhythmRush.tsx | Owned | Rhythm Rush |
| Fonts: Unbounded, Plus Jakarta Sans | Platform | Web fonts | Google Fonts | - | fonts.googleapis.com | SIL Open Font License 1.1 | Typography |
| Emoji glyphs (Emoji Decode, Memory Duel, flags) | 3 games | System emoji font | Rendered by the player's OS | - | server/data/emoji.ts, geo.ts | OS font licence | Gameplay content (Unicode characters, not bundled images) |
| English word list | Word games | Data | npm an-array-of-english-words@2.0.0 | 274,937 words | node_modules | MIT | Server-side validation |
| Trivia, facts, emoji puzzles, country data | Knowledge games | Content | Written for PLAYZO | - | server/data/*.ts | Owned | Questions |
`;
fs.writeFileSync('docs/ASSET_REGISTER.md', assets);

/* ---------------- LOUNGE_MATH.md ---------------- */
const lm = CATALOGUE.filter((g) => g.env === 'lounge').map((g) => `## ${g.n}. ${g.title}\n\n${g.math}\n\n\`\`\`json\n${JSON.stringify(loungeMath(g.id), null, 1).slice(0, 3500)}\n\`\`\`\n`).join('\n');
fs.writeFileSync('docs/LOUNGE_MATH.md', `# Lounge Mathematics (published)\n\nGenerated from live engine code by \`npm run gdd\`. Observed results: see QA_TEST_REPORT.md and docs/fairness-results.txt.\n\nRandomness: HMAC-SHA256(serverSeed, blockIndex) stream, unbiased rejection sampling, seed committed (SHA-256) at session start and revealed at session end. Outcomes are independent of balance, history, membership and spending (tested).\n\nClose-out rules for open rounds when a session closes: blackjack/duel auto-stand; Three Card Poker fold; video poker draw holding all; Hi-Lo/Mines bank if at least one step else refund stake; Crash bank at server time (refund if before lift-off); poker/Teen Patti fold the open hand and return the table stack.\n\n${lm}`);
console.log(`wrote ${CATALOGUE.length} GDDs + GAME_CATALOGUE.md + ASSET_REGISTER.md + LOUNGE_MATH.md`);
