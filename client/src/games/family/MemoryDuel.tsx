import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useCtl, Hud, playerName } from '../runtime';
import { sfx } from '../../lib/sound';

const CRITTERS = ['🦊', '🐼', '🦉', '🐢', '🦄', '🐙', '🦜', '🐨', '🦔', '🐯', '🦚', '🐧', '🦒', '🐘', '🦈', '🐝'];
const NAMES = ['Fox', 'Panda', 'Owl', 'Turtle', 'Unicorn', 'Octopus', 'Parrot', 'Koala', 'Hedgehog', 'Tiger', 'Peacock', 'Penguin', 'Giraffe', 'Elephant', 'Shark', 'Bee'];

export default function MemoryDuel() {
  const ctl = useCtl();
  const v = ctl.view as { n: number; faces: number[]; owner: (string | null)[]; up: number[]; pendingHide: number[]; turn: string | null; players: string[]; pairs: Record<string, number>; flips: number; over: boolean; lastMatch: boolean | null };
  const can = !!v.turn && v.turn === ctl.me && !ctl.busy;
  const prev = useRef(v.flips);
  useEffect(() => { if (v.flips !== prev.current) { v.lastMatch === true ? sfx.good() : v.lastMatch === false ? sfx.bad() : sfx.flip(); prev.current = v.flips; } }, [v.flips, v.lastMatch]);
  const cols = v.n <= 12 ? 4 : v.n <= 16 ? 4 : 6;
  return (
    <>
      <Hud items={[['Flips', v.flips], ...v.players.map((p) => [playerName(ctl, p), `${v.pairs[p]} pairs`] as [string, string])]} />
      {v.players.length > 1 && <span className="chip">{v.over ? 'Game over' : can ? 'Your turn' : `${playerName(ctl, v.turn)} is flipping…`}</span>}
      <div className="board-wrap" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10, maxWidth: cols === 6 ? 600 : 440, perspective: 800 }}>
        {v.faces.map((f, i) => {
          const shown = f >= 0;
          const owned = v.owner[i];
          return (
            <motion.button key={i} onClick={() => can && !shown && ctl.act({ type: 'flip', i }).catch(() => undefined)} disabled={!can || shown}
              animate={{ rotateY: shown ? 180 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              aria-label={shown ? NAMES[f] : `Card ${i + 1}, face down`}
              style={{ aspectRatio: '3/4', border: 0, borderRadius: 14, position: 'relative', transformStyle: 'preserve-3d', cursor: can && !shown ? 'pointer' : 'default', background: 'transparent', padding: 0 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: 14, backfaceVisibility: 'hidden', background: 'radial-gradient(circle at 50% 40%, #2a7a5a, #0f3a2a)', border: '2px solid rgba(255,209,161,.45)', display: 'grid', placeItems: 'center', fontSize: 22, color: 'rgba(255,209,161,.6)' }}>✦</span>
              <span style={{ position: 'absolute', inset: 0, borderRadius: 14, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: owned ? (owned === ctl.me ? '#fff3e0' : '#e0efff') : '#fffaf2', display: 'grid', placeItems: 'center', fontSize: 'clamp(26px, 8vw, 44px)', boxShadow: owned ? `inset 0 0 0 3px ${owned === ctl.me ? '#ffb02e' : '#4dabff'}` : undefined }}>{shown ? CRITTERS[f] : ''}</span>
            </motion.button>
          );
        })}
      </div>
    </>
  );
}
