/**
 * PLAYZO original cover art. Every game has a hand-authored vector motif composed over its
 * world palette (no stock or third-party imagery). Rendered as inline SVG, so it is crisp at
 * any size and weighs only a few kilobytes.
 */
import { memo, ReactNode } from 'react';
import { BY_ID } from '@shared/catalogue';
import { SeededRng } from '@shared/rng';

const W = 400, H = 500;
type M = (a: string, id: string) => ReactNode;

const card = (x: number, y: number, rot: number, label: string, red: boolean, key?: string | number) => (
  <g key={key ?? label + x} transform={`translate(${x} ${y}) rotate(${rot})`}>
    <rect x={-42} y={-60} width={84} height={120} rx={10} fill="#fbf8ff" stroke="rgba(0,0,0,.25)" />
    <text x={-30} y={-34} fontSize={22} fontWeight={800} fill={red ? '#d1123f' : '#1a1030'} fontFamily="Plus Jakarta Sans">{label.slice(0, -1)}</text>
    <text x={0} y={18} fontSize={44} textAnchor="middle" fill={red ? '#d1123f' : '#1a1030'}>{label.slice(-1)}</text>
  </g>
);
const cardBack = (x: number, y: number, rot: number, a: string, key?: string | number) => (
  <g key={key ?? `b${x}${y}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
    <rect x={-42} y={-60} width={84} height={120} rx={10} fill="#2a145a" stroke={a} strokeWidth={4} />
    <rect x={-30} y={-48} width={60} height={96} rx={6} fill="none" stroke={a} strokeOpacity={0.5} strokeDasharray="4 4" />
  </g>
);
const die = (x: number, y: number, s: number, n: number, fill = '#fff', pip = '#1a1030', rot = 0, key?: string | number) => {
  const p = [[0, 0]], o = s * 0.27;
  const pips: Record<number, number[][]> = { 1: [[0, 0]], 2: [[-o, -o], [o, o]], 3: [[-o, -o], [0, 0], [o, o]], 4: [[-o, -o], [o, -o], [-o, o], [o, o]], 5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]], 6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]] };
  void p;
  return (
    <g key={key ?? `d${x}${y}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * 0.18} fill={fill} stroke="rgba(0,0,0,.2)" />
      {pips[n].map(([px, py], i) => <circle key={i} cx={px} cy={py} r={s * 0.08} fill={pip} />)}
    </g>
  );
};
const wheel = (n: number, a: string, zeroCol: string, colA: string, colB: string, extraZero = false) => {
  const cx = 200, cy = 220, r = 150;
  const total = n;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 22} fill={a} opacity={0.9} />
      <circle cx={cx} cy={cy} r={r + 12} fill="#1a0f05" />
      {Array.from({ length: total }, (_, i) => {
        const a0 = (i / total) * Math.PI * 2, a1 = ((i + 1) / total) * Math.PI * 2;
        const isZero = i === 0 || (extraZero && i === Math.floor(total / 2));
        const fill = isZero ? zeroCol : i % 2 ? colA : colB;
        return <path key={i} d={`M${cx} ${cy} L${cx + r * Math.sin(a0)} ${cy - r * Math.cos(a0)} A${r} ${r} 0 0 1 ${cx + r * Math.sin(a1)} ${cy - r * Math.cos(a1)} Z`} fill={fill} stroke="#d8b45a" strokeWidth={0.8} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#2b1a0a" stroke={a} strokeWidth={4} />
      <circle cx={cx} cy={cy} r={r * 0.3} fill={a} />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={cx - 4} y={cy - r * 0.55} width={8} height={r * 0.5} rx={4} fill={a} transform={`rotate(${i * 90 + 45} ${cx} ${cy})`} />)}
      <circle cx={cx + r * 0.83 * Math.sin(1.1)} cy={cy - r * 0.83 * Math.cos(1.1)} r={9} fill="#fff" />
    </g>
  );
};
const hex = (cx: number, cy: number, r: number) => Array.from({ length: 6 }, (_, i) => { const t = (Math.PI / 3) * i + Math.PI / 6; return `${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`; }).join(' ');
const slotWindow = (syms: string[], a: string, cols = 3) => (
  <g>
    <rect x={40} y={150} width={320} height={150} rx={24} fill="#120a04" stroke={a} strokeWidth={6} />
    {syms.slice(0, cols).map((s, i) => (
      <g key={i}>
        <rect x={56 + i * (288 / cols)} y={166} width={288 / cols - 12} height={118} rx={14} fill="#fffaf0" />
        <text x={56 + i * (288 / cols) + (288 / cols - 12) / 2} y={248} fontSize={cols > 3 ? 40 : 58} textAnchor="middle" fontWeight={900} fill="#c4122f" fontFamily="Unbounded">{s}</text>
      </g>
    ))}
    <rect x={30} y={222} width={340} height={4} fill={a} opacity={0.9} />
  </g>
);

