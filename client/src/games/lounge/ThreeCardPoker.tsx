import { useEffect, useRef, useState } from 'react';
import { useCtl } from '../runtime';
import { Hand, Net, Outcome, StakeInput, useStake } from './common';
import { sfx } from '../../lib/sound';

export default function ThreeCardPoker() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [ante, setAnte] = useStake('tcp-ante', 50);
  const [pp, setPp] = useState(0);
  const act = (a: any) => { sfx.deal(); ctl.act(a).catch(() => undefined); };
  const prev = useRef(v.outcome);
  useEffect(() => { if (v.outcome && v.outcome !== prev.current) /win|qualify/i.test(v.outcome.result) ? sfx.win() : v.outcome.result === 'Push' ? sfx.coin() : sfx.lose(); prev.current = v.outcome; }, [v.outcome]);
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#0b3a24', width: '100%', maxWidth: 720, display: 'grid', gap: 18, justifyItems: 'center', minHeight: 320 }}>
        <Hand cards={v.dealer} label="Dealer (qualifies with Q-high)" total={v.outcome?.dealerHand} />
        <div className="row" style={{ gap: 18 }}>
          <span className="chip gold">Ante {v.ante || ante}</span><span className="chip gold">Play {v.phase === 'done' && v.outcome?.result !== 'Folded' ? v.ante : '-'}</span><span className="chip gold">Pair Plus {v.pairPlus || pp || '-'}</span>
        </div>
        <Hand cards={v.player} label="You" total={v.playerHand} />
      </div>
      {v.guide && <span className="chip">{v.guide}</span>}
      {v.outcome && <Outcome text={`${v.outcome.result}${v.outcome.anteBonus ? ` · ante bonus +${v.outcome.anteBonus}` : ''}${v.outcome.pairPlusWin ? ` · Pair Plus +${v.outcome.pairPlusWin}` : ''}`} good={/win|qualify/i.test(v.outcome.result) ? true : v.outcome.result === 'Push' ? null : false} />}
      {v.phase === 'decide' ? (
        <div className="row"><button className="btn btn-gold btn-lg" onClick={() => act({ type: 'play' })}>Play (+{v.ante})</button><button className="btn btn-danger btn-lg" onClick={() => act({ type: 'fold' })}>Fold</button></div>
      ) : (
        <div className="col" style={{ alignItems: 'center' }}>
          <div className="row wrap" style={{ justifyContent: 'center' }}><span className="muted">Ante</span><StakeInput value={ante} onChange={(n) => setAnte(Math.min(2500, n))} max={2500} /></div>
          <div className="row wrap" style={{ justifyContent: 'center' }}><span className="muted">Pair Plus</span>{[0, 10, 50, 100].map((x) => <button key={x} className={`btn btn-sm ${pp === x ? 'btn-cool' : ''}`} onClick={() => setPp(x)}>{x || 'none'}</button>)}</div>
          <button className="btn btn-gold btn-lg" onClick={() => act({ type: 'deal', ante, pairPlus: pp || undefined })} disabled={ctl.busy}>Deal</button>
        </div>
      )}
      <Net net={v.net} />
      <p className="dim" style={{ fontSize: 12, textAlign: 'center', maxWidth: 520 }}>Ante bonus: Straight 1:1 · Trips 4:1 · Straight flush 5:1. Pair Plus: Pair 1 · Flush 3 · Straight 6 · Trips 30 · Straight flush 40.</p>
    </>
  );
}
