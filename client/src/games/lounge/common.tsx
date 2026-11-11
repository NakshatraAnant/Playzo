import { ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { useCtl } from '../runtime';
import { sfx } from '../../lib/sound';

const SUITS = ['♠', '♥', '♦', '♣'];
const RL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankOf = (c: number) => (c % 13) + 2;
export const suitOf = (c: number) => Math.floor(c / 13) % 4;
export const labelOf = (c: number) => `${RL[rankOf(c)] ?? rankOf(c)}${SUITS[suitOf(c)]}`;

export function Card({ c, i = 0, held, onClick, small }: { c: number; i?: number; held?: boolean; onClick?: () => void; small?: boolean }) {
  const style = small ? { width: 44, height: 64 } : undefined;
  if (c < 0) return <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} className="playing-card back" style={style} aria-label="Face-down card" />;
  const r = rankOf(c), s = suitOf(c), red = s === 1 || s === 2;
  return (
    <motion.button type="button" onClick={onClick} disabled={!onClick} initial={{ rotateY: 90, y: -20, opacity: 0 }} animate={{ rotateY: 0, y: held ? -8 : 0, opacity: 1 }} transition={{ delay: i * 0.08, type: 'spring', stiffness: 260, damping: 22 }}
      className={`playing-card ${red ? 'red' : ''} ${held ? 'held' : ''}`} style={{ ...style, border: 0, cursor: onClick ? 'pointer' : 'default' }} aria-label={`${RL[r] ?? r} of ${['spades', 'hearts', 'diamonds', 'clubs'][s]}${held ? ', held' : ''}`}>
      <span style={{ fontSize: small ? 12 : 15, lineHeight: 1, textAlign: 'left' }}>{RL[r] ?? r}<br />{SUITS[s]}</span>
      <span className="c-big" style={small ? { fontSize: 20 } : undefined}>{SUITS[s]}</span>
    </motion.button>
  );
}
export const Hand = ({ cards, label, total }: { cards: number[]; label?: string; total?: ReactNode }) => (
  <div className="col" style={{ alignItems: 'center', gap: 6 }}>
    {label && <span className="dim" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}{total !== undefined && total !== null ? <> · <b style={{ color: '#fff' }}>{total}</b></> : null}</span>}
    <div className="cards-row">{cards.map((c, i) => <Card key={`${i}-${c}`} c={c} i={i} />)}</div>
  </div>
);

export const CHIP_VALUES = [10, 50, 100, 500, 1000];
const CHIP_COL: Record<number, string> = { 10: '#3d8bff', 50: '#ff3d6e', 100: '#1a1a1a', 500: '#8b5cff', 1000: '#d8b45a' };

export function ChipPicker({ value, onChange, values = CHIP_VALUES }: { value: number; onChange: (v: number) => void; values?: number[] }) {
  return (
    <div className="chipstack" role="radiogroup" aria-label="Chip value">
      {values.map((v) => <button key={v} className={`casino-chip ${value === v ? 'on' : ''}`} style={{ ['--c' as any]: CHIP_COL[v] ?? '#ff3d8b' }} onClick={() => { onChange(v); sfx.select(); }} role="radio" aria-checked={value === v}>{v >= 1000 ? `${v / 1000}k` : v}</button>)}
    </div>
  );
}

export function useStake(key: string, initial = 100) {
  const [v, setV] = useState(() => { try { return Number(localStorage.getItem(`pz-stake-${key}`)) || initial; } catch { return initial; } });
  const set = (n: number) => { const x = Math.max(10, Math.min(5000, Math.round(n))); setV(x); try { localStorage.setItem(`pz-stake-${key}`, String(x)); } catch { /* ignore */ } };
  return [v, set] as const;
}

export function StakeInput({ value, onChange, max = 5000 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <button className="btn icon-btn btn-sm" onClick={() => onChange(Math.max(10, Math.floor(value / 2)))} aria-label="Halve stake">½</button>
      <input className="input mono" style={{ width: 110, textAlign: 'center', minHeight: 40 }} type="number" min={10} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Stake in Fun Chips" />
      <button className="btn icon-btn btn-sm" onClick={() => onChange(Math.min(max, value * 2))} aria-label="Double stake">2×</button>
    </div>
  );
}

export function Net({ net, history }: { net: number; history?: ReactNode }) {
  const ctl = useCtl();
  return (
    <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
      <span className={`chip ${net > 0 ? 'ok' : net < 0 ? 'bad' : ''} mono`}>Session net {net > 0 ? '+' : ''}{net.toLocaleString()}</span>
      {ctl.chips !== null && <span className="chip gold mono">Balance {ctl.chips.toLocaleString()}</span>}
      {history}
    </div>
  );
}

export function Outcome({ text, good }: { text: string | null; good?: boolean | null }) {
  if (!text) return null;
  return <motion.div key={text} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`chip ${good === true ? 'ok' : good === false ? 'bad' : 'gold'}`} style={{ fontSize: 15, padding: '8px 16px' }} aria-live="polite">{text}</motion.div>;
}
