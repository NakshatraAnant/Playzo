import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useCtl } from '../runtime';
import { Net, Outcome } from './common';
import { api } from '../../lib/api';
import { sfx } from '../../lib/sound';
import { Modal } from '../../components/ui';

/** Original vector symbol set: [shape, fill, accent]. */
const SYM: Record<string, [string, string, string]> = {
  SEVEN: ['seven', '#ff2a4a', '#ffd23f'], BAR3: ['bar3', '#1a1a1a', '#ffd23f'], BAR2: ['bar2', '#1a1a1a', '#c0c8d8'], BAR: ['bar1', '#1a1a1a', '#ff8f3d'], CHERRY: ['cherry', '#ff2a4a', '#3ddc97'], BLANK: ['blank', '#000', '#000'],
  COMPASS: ['compass', '#ffb13b', '#fff'], IDOL: ['idol', '#3ddc97', '#ffd23f'], MASK: ['mask', '#ff7a3d', '#fff'], SNAKE: ['snake', '#3ddc97', '#ffd23f'], HAT: ['hat', '#8a5a2b', '#ffd23f'], GEM: ['gem', '#3dd9ff', '#fff'], TORCH: ['torch', '#ff7a3d', '#ffd23f'], ROPE: ['rope', '#c9a46a', '#8a5a2b'], COIN: ['coin', '#ffd23f', '#c99a2e'],
  GOLDBAR: ['goldbar', '#ffd56b', '#c99a2e'], KEY: ['key', '#ffd36b', '#fff'], CROWN: ['crown', '#ffd23f', '#ff3d6e'], RUBY: ['gem', '#ff2a5c', '#fff'], PEARL: ['pearl', '#f0f4ff', '#a8b4d8'], DIAL: ['dial', '#9aa4b2', '#fff'], COINS: ['coin', '#ffb547', '#c97a2e'], NOTE: ['note', '#3ddc97', '#1a6a3a'], LOCK: ['lock', '#9aa4b2', '#2a3442'],
  STAR: ['star', '#ffd23f', '#fff'], NOVA: ['nova', '#ff5ce1', '#fff'], ALIEN: ['alien', '#7dffb2', '#0a2a1a'], RINGED: ['ringed', '#a98bff', '#ffd23f'], COMET: ['comet', '#7cf3ff', '#fff'], MOON: ['moon', '#e8e8f8', '#b0b0d0'], ROCKET: ['rocket', '#ff7a3d', '#fff'], ASTEROID: ['asteroid', '#8a7a6a', '#5a4a3a'],
  NEON: ['star', '#39ff9c', '#fff'], MELON: ['melon', '#3ddc97', '#ff3d6e'], BELL: ['bell', '#ffd23f', '#ff8f3d'], GRAPE: ['grape', '#a06bff', '#3ddc97'], ORANGE: ['orange', '#ff9933', '#3ddc97'], LEMON: ['lemon', '#ffe066', '#3ddc97'],
  METEOR: ['comet', '#ff5ce1', '#ffd23f'], PLANET: ['ringed', '#3dd9ff', '#fff'], SATURN: ['ringed', '#ffb547', '#fff'], ORBIT: ['orbit', '#a98bff', '#fff'], SPARK: ['star', '#ff5ce1', '#fff'], VOID: ['blank', '#000', '#000'],
};

