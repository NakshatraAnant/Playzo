import { useState } from 'react';
import { motion } from 'framer-motion';
import { useCtl } from '../runtime';
import { Net, Outcome, StakeInput, useStake } from './common';
import { sfx } from '../../lib/sound';
import { fmtMult } from './Instant';

export default function Mines() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [stake, setStake] = useStake('mines', 100);
  const [mines, setMines] = useState(3);
  const act = async (a: any) => {
    try {
      const r = await ctl.act(a);
      if (a.type === 'reveal') r.view.boom !== null ? sfx.lose() : sfx.coin();
      if (a.type === 'bank' || r.view.banked) sfx.win();
    } catch { /* toast */ }
  };
  const layout: number[] = v.reveal?.layout ?? [];
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#08263a', width: '100%', maxWidth: 480, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {Array.from({ length: 25 }, (_, i) => {
          const gem = v.revealed.includes(i), boom = v.boom === i, mine = !v.active && layout.includes(i);
          return (
            <motion.button key={i} whileTap={{ scale: 0.9 }} disabled={!v.active || gem || ctl.busy} onClick={() => act({ type: 'reveal', i })} aria-label={gem ? 'Gem' : mine ? 'Mine' : `Tile ${i + 1}`}
              animate={{ rotateY: gem || mine ? 180 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ aspectRatio: '1', borderRadius: 12, border: 0, cursor: v.active && !gem ? 'pointer' : 'default', background: boom ? '#ff4d6d' : gem ? '#0c3a4a' : mine ? '#4a0c18' : 'linear-gradient(160deg, #1f3a52, #12263a)', boxShadow: gem ? '0 0 16px #55ffc8' : 'inset 0 -4px 0 rgba(0,0,0,.3)' }}>
              <span style={{ display: 'inline-block', transform: gem || mine ? 'rotateY(180deg)' : undefined, fontSize: 'clamp(16px, 5vw, 26px)' }}>{gem ? <svg viewBox="0 0 40 40" width="60%"><polygon points="20,4 34,16 20,36 6,16" fill="#55ffc8" /></svg> : mine ? <svg viewBox="0 0 40 40" width="55%"><circle cx="20" cy="22" r="11" fill="#ff4d6d" /><path d="M20 4 v8 M28 8 l-4 6" stroke="#ffd23f" strokeWidth="3" /></svg> : null}</span>
            </motion.button>
          );
        })}
      </div>
      {v.boom !== null && !v.active && <Outcome text="Mine hit - round over" good={false} />}
      {v.banked !== null && <Outcome text={`Banked ${v.banked.toLocaleString()} (${fmtMult(v.mult)})`} good />}
      {v.active ? (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <span className="chip mono">Now {fmtMult(v.mult)} · next {fmtMult(v.nextMult)}</span>
          <button className="btn btn-gold btn-lg" onClick={() => act({ type: 'bank' })} disabled={!v.revealed.length || ctl.busy}>Bank {Math.floor(v.stake * v.mult).toLocaleString()}</button>
        </div>
      ) : (
        <div className="col" style={{ alignItems: 'center' }}>
          <label className="row muted" style={{ fontSize: 14 }}>Mines <input type="range" min={1} max={24} value={mines} onChange={(e) => setMines(Number(e.target.value))} aria-label="Number of mines" /> <b className="mono">{mines}</b></label>
          <div className="row wrap" style={{ justifyContent: 'center' }}><StakeInput value={stake} onChange={setStake} /><button className="btn btn-gold btn-lg" onClick={() => act({ type: 'start', amount: stake, mines })} disabled={ctl.busy}>Start</button></div>
        </div>
      )}
      <div className="panel panel-tight mono" style={{ width: '100%', maxWidth: 560, fontSize: 11, wordBreak: 'break-all' }}>
        <div><b>Commitment</b> (SHA-256 of mine layout + salt, shown before you play): {v.commit || '-'}</div>
        {v.reveal && <div style={{ marginTop: 6 }}><b>Reveal</b>: layout [{v.reveal.layout.join(', ')}] · salt {v.reveal.salt}. Verify: sha256("{v.reveal.layout.join(',')}:{v.reveal.salt}") = commitment.</div>}
      </div>
      <Net net={v.net} />
    </>
  );
}