const MOTIFS: Record<string, M> = {
  'eu-roulette': (a) => wheel(37, a, '#0d8a4f', '#c4122f', '#151515'),
  'us-roulette': (a) => <g>{wheel(38, a, '#0d8a4f', '#ff2a5c', '#141018', true)}<circle cx={200} cy={220} r={184} fill="none" stroke={a} strokeWidth={3} strokeDasharray="2 10" /></g>,
  'fr-roulette': (a) => <g>{wheel(37, a, '#1f6d8a', '#a3122a', '#0d1430')}<path d="M200 380 q-20 30 0 50 q20-20 0-50 M180 400 q20 10 40 0" stroke={a} strokeWidth={4} fill="none" /></g>,
  blackjack: (a) => <g>{card(160, 230, -12, 'A♠', false)}{card(240, 220, 10, 'K♥', true)}{[0, 1, 2, 3, 4].map((i) => <ellipse key={i} cx={300} cy={370 - i * 10} rx={36} ry={12} fill={i % 2 ? a : '#c4122f'} stroke="#fff" strokeWidth={2} />)}<text x={110} y={390} fontSize={64} fontWeight={900} fill={a} fontFamily="Unbounded">21</text></g>,
  'blackjack-duel': (a) => <g>{card(120, 230, -14, '10♣', false)}{card(280, 230, 14, 'Q♦', true)}<path d="M205 150 L180 240 L210 240 L190 330 L240 220 L210 220 L230 150 Z" fill={a} /><text x={200} y={410} fontSize={40} textAnchor="middle" fontWeight={900} fill="#fff" fontFamily="Unbounded">VS</text></g>,
  baccarat: (a) => <g><path d="M60 170 Q200 70 340 170 L320 170 Q200 100 80 170Z" fill={a} /><rect x={90} y={170} width={220} height={12} fill={a} />{card(165, 280, -8, '9♦', true)}{card(235, 285, 8, '8♣', false)}</g>,
  'sic-bo': (a) => <g><ellipse cx={200} cy={110} rx={40} ry={52} fill="#c4122f" /><rect x={190} y={52} width={20} height={10} fill={a} /><rect x={190} y={158} width={20} height={10} fill={a} />{die(130, 290, 90, 4, '#fff8ee', '#c4122f', -10)}{die(250, 270, 90, 6, '#fff8ee', '#1a1030', 12)}{die(200, 370, 90, 1, '#fff8ee', '#c4122f', 4)}</g>,
  holdem: (a) => <g>{['A♠', 'K♠', 'Q♠', 'J♠', '10♠'].map((c, i) => card(80 + i * 60, 220, (i - 2) * 3, c, false, i))}{[0, 1, 2].map((i) => <path key={i} d={`M30 ${330 + i * 28} q45-22 90 0 t90 0 t90 0 t90 0`} stroke={a} strokeWidth={4} fill="none" opacity={1 - i * 0.25} />)}</g>,
  omaha: (a) => <g><path d="M40 400 L170 170 L230 260 L280 200 L370 400Z" fill={a} opacity={0.25} /><path d="M170 170 L195 215 L180 210 L165 225Z" fill="#fff" />{['A♥', 'A♦', 'K♣', 'Q♠'].map((c, i) => card(110 + i * 60, 300, (i - 1.5) * 10, c, i < 2, i))}</g>,
  'teen-patti': (a) => <g>{card(150, 250, -18, 'A♥', true)}{card(200, 240, 0, 'A♣', false)}{card(250, 250, 18, 'A♦', true)}{Array.from({ length: 9 }, (_, i) => <circle key={i} cx={40 + i * 40} cy={400 + (i % 2) * 14} r={16} fill={i % 2 ? a : '#ff7a1a'} />)}</g>,
  'andar-bahar': (a) => <g>{card(200, 130, 0, '7♠', false)}{[0, 1, 2].map((i) => cardBack(120, 260 + i * 24, -4, a, `l${i}`))}{[0, 1].map((i) => cardBack(280, 260 + i * 24, 4, a, `r${i}`))}<path d="M200 440 q-22-30 0-60 q22 30 0 60" fill="#ffcc4d" /><ellipse cx={200} cy={444} rx={30} ry={10} fill="#a8551b" /></g>,
  'dragon-tiger': (a) => <g><rect x={30} y={120} width={160} height={260} rx={20} fill="#2a0a3d" stroke={a} strokeWidth={3} /><rect x={210} y={120} width={160} height={260} rx={20} fill="#3d0a0a" stroke={a} strokeWidth={3} /><path d="M70 220 q40-50 80 0 q-40 25-80 0z" fill={a} /><circle cx={110} cy={220} r={10} fill="#1a0a2e" /><path d="M250 220 q40-40 80 0 q-40 30-80 0z" fill="#ffb547" /><path d="M290 205 v30" stroke="#1a0a0a" strokeWidth={6} strokeLinecap="round" /><text x={110} y={330} textAnchor="middle" fontSize={22} fill="#fff" fontWeight={800} fontFamily="Unbounded">DRAGON</text><text x={290} y={330} textAnchor="middle" fontSize={22} fill="#fff" fontWeight={800} fontFamily="Unbounded">TIGER</text></g>,
  'three-card-poker': (a) => <g><polygon points="200,90 330,330 70,330" fill="none" stroke={a} strokeWidth={4} opacity={0.6} />{card(200, 170, 0, 'Q♥', true)}{card(140, 290, -10, 'K♥', true)}{card(260, 290, 10, 'A♥', true)}</g>,
  'video-poker': (a) => <g><rect x={30} y={110} width={340} height={260} rx={28} fill="#0a0a2a" stroke={a} strokeWidth={6} /><rect x={50} y={130} width={300} height={220} rx={18} fill="#05051a" />{['J', 'J', '7', '3', 'Q'].map((r, i) => <g key={i}><rect x={62 + i * 56} y={190} width={48} height={70} rx={6} fill="#fff" /><text x={86 + i * 56} y={236} textAnchor="middle" fontSize={26} fontWeight={900} fill={i % 2 ? '#d1123f' : '#1a1030'}>{r}</text></g>)}<text x={200} y={170} textAnchor="middle" fontSize={20} fill={a} fontWeight={900} fontFamily="Unbounded">JACKS OR BETTER</text><text x={200} y={310} textAnchor="middle" fontSize={16} fill={a} opacity={0.8} fontFamily="Unbounded">HOLD  HOLD</text></g>,
  'classic-slots': (a) => <g>{slotWindow(['7', '7', '7'], a)}<rect x={360} y={180} width={12} height={90} rx={6} fill={a} /><circle cx={366} cy={170} r={16} fill="#c4122f" /></g>,
  'adventure-slots': (a) => <g><path d="M0 330 L80 230 L140 300 L220 190 L300 290 L400 210 L400 500 L0 500Z" fill="#7a3a12" opacity={0.7} /><path d="M0 390 L110 300 L190 360 L280 280 L400 350 L400 500 L0 500Z" fill="#5a250a" /><circle cx={200} cy={180} r={70} fill="none" stroke={a} strokeWidth={8} /><polygon points="200,120 215,180 200,240 185,180" fill={a} /><polygon points="140,180 200,165 260,180 200,195" fill="#fff" opacity={0.8} /></g>,
  'vault-slots': (a) => <g><circle cx={200} cy={240} r={150} fill="#1b2a38" stroke={a} strokeWidth={10} /><circle cx={200} cy={240} r={110} fill="none" stroke="#3b5268" strokeWidth={14} />{Array.from({ length: 6 }, (_, i) => <rect key={i} x={194} y={150} width={12} height={90} rx={6} fill={a} transform={`rotate(${i * 60} 200 240)`} />)}<circle cx={200} cy={240} r={34} fill={a} /><path d="M330 140 a10 10 0 0 1 20 0 v40 h10 v10 h-10 v8 h-20z" fill="#ffe08a" opacity={0.85} /></g>,
  'cosmic-reels': (a) => <g><circle cx={140} cy={200} r={60} fill="#7c3dff" /><ellipse cx={140} cy={200} rx={100} ry={22} fill="none" stroke={a} strokeWidth={5} transform="rotate(-20 140 200)" /><circle cx={290} cy={330} r={36} fill="#3dd9ff" /><circle cx={300} cy={130} r={14} fill="#ffb02e" />{[[60, 360], [120, 420], [200, 380], [250, 440], [340, 410]].map(([x, y], i, arr) => <g key={i}><circle cx={x} cy={y} r={5} fill="#fff" />{i > 0 && <line x1={arr[i - 1][0]} y1={arr[i - 1][1]} x2={x} y2={y} stroke={a} strokeWidth={2} opacity={0.6} />}</g>)}</g>,
  'neon-fruit': (a) => <g fill="none" strokeWidth={10} strokeLinecap="round"><circle cx={150} cy={300} r={60} stroke="#ff3d6e" style={{ filter: 'drop-shadow(0 0 12px #ff3d6e)' }} /><circle cx={260} cy={320} r={56} stroke="#ff3d6e" style={{ filter: 'drop-shadow(0 0 12px #ff3d6e)' }} /><path d="M150 240 Q190 130 250 120 M260 264 Q250 170 250 120" stroke={a} style={{ filter: `drop-shadow(0 0 12px ${a})` }} /><path d="M250 120 q40-20 70 10 q-40 15-70-10" stroke={a} /></g>,
  'mystery-jackpot': (a) => <g><path d="M60 80 L250 270" stroke={a} strokeWidth={36} strokeLinecap="round" opacity={0.25} /><path d="M90 110 L250 270" stroke={a} strokeWidth={16} strokeLinecap="round" opacity={0.6} /><circle cx={260} cy={280} r={62} fill="#ff5ce1" /><circle cx={240} cy={262} r={14} fill="#c43aa8" /><circle cx={282} cy={300} r={10} fill="#c43aa8" /><text x={200} y={430} textAnchor="middle" fontSize={56} fontWeight={900} fill="#fff" fontFamily="Unbounded">?</text></g>,
  plinko: (a) => <g>{Array.from({ length: 8 }, (_, r) => Array.from({ length: r + 3 }, (_, c) => <circle key={`${r}-${c}`} cx={200 + (c - (r + 2) / 2) * 36} cy={110 + r * 34} r={5} fill="#fff" opacity={0.85} />))}<circle cx={218} cy={232} r={11} fill={a} style={{ filter: `drop-shadow(0 0 10px ${a})` }} />{Array.from({ length: 10 }, (_, i) => <rect key={i} x={24 + i * 36} y={398} width={32} height={30} rx={6} fill={i === 0 || i === 9 ? '#ff4d6d' : i === 4 || i === 5 ? '#3d8bff' : a} opacity={0.85} />)}</g>,
  'dice-arena': (a) => <g><ellipse cx={200} cy={400} rx={160} ry={30} fill={a} opacity={0.25} />{die(140, 260, 120, 5, '#ff4d4d', '#fff', -14)}{die(270, 280, 120, 2, '#fff', '#c41c1c', 16)}</g>,
  'hi-lo': (a) => <g>{card(200, 250, 0, '8♣', false)}<path d="M200 110 l40 40 h-24 v30 h-32 v-30 h-24z" fill="#3ddc97" /><path d="M200 400 l40-40 h-24 v-30 h-32 v30 h-24z" fill="#ff4d6d" /><circle cx={330} cy={150} r={18} fill={a} /></g>,
  mines: (a) => <g>{Array.from({ length: 25 }, (_, i) => { const x = 70 + (i % 5) * 54, y = 120 + Math.floor(i / 5) * 54; const g = [2, 6, 8, 13, 16, 22].includes(i), m = i === 18; return <g key={i}><rect x={x} y={y} width={46} height={46} rx={10} fill={g ? '#0c3a4a' : m ? '#4a0c18' : '#1a2a3a'} stroke={g ? a : 'rgba(255,255,255,.1)'} />{g && <polygon points={`${x + 23},${y + 9} ${x + 37},${y + 21} ${x + 23},${y + 38} ${x + 9},${y + 21}`} fill={a} />}{m && <circle cx={x + 23} cy={y + 23} r={12} fill="#ff4d6d" />}</g>; })}</g>,
  'crash-flight': (a) => <g><path d="M30 420 Q220 400 340 120" fill="none" stroke={a} strokeWidth={6} strokeLinecap="round" /><path d="M30 420 Q220 400 340 120 L340 440 L30 440Z" fill={a} opacity={0.12} /><g transform="translate(330 130) rotate(-58)"><path d="M-30 0 L30 0 L40 6 L30 12 L-30 12Z" fill="#fff" /><path d="M-5 0 L-20 -26 L-8 -26 L12 0Z M-5 12 L-20 38 L-8 38 L12 12Z" fill="#dfe6ff" /></g>{[[80, 120], [150, 90], [60, 220]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.5} fill="#fff" />)}</g>,

  'mind-maze': (a, id) => { const rng = new SeededRng(id); return <g stroke="#7fb8ff" strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.85}>{Array.from({ length: 7 }, (_, r) => Array.from({ length: 6 }, (_, c) => { const x = 60 + c * 50, y = 110 + r * 46; return rng.next() < 0.5 ? <line key={`${r}${c}`} x1={x} y1={y} x2={x + 50} y2={y} /> : <line key={`${r}${c}`} x1={x} y1={y} x2={x} y2={y + 46} />; }))}<rect x={60} y={110} width={300} height={322} rx={8} /><circle cx={235} cy={250} r={10} fill={a} stroke="none" style={{ filter: `drop-shadow(0 0 14px ${a})` }} /></g>; },
  'pattern-hunter': (a) => <g>{Array.from({ length: 16 }, (_, i) => { const x = 85 + (i % 4) * 66, y = 135 + Math.floor(i / 4) * 66, odd = i === 9; return <g key={i} transform={`translate(${x} ${y}) rotate(${odd ? 35 : 0})`}><path d="M-20 18 L0 -22 L20 18Z" fill={odd ? a : '#c8a6ff'} opacity={odd ? 1 : 0.75} /></g>; })}<circle cx={151} cy={333} r={40} fill="none" stroke={a} strokeWidth={4} strokeDasharray="6 6" /></g>,
  'number-rush': (a) => <g><text x={200} y={290} textAnchor="middle" fontSize={150} fontWeight={900} fill={a} fontFamily="Unbounded" fontStyle="italic">7x8</text>{[0, 1, 2, 3].map((i) => <rect key={i} x={20 + i * 10} y={170 + i * 40} width={110 - i * 20} height={8} rx={4} fill="#fff" opacity={0.3} />)}<text x={200} y={390} textAnchor="middle" fontSize={48} fontWeight={900} fill="#fff" fontFamily="Unbounded">= 56</text></g>,
  'logic-lock': (a) => <g>{[130, 95, 60].map((r, i) => <g key={i}><circle cx={200} cy={240} r={r} fill="none" stroke={i === 0 ? a : '#8a6a2a'} strokeWidth={18} />{Array.from({ length: 12 }, (_, k) => <rect key={k} x={198} y={240 - r - 10} width={4} height={20} fill="#2d1f08" transform={`rotate(${k * 30 + i * 12} 200 240)`} />)}</g>)}<circle cx={200} cy={240} r={30} fill={a} /><polygon points="200,90 190,70 210,70" fill="#fff" /></g>,
  'sequence-master': (a) => <g>{[['#8fb3ff', 120, 170], ['#ff7ae0', 280, 170], ['#7dffb2', 120, 330], ['#ffd23f', 280, 330]].map(([c, x, y], i) => <path key={i} d={`M${x} ${(y as number) - 70} L${(x as number) + 60} ${y} L${x} ${(y as number) + 70} L${(x as number) - 60} ${y}Z`} fill={c as string} opacity={i === 1 ? 1 : 0.45} style={i === 1 ? { filter: `drop-shadow(0 0 18px ${c})` } : undefined} />)}<circle cx={200} cy={250} r={18} fill={a} /></g>,
  'grid-genius': (a) => <g><rect x={70} y={110} width={260} height={260} rx={10} fill="#0d2a4a" stroke={a} strokeWidth={4} />{[1, 2, 3].map((i) => <g key={i}><line x1={70 + i * 65} y1={110} x2={70 + i * 65} y2={370} stroke={a} strokeWidth={i === 2 ? 4 : 1.5} opacity={0.7} /><line x1={70} y1={110 + i * 65} x2={330} y2={110 + i * 65} stroke={a} strokeWidth={i === 2 ? 4 : 1.5} opacity={0.7} /></g>)}{[[0, 0, '3'], [1, 2, '1'], [2, 1, '4'], [3, 3, '2'], [0, 3, '4'], [2, 2, '3']].map(([r, c, v], i) => <text key={i} x={102 + (c as number) * 65} y={155 + (r as number) * 65} textAnchor="middle" fontSize={36} fontWeight={800} fill={i > 3 ? a : '#fff'} fontFamily="Unbounded">{v}</text>)}</g>,
  'code-breaker': (a) => <g>{[0, 1, 2].map((r) => <g key={r}>{['#ff5cad', '#5cc8ff', '#ffd23f', '#7dffb2'].map((c, i) => <circle key={i} cx={100 + i * 56} cy={150 + r * 80} r={22} fill={(r + i) % 3 === 0 ? c : '#3a1a3a'} stroke={c} strokeWidth={3} />)}{[0, 1, 2, 3].map((k) => <circle key={k} cx={330 + (k % 2) * 18} cy={140 + r * 80 + Math.floor(k / 2) * 18} r={6} fill={k < r + 1 ? '#ffd23f' : '#c0c0d0'} />)}</g>)}<rect x={70} y={370} width={260} height={60} rx={16} fill={a} opacity={0.2} stroke={a} /><text x={200} y={410} textAnchor="middle" fontSize={26} fontWeight={900} fill="#fff" fontFamily="Unbounded">? ? ? ?</text></g>,
  'word-duel': (a) => <g>{[[200, 240, 'E'], [200, 160, 'P'], [270, 200, 'L'], [270, 280, 'A'], [200, 320, 'N'], [130, 280, 'T'], [130, 200, 'S']].map(([x, y, l], i) => <g key={i}><polygon points={hex(x as number, y as number, 44)} fill={i === 0 ? a : '#3a2d00'} stroke={a} strokeWidth={3} /><text x={x} y={(y as number) + 14} textAnchor="middle" fontSize={38} fontWeight={900} fill={i === 0 ? '#2a1d00' : '#fff'} fontFamily="Unbounded">{l}</text></g>)}</g>,
  'trivia-clash': (a) => <g><text x={200} y={220} textAnchor="middle" fontSize={180} fontWeight={900} fill={a} fontFamily="Unbounded">?</text>{['#ff5a5f', '#3d8bff', '#ffd23f', '#3ddc97'].map((c, i) => <rect key={i} x={i % 2 ? 210 : 50} y={280 + Math.floor(i / 2) * 64} width={140} height={50} rx={14} fill={c} opacity={0.9} />)}</g>,
  'emoji-decode': (a) => <g><path d="M60 120 h280 a30 30 0 0 1 30 30 v150 a30 30 0 0 1-30 30 h-180 l-60 50 v-50 h-40 a30 30 0 0 1-30-30 v-150 a30 30 0 0 1 30-30z" fill="#fff6dd" />{[[130, 225, '#ffd23f'], [270, 225, '#ff9f43']].map(([x, y, c], i) => <g key={i}><circle cx={x} cy={y} r={52} fill={c as string} /><circle cx={(x as number) - 18} cy={(y as number) - 12} r={7} fill="#3a2000" /><circle cx={(x as number) + 18} cy={(y as number) - 12} r={7} fill="#3a2000" /><path d={`M${(x as number) - 22} ${(y as number) + 14} q22 ${i ? -10 : 22} 44 0`} stroke="#3a2000" strokeWidth={6} fill="none" strokeLinecap="round" /></g>)}<text x={200} y={238} textAnchor="middle" fontSize={40} fontWeight={900} fill={a}>+</text></g>,
  'word-ladder': (a) => <g><line x1={130} y1={90} x2={130} y2={440} stroke="#c9a46a" strokeWidth={14} /><line x1={270} y1={90} x2={270} y2={440} stroke="#c9a46a" strokeWidth={14} />{['COLD', 'CORD', 'CARD', 'WARD', 'WARM'].map((w, i) => <g key={i}><rect x={142} y={110 + i * 66} width={116} height={46} rx={10} fill={i === 4 ? a : '#0b3a2b'} stroke={a} /><text x={200} y={142 + i * 66} textAnchor="middle" fontSize={26} fontWeight={900} fill={i === 4 ? '#0b3a2b' : '#fff'} fontFamily="Unbounded">{w}</text></g>)}</g>,
  'geo-sprint': (a) => <g><circle cx={200} cy={240} r={140} fill="#0b5470" stroke={a} strokeWidth={4} />{[-60, -20, 20, 60].map((d, i) => <ellipse key={i} cx={200} cy={240} rx={Math.abs(140 * Math.cos((d * Math.PI) / 180))} ry={140} fill="none" stroke="#fff" strokeOpacity={0.25} />)}{[-70, -35, 0, 35, 70].map((y, i) => <line key={i} x1={200 - Math.sqrt(140 * 140 - y * y)} y1={240 + y} x2={200 + Math.sqrt(140 * 140 - y * y)} y2={240 + y} stroke="#fff" strokeOpacity={0.25} />)}<path d="M150 190 q20-30 50-10 q30 10 20 40 q-30 20-50 0z M240 260 q30-10 40 20 q-10 30-40 10z" fill="#3ddc97" opacity={0.8} /><path d="M280 120 a26 26 0 0 1 52 0 c0 22-26 48-26 48 s-26-26-26-48z" fill={a} /><circle cx={306} cy={120} r={9} fill="#003049" /></g>,
  'fact-or-fiction': (a) => <g><rect x={60} y={120} width={280} height={260} rx={26} fill="#fff" transform="rotate(-6 200 250)" /><path d="M60 120 h140 v260 h-140 a26 26 0 0 1-26-26z" fill="#3ddc97" opacity={0.9} transform="rotate(-6 200 250)" /><path d="M95 250 l30 30 l55-65" stroke="#fff" strokeWidth={16} fill="none" strokeLinecap="round" transform="rotate(-6 200 250)" /><path d="M245 205 l60 60 M305 205 l-60 60" stroke="#ff4d6d" strokeWidth={16} strokeLinecap="round" transform="rotate(-6 200 250)" /><circle cx={330} cy={110} r={14} fill={a} /></g>,
  'territory-wars': (a) => <g>{Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => <circle key={`${r}${c}`} cx={90 + c * 55} cy={140 + r * 55} r={6} fill="#fff" />))}<rect x={90} y={140} width={110} height={55} fill="#ff6b6b" opacity={0.65} /><rect x={200} y={250} width={110} height={110} fill="#4dabff" opacity={0.65} /><path d="M90 140 h110 v55 h-110z M200 250 h110 v110 h-110z" stroke="#fff" strokeWidth={5} fill="none" /><path d="M300 120 v80" stroke="#fff" strokeWidth={5} /><path d="M300 120 h50 l-12 15 l12 15 h-50z" fill={a} /></g>,
  'hex-conquest': (a) => <g>{Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => { const x = 95 + c * 46 + r * 23, y = 130 + r * 40; const p = (r === c || r === c + 1) ? 1 : (r + c * 3) % 7 === 0 ? 2 : 0; return <polygon key={`${r}${c}`} points={hex(x, y, 24)} fill={p === 1 ? '#3d8bff' : p === 2 ? a : '#0a3a52'} stroke="#7fd4ff" strokeOpacity={0.4} strokeWidth={2} />; }))}</g>,
  'connect-five': (a) => <g><rect x={50} y={100} width={300} height={300} rx={8} fill="#c9a46a" />{Array.from({ length: 9 }, (_, i) => <g key={i}><line x1={65 + i * 33.75} y1={115} x2={65 + i * 33.75} y2={385} stroke="#5a3a12" strokeWidth={1.5} /><line x1={65} y1={115 + i * 33.75} x2={335} y2={115 + i * 33.75} stroke="#5a3a12" strokeWidth={1.5} /></g>)}{[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={98.75 + i * 33.75} cy={317 - i * 33.75} r={14} fill="#111" stroke={a} strokeWidth={2} />)}{[[3, 1], [6, 3], [2, 5], [5, 6]].map(([c, r], i) => <circle key={i} cx={65 + c * 33.75} cy={115 + r * 33.75} r={14} fill="#f6f1e6" />)}</g>,
  'block-battle': (a) => <g>{[[90, 130, '#ff6bd5', [[0, 0], [1, 0], [2, 0], [1, 1]]], [220, 150, '#6bd5ff', [[0, 0], [0, 1], [0, 2], [1, 2]]], [100, 290, '#ffd36b', [[0, 0], [1, 0], [0, 1], [1, 1]]], [230, 300, a, [[0, 0], [1, 0], [2, 0]]]].map(([x, y, c, cells], i) => <g key={i}>{(cells as number[][]).map(([cx, cy], k) => <rect key={k} x={(x as number) + cx * 44} y={(y as number) + cy * 44} width={40} height={40} rx={9} fill={c as string} style={{ filter: 'drop-shadow(0 6px 0 rgba(0,0,0,.35))' }} />)}</g>)}</g>,
  'tower-tactics': (a) => <g><path d="M0 360 Q120 300 200 360 T400 330 L400 500 L0 500Z" fill="#2a4a18" /><path d="M20 420 Q150 380 220 420 T400 400" stroke="#c9a46a" strokeWidth={22} fill="none" opacity={0.6} /><rect x={150} y={170} width={70} height={170} fill="#3a4a5a" /><path d="M140 170 h90 l-10-30 h-70z" fill="#5a6a7a" />{[0, 1, 2].map((i) => <rect key={i} x={148 + i * 28} y={128} width={18} height={18} fill="#5a6a7a" />)}<polygon points="300,190 330,250 300,320 270,250" fill={a} style={{ filter: `drop-shadow(0 0 18px ${a})` }} /><circle cx={185} cy={210} r={10} fill="#ffe066" /></g>,
  'chess-blitz': (a) => <g>{Array.from({ length: 4 }, (_, r) => Array.from({ length: 8 }, (_, c) => <rect key={`${r}${c}`} x={c * 50} y={340 + r * 40} width={50} height={40} fill={(r + c) % 2 ? '#2a2a40' : a} opacity={0.5} />))}<path d="M160 330 h100 l-8-30 h-10 c10-40 0-80-30-110 c-25-20-60-10-70 20 l20 10 c5-10 15-10 20-5 c-30 20-40 50-20 70 l-10 15z" fill="#f2ead8" stroke="#000" strokeOpacity={0.3} /><circle cx={210} cy={210} r={5} fill="#1c1c2e" /></g>,
  'reflex-arena': (a) => <g>{[[120, 170, 46], [280, 230, 60], [150, 360, 38], [300, 380, 28]].map(([x, y, r], i) => <g key={i}>{[1, 0.66, 0.33].map((k, j) => <circle key={j} cx={x} cy={y} r={r * k} fill={j % 2 ? '#001f3f' : i === 3 ? '#ff4d6d' : a} />)}</g>)}<path d="M230 300 l60 20 l-25 10 l20 30 l-12 8 l-20-30 l-18 18z" fill="#fff" /></g>,
  'color-dash': (a) => <g><path d="M70 200 q60-80 140-40 q90-50 120 30 q40 70-30 110 q-60 70-140 30 q-110 0-90-130z" fill="#2fd66b" opacity={0.25} /><text x={200} y={270} textAnchor="middle" fontSize={92} fontWeight={900} fill="#3d8bff" fontFamily="Unbounded">RED</text>{['#ff4d5e', '#3d8bff', '#2fd66b', a].map((c, i) => <circle key={i} cx={80 + i * 80} cy={380} r={28} fill={c} />)}</g>,
  'memory-duel': (a) => <g>{Array.from({ length: 12 }, (_, i) => { const x = 70 + (i % 4) * 68, y = 120 + Math.floor(i / 4) * 92; const up = i === 1 || i === 10; return <g key={i}><rect x={x} y={y} width={58} height={80} rx={10} fill={up ? '#fff6ea' : '#1f5a44'} stroke={a} strokeWidth={up ? 3 : 1} />{up ? <text x={x + 29} y={y + 52} textAnchor="middle" fontSize={34}>{'🦊'}</text> : <circle cx={x + 29} cy={y + 40} r={10} fill={a} opacity={0.3} />}</g>; })}</g>,
  'rhythm-rush': (a) => <g><path d="M140 80 L260 80 L380 460 L20 460Z" fill="#12052a" stroke="#ff3df0" strokeOpacity={0.5} />{[1, 2, 3].map((i) => <line key={i} x1={140 + i * 30} y1={80} x2={20 + i * 90} y2={460} stroke="#ff3df0" strokeOpacity={0.35} />)}<rect x={30} y={400} width={340} height={8} fill={a} style={{ filter: `drop-shadow(0 0 10px ${a})` }} />{[[0, 300], [2, 200], [1, 360], [3, 250]].map(([l, y], i) => <rect key={i} x={50 + l * 85 - (y - 80) * 0.05} y={y} width={70} height={18} rx={9} fill={['#3dd9ff', '#ff3df0', '#ffe066', '#7dffb2'][l]} />)}</g>,
  'obstacle-sprint': (a) => <g><path d="M0 360 h90 v-80 h70 v80 h40 v-140 h80 v140 h120 v140 H0z" fill="#1a0a2a" />{[[110, 300], [235, 250], [250, 290]].map(([x, y], i) => <rect key={i} x={x} y={y} width={12} height={14} fill="#ffe066" opacity={0.7} />)}<g transform="translate(120 300)"><circle cx={0} cy={-36} r={10} fill={a} /><path d="M0 -26 l-6 22 l-16 14 M-6 -4 l12 16 M0 -22 l16 6 M0 -22 l-18 -2" stroke={a} strokeWidth={6} strokeLinecap="round" fill="none" /></g><rect x={300} y={340} width={24} height={20} fill="#ff4d6d" /><circle cx={60} cy={110} r={34} fill="#ffb547" opacity={0.85} /></g>,
  'party-chaos': (a) => { const rng = new SeededRng('confetti'); return <g>{Array.from({ length: 40 }, (_, i) => <rect key={i} x={rng.int(380)} y={60 + rng.int(320)} width={8} height={16} rx={2} fill={['#ffe14d', '#ff3d8b', '#3dd9ff', '#7dffb2', '#ff7a3d'][i % 5]} transform={`rotate(${rng.int(180)} ${rng.int(380)} ${rng.int(300)})`} />)}<path d="M130 420 L200 250 L260 300Z" fill={a} /><path d="M200 250 L260 300" stroke="#fff" strokeWidth={4} /></g>; },
};

function Backdrop({ id, bg, accent }: { id: string; bg: [string, string]; accent: string }) {
  const rng = new SeededRng(`bg:${id}`);
  return (
    <>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor={bg[0]} /><stop offset="1" stopColor={bg[1]} /></linearGradient>
        <radialGradient id={`r-${id}`} cx="0.5" cy="0.42" r="0.6"><stop offset="0" stopColor={accent} stopOpacity="0.38" /><stop offset="1" stopColor={accent} stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#g-${id})`} />
      <rect width={W} height={H} fill={`url(#r-${id})`} />
      {Array.from({ length: 26 }, (_, i) => <circle key={i} cx={rng.int(W)} cy={rng.int(H)} r={0.6 + rng.next() * 1.8} fill="#fff" opacity={0.15 + rng.next() * 0.45} />)}
    </>
  );
}

export const GameCover = memo(function GameCover({ id, className, title }: { id: string; className?: string; title?: string }) {
  const g = BY_ID[id];
  if (!g) return null;
  const motif = MOTIFS[id];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={title ?? `${g.title} cover art`}>
      <Backdrop id={id} bg={g.theme.bg} accent={g.theme.accent} />
      <g>{motif ? motif(g.theme.accent, id) : null}</g>
    </svg>
  );
});