function Symbol({ s }: { s: string }) {
  const [shape, f, a] = SYM[s] ?? ['blank', '#000', '#000'];
  const body = (() => {
    switch (shape) {
      case 'seven': return <text x={50} y={78} textAnchor="middle" fontSize={78} fontWeight={900} fill={f} stroke={a} strokeWidth={3} fontFamily="Unbounded">7</text>;
      case 'bar1': case 'bar2': case 'bar3': { const n = +shape.slice(-1); return <g>{Array.from({ length: n }, (_, i) => <g key={i}><rect x={14} y={50 - n * 11 + i * 22} width={72} height={18} rx={4} fill={f} stroke={a} strokeWidth={3} /><text x={50} y={64 - n * 11 + i * 22} textAnchor="middle" fontSize={13} fontWeight={900} fill={a}>BAR</text></g>)}</g>; }
      case 'cherry': return <g><path d="M38 60 Q46 30 66 18 M62 64 Q60 36 66 18" stroke={a} strokeWidth={5} fill="none" /><circle cx={36} cy={66} r={16} fill={f} /><circle cx={62} cy={70} r={16} fill={f} /><circle cx={31} cy={61} r={4} fill="#fff" opacity={0.6} /></g>;
      case 'compass': return <g><circle cx={50} cy={50} r={34} fill="none" stroke={f} strokeWidth={7} /><polygon points="50,18 58,50 50,82 42,50" fill={f} /><polygon points="18,50 50,43 82,50 50,57" fill={a} /></g>;
      case 'idol': return <g><rect x={30} y={22} width={40} height={62} rx={12} fill={f} /><rect x={36} y={38} width={10} height={8} fill="#0a2a1a" /><rect x={54} y={38} width={10} height={8} fill="#0a2a1a" /><rect x={40} y={58} width={20} height={6} fill={a} /></g>;
      case 'mask': return <g><path d="M18 30 Q50 18 82 30 Q84 70 50 84 Q16 70 18 30Z" fill={f} /><ellipse cx={37} cy={46} rx={8} ry={6} fill="#1a0a04" /><ellipse cx={63} cy={46} rx={8} ry={6} fill="#1a0a04" /><path d="M38 66 Q50 72 62 66" stroke={a} strokeWidth={4} fill="none" /></g>;
      case 'snake': return <path d="M20 76 Q20 56 40 56 Q60 56 60 40 Q60 24 76 24" stroke={f} strokeWidth={13} fill="none" strokeLinecap="round" />;
      case 'hat': return <g><ellipse cx={50} cy={70} rx={38} ry={10} fill={f} /><path d="M30 70 L34 34 Q50 26 66 34 L70 70Z" fill={f} /><rect x={32} y={56} width={36} height={7} fill={a} /></g>;
      case 'gem': return <g><polygon points="50,14 82,40 50,86 18,40" fill={f} /><polygon points="50,14 64,40 50,86 36,40" fill={a} opacity={0.35} /><line x1={18} y1={40} x2={82} y2={40} stroke={a} strokeWidth={2} /></g>;
      case 'torch': return <g><rect x={44} y={46} width={12} height={40} rx={3} fill="#8a5a2b" /><path d="M50 14 Q66 32 56 48 L44 48 Q34 32 50 14Z" fill={f} /><path d="M50 26 Q58 36 52 46 L48 46 Q42 36 50 26Z" fill={a} /></g>;
      case 'rope': return <g fill="none" stroke={f} strokeWidth={7}><ellipse cx={50} cy={50} rx={30} ry={20} /><ellipse cx={50} cy={50} rx={18} ry={11} stroke={a} /></g>;
      case 'coin': return <g><circle cx={50} cy={50} r={32} fill={f} stroke={a} strokeWidth={5} /><text x={50} y={62} textAnchor="middle" fontSize={32} fontWeight={900} fill={a}>Z</text></g>;
      case 'goldbar': return <g><polygon points="16,66 28,40 72,40 84,66" fill={f} stroke={a} strokeWidth={3} /><text x={50} y={60} textAnchor="middle" fontSize={14} fontWeight={900} fill={a}>WILD</text></g>;
      case 'key': return <g><circle cx={34} cy={50} r={16} fill="none" stroke={f} strokeWidth={8} /><path d="M50 50 H84 M74 50 v12 M84 50 v10" stroke={f} strokeWidth={8} /></g>;
      case 'crown': return <path d="M16 72 L22 32 L38 52 L50 22 L62 52 L78 32 L84 72Z" fill={f} stroke={a} strokeWidth={3} />;
      case 'pearl': return <g><circle cx={50} cy={50} r={28} fill={f} /><circle cx={42} cy={40} r={8} fill="#fff" /></g>;
      case 'dial': return <g><circle cx={50} cy={50} r={32} fill={f} stroke={a} strokeWidth={4} />{[0, 60, 120, 180, 240, 300].map((d) => <rect key={d} x={48} y={20} width={4} height={10} fill="#2a3442" transform={`rotate(${d} 50 50)`} />)}<circle cx={50} cy={50} r={8} fill="#2a3442" /></g>;
      case 'note': return <g><rect x={14} y={30} width={72} height={40} rx={6} fill={f} /><circle cx={50} cy={50} r={11} fill={a} /></g>;
      case 'lock': return <g><rect x={26} y={44} width={48} height={38} rx={6} fill={f} /><path d="M34 44 V34 a16 16 0 0 1 32 0 V44" stroke={f} strokeWidth={7} fill="none" /><circle cx={50} cy={62} r={5} fill={a} /></g>;
      case 'star': return <polygon points="50,10 61,38 92,38 67,57 77,88 50,70 23,88 33,57 8,38 39,38" fill={f} stroke={a} strokeWidth={2} />;
      case 'nova': return <g>{Array.from({ length: 8 }, (_, i) => <rect key={i} x={47} y={12} width={6} height={30} rx={3} fill={f} transform={`rotate(${i * 45} 50 50)`} />)}<circle cx={50} cy={50} r={14} fill={a} /></g>;
      case 'alien': return <g><ellipse cx={50} cy={50} rx={26} ry={32} fill={f} /><ellipse cx={39} cy={46} rx={8} ry={12} fill={a} transform="rotate(-20 39 46)" /><ellipse cx={61} cy={46} rx={8} ry={12} fill={a} transform="rotate(20 61 46)" /></g>;
      case 'ringed': return <g><circle cx={50} cy={50} r={22} fill={f} /><ellipse cx={50} cy={52} rx={40} ry={10} fill="none" stroke={a} strokeWidth={4} transform="rotate(-18 50 50)" /></g>;
      case 'comet': return <g><path d="M14 20 L60 56" stroke={a} strokeWidth={14} strokeLinecap="round" opacity={0.4} /><circle cx={62} cy={58} r={18} fill={f} /></g>;
      case 'moon': return <path d="M62 16 A34 34 0 1 0 84 64 A26 26 0 1 1 62 16Z" fill={f} />;
      case 'rocket': return <g><path d="M50 12 Q68 30 64 64 H36 Q32 30 50 12Z" fill={a} /><circle cx={50} cy={38} r={7} fill={f} /><path d="M36 64 L26 80 L40 72Z M64 64 L74 80 L60 72Z" fill={f} /><path d="M44 70 L50 88 L56 70Z" fill="#ffd23f" /></g>;
      case 'asteroid': return <path d="M24 40 L40 20 L66 24 L82 44 L74 72 L48 82 L24 66Z" fill={f} stroke={a} strokeWidth={4} />;
      case 'melon': return <g><path d="M14 46 A36 36 0 0 0 86 46Z" fill={f} /><path d="M20 46 A30 30 0 0 0 80 46Z" fill={a} /></g>;
      case 'bell': return <g><path d="M50 16 Q76 20 74 66 H26 Q24 20 50 16Z" fill={f} /><rect x={20} y={64} width={60} height={8} rx={4} fill={a} /><circle cx={50} cy={78} r={7} fill={a} /></g>;
      case 'grape': return <g>{[[40, 36], [60, 36], [30, 54], [50, 54], [70, 54], [40, 72], [60, 72]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={11} fill={f} />)}<path d="M50 26 L56 12" stroke={a} strokeWidth={5} /></g>;
      case 'orange': return <g><circle cx={50} cy={54} r={30} fill={f} /><ellipse cx={58} cy={22} rx={10} ry={5} fill={a} /></g>;
      case 'lemon': return <g><ellipse cx={50} cy={52} rx={34} ry={24} fill={f} /><ellipse cx={74} cy={34} rx={7} ry={4} fill={a} /></g>;
      case 'orbit': return <g fill="none" stroke={f} strokeWidth={5}><ellipse cx={50} cy={50} rx={36} ry={14} /><ellipse cx={50} cy={50} rx={36} ry={14} transform="rotate(60 50 50)" /><ellipse cx={50} cy={50} rx={36} ry={14} transform="rotate(120 50 50)" /><circle cx={50} cy={50} r={6} fill={a} /></g>;
      default: return null;
    }
  })();
  return <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }} role="img" aria-label={s.toLowerCase()}>{body}</svg>;
}

