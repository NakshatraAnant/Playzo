import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCtl, Hud, useServerTick, playerName } from '../runtime';
import { sfx } from '../../lib/sound';
import { Icon } from '../../components/Icon';
import { serverNow } from '../../lib/api';

const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export default function ChessBlitz() {
  const ctl = useCtl();
  const v = ctl.view as { board: string[]; turn: 'w' | 'b'; me: 'w' | 'b'; players: string[]; san: string[]; result: { winner: 'w' | 'b' | null; reason: string } | null; check: boolean; clock: { w: number; b: number } | null; lastAt: number; lastMove: { from: number; to: number } | null; legal: [number, number, string | null][] };
  useServerTick(null, !!v.clock && !v.result);
  const [sel, setSel] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const flip = v.me === 'b';
  const myMove = !v.result && v.turn === v.me && !ctl.busy;
  const lastLen = useRef(v.san.length);
  useEffect(() => { if (v.san.length !== lastLen.current) { v.check ? sfx.bad() : sfx.thud(); lastLen.current = v.san.length; setSel(null); } }, [v.san.length, v.check]);
  // Room clocks: request ticks from the room engine via the room timer (server-side). Solo has no clock.
  const targets = sel !== null ? v.legal.filter((l) => l[0] === sel).map((l) => l[1]) : [];
  const click = (sq: number) => {
    if (!myMove) return;
    if (sel !== null && targets.includes(sq)) {
      const isPromo = v.legal.some((l) => l[0] === sel && l[1] === sq && l[2]);
      if (isPromo) { setPromo({ from: sel, to: sq }); return; }
      ctl.act({ type: 'move', from: sel, to: sq }).catch(() => undefined);
      setSel(null);
      return;
    }
    const p = v.board[sq];
    if (p && (p === p.toUpperCase() ? 'w' : 'b') === v.me) { setSel(sq); sfx.tap(); } else setSel(null);
  };
  const clockOf = (c: 'w' | 'b') => {
    if (!v.clock) return null;
    const base = v.clock[c];
    return v.turn === c && !v.result ? Math.max(0, base - (serverNow() - v.lastAt)) : base;
  };
  const order = Array.from({ length: 64 }, (_, i) => (flip ? 63 - i : i));
  const nameOf = (c: 'w' | 'b') => playerName(ctl, v.players[c === 'w' ? 0 : 1]);
  return (
    <>
      <Hud items={[['Move', Math.floor(v.san.length / 2) + 1], ['To play', v.turn === 'w' ? 'White' : 'Black'], ...(v.clock ? [[nameOf('w'), fmt(clockOf('w')!)], [nameOf('b'), fmt(clockOf('b')!)]] as [string, string][] : [])]} />
      {v.check && !v.result && <span className="chip bad">Check!</span>}
      <div className="board-wrap" style={{ maxWidth: 520 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--sh-2)', border: '3px solid #c9a96e' }} role="grid" aria-label="Chess board">
          {order.map((sq) => {
            const r = sq >> 3, c = sq & 7;
            const dark = (r + c) % 2 === 1;
            const p = v.board[sq];
            const isTarget = targets.includes(sq);
            const last = v.lastMove && (v.lastMove.from === sq || v.lastMove.to === sq);
            const name = 'abcdefgh'[c] + (8 - r);
            return (
              <button key={sq} onClick={() => click(sq)} aria-label={`${name}${p ? ` ${p === p.toUpperCase() ? 'white' : 'black'} ${({ k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' } as any)[p.toLowerCase()]}` : ''}`}
                style={{ aspectRatio: '1', border: 0, padding: 0, position: 'relative', cursor: myMove ? 'pointer' : 'default', background: sel === sq ? '#d8b45a' : last ? (dark ? '#8a7a3a' : '#c9b86a') : dark ? '#3b3a5c' : '#c9c3e0' }}>
                {p && <motion.span layoutId={`pc-${sq}-${p}`} style={{ fontSize: 'clamp(22px, 8.2vw, 48px)', lineHeight: 1, color: p === p.toUpperCase() ? '#fff' : '#111', textShadow: p === p.toUpperCase() ? '0 0 2px #000, 0 2px 3px rgba(0,0,0,.6)' : '0 0 2px rgba(255,255,255,.6)' }}>{GLYPH[p.toLowerCase()]}</motion.span>}
                {isTarget && <i style={{ position: 'absolute', inset: p ? 3 : '36%', borderRadius: '50%', border: p ? '3px solid rgba(255,61,139,.85)' : 0, background: p ? 'transparent' : 'rgba(255,61,139,.75)' }} />}
                {(c === (flip ? 7 : 0)) && <span style={{ position: 'absolute', left: 2, top: 1, fontSize: 9, color: dark ? '#c9c3e0' : '#3b3a5c' }}>{8 - r}</span>}
                {(r === (flip ? 0 : 7)) && <span style={{ position: 'absolute', right: 2, bottom: 0, fontSize: 9, color: dark ? '#c9c3e0' : '#3b3a5c' }}>{'abcdefgh'[c]}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {promo && (
        <div className="row panel panel-tight" role="dialog" aria-label="Choose promotion">
          {['q', 'r', 'b', 'n'].map((k) => <button key={k} className="btn icon-btn" style={{ fontSize: 28 }} onClick={() => { ctl.act({ type: 'move', from: promo.from, to: promo.to, promo: k }).catch(() => undefined); setPromo(null); setSel(null); }}>{GLYPH[k]}</button>)}
        </div>
      )}
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <span className="chip">{v.result ? `${v.result.winner ? `${v.result.winner === 'w' ? 'White' : 'Black'} wins` : 'Draw'} · ${v.result.reason}` : myMove ? 'Your move' : 'Opponent to move…'}</span>
        {!v.result && <button className="btn btn-sm btn-ghost" onClick={() => { if (confirm('Resign?')) ctl.act({ type: 'resign' }).catch(() => undefined); }}><Icon name="flag" size={14} />Resign</button>}
        {!v.result && <button className="btn btn-sm btn-ghost" onClick={() => ctl.act({ type: 'draw-claim' }).catch(() => undefined)}>Claim draw</button>}
      </div>
      <div className="panel panel-tight mono" style={{ width: '100%', maxWidth: 520, fontSize: 13, maxHeight: 96, overflow: 'auto' }} aria-label="Move list">
        {v.san.length ? v.san.map((m, i) => <span key={i}>{i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{m} </span>) : <span className="dim">Moves appear here in algebraic notation.</span>}
      </div>
    </>
  );
}