export default function Slots() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [math, setMath] = useState<any>(null);
  const [bet, setBet] = useState<number | null>(null);
  const [spinKey, setSpinKey] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [info, setInfo] = useState(false);
  const [auto, setAuto] = useState(0);
  useEffect(() => { api.get(`/api/games/${ctl.meta.id}`).then((r) => setMath(r.math)).catch(() => undefined); }, [ctl.meta.id]);
  const [reels, rows] = math?.layout ? math.layout.split('x').map(Number) : [3, 1];
  const bets: number[] = useMemo(() => ({ 'adventure-slots': [10, 20, 50, 100, 200, 500], 'vault-slots': [20, 40, 100, 200, 500, 1000], 'cosmic-reels': [25, 50, 100, 250, 500, 1000], 'neon-fruit': [10, 20, 50, 100, 250, 500] } as Record<string, number[]>)[ctl.meta.id] ?? [10, 20, 50, 100, 200, 500], [ctl.meta.id]);
  const b = bet ?? bets[2];
  const spin = async () => {
    if (spinning) return;
    setSpinning(true); sfx.spin();
    try {
      const r = await ctl.act({ type: 'spin', bet: b });
      setSpinKey((k) => k + 1);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => { r.view.last.total > b ? sfx.win() : r.view.last.total ? sfx.neutral() : sfx.thud(); setSpinning(false); }, reduced ? 50 : 300 + reels * 220);
    } catch { setSpinning(false); setAuto(0); }
  };
  useEffect(() => { if (auto > 0 && !spinning) { const t = setTimeout(() => { setAuto((a) => a - 1); spin(); }, 650); return () => clearTimeout(t); } }, [auto, spinning]); // eslint-disable-line react-hooks/exhaustive-deps
  const L = v.last;
  const win: string[][] = L?.window ?? Array.from({ length: reels }, () => Array(rows).fill('BLANK'));
  const winCells = new Set<string>((L?.wins ?? []).flatMap((w: any) => w.cells.map((c: number[]) => `${c[0]},${c[1]}`)));
  const theme = ctl.meta.theme;
  return (
    <>
      <div style={{ width: '100%', maxWidth: reels > 3 ? 760 : 520, padding: 16, borderRadius: 28, background: `linear-gradient(180deg, ${theme.bg[0]}, ${theme.bg[1]})`, border: `5px solid ${theme.accent}`, boxShadow: `0 0 50px ${theme.accent}44, inset 0 0 30px rgba(0,0,0,.5)` }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${reels}, 1fr)`, gap: 8, background: 'rgba(0,0,0,.45)', padding: 8, borderRadius: 18 }}>
          {win.map((col, r) => (
            <motion.div key={`${spinKey}-${r}`} initial={spinKey ? { y: -60, filter: 'blur(6px)' } : false} animate={{ y: 0, filter: 'blur(0px)' }} transition={{ delay: r * 0.22, type: 'spring', stiffness: 260, damping: 18 }} style={{ display: 'grid', gap: 8 }}>
              {col.map((s, row) => (
                <div key={row} style={{ aspectRatio: '1', borderRadius: 14, background: 'linear-gradient(180deg, #fffaf0, #e8dcc8)', padding: '12%', boxShadow: winCells.has(`${r},${row}`) && !spinning ? `0 0 0 4px ${theme.accent}, 0 0 24px ${theme.accent}` : 'inset 0 -6px 12px rgba(0,0,0,.15)', transition: 'box-shadow .3s' }}>
                  <Symbol s={s} />
                </div>
              ))}
            </motion.div>
          ))}
        </div>
      </div>
      {L && !spinning && <Outcome text={L.jackpot ? `MYSTERY JACKPOT! +${L.total}` : L.total ? `Win ${L.total.toLocaleString()} · ${L.wins.map((w: any) => w.kind === 'ways' ? `${w.sym} ${w.count}x ${w.ways} ways` : w.kind === 'scatter' ? `${w.count} scatters` : `${w.sym} x${w.count}`).join(', ')}` : 'No win this spin'} good={L.total > b ? true : L.total ? null : false} />}
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <div className="seg" role="radiogroup" aria-label="Bet size">{bets.map((x) => <button key={x} className={b === x ? 'on' : ''} onClick={() => setBet(x)} role="radio" aria-checked={b === x}>{x}</button>)}</div>
        <button className="btn btn-gold btn-lg" onClick={spin} disabled={spinning || ctl.busy}>{spinning ? 'Spinning…' : 'Spin'}</button>
        <button className="btn" onClick={() => setAuto(auto ? 0 : 10)} aria-pressed={auto > 0}>{auto ? `Stop auto (${auto})` : 'Auto ×10'}</button>
        <button className="btn btn-ghost" onClick={() => setInfo(true)}>Paytable & odds</button>
      </div>
      <Net net={v.net} />
      <Modal open={info} onClose={() => setInfo(false)} title="Published mathematics" wide>
        {math ? (
          <div className="stack">
            <p><b>Theoretical RTP: {math.rtp}%</b> <span className="dim">(lines {math.breakdown.lines}% · scatter {math.breakdown.scatter}% · jackpot {math.breakdown.jackpot}%)</span></p>
            <p className="muted" style={{ fontSize: 14 }}>{math.layout} {math.mode === 'ways' ? '243 ways' : `${math.lines} line${math.lines > 1 ? 's' : ''}`}. Reel stops are drawn uniformly by a cryptographic RNG; results never depend on balance, history or spending.{math.jackpot ? ` Jackpot: 1 in ${math.jackpot.oneIn} per spin, fixed ${math.jackpot.mult}x bet.` : ''}</p>
            <div className="table-wrap"><table className="data"><thead><tr><th>Symbol</th><th>Pays (×{math.mode === 'ways' ? 'bet/25 per way' : 'line bet'})</th>{math.reelLengths.map((_: number, i: number) => <th key={i}>Reel {i + 1}</th>)}</tr></thead>
              <tbody>{Object.keys(math.reelCounts[0]).concat(...math.reelCounts.slice(1).map((r: any) => Object.keys(r))).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).map((sym: string) => (
                <tr key={sym}><td><span className="row" style={{ gap: 6 }}><span style={{ width: 26, height: 26, display: 'inline-block', background: '#fffaf0', borderRadius: 6, padding: 2 }}><Symbol s={sym} /></span>{sym}{sym === math.wild ? ' (wild)' : ''}{sym === math.scatter?.sym ? ' (scatter)' : ''}</span></td>
                  <td className="mono">{sym === math.scatter?.sym ? Object.entries(math.scatter.pays).map(([k, p]) => `${k}: ${p}× total`).join(' · ') : Object.entries(math.paytable[sym] ?? {}).map(([k, p]) => `${k}: ${p}`).join(' · ') || '-'}</td>
                  {math.reelCounts.map((rc: any, i: number) => <td key={i} className="mono">{rc[sym] ?? 0}/{math.reelLengths[i]}</td>)}</tr>
              ))}</tbody></table></div>
          </div>
        ) : <div className="spinner" />}
      </Modal>
    </>
  );
}
