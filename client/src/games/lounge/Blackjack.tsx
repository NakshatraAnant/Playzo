import { useEffect, useRef, useState } from 'react';
import { useCtl, useKeys } from '../runtime';
import { Hand, Net, Outcome, StakeInput, useStake } from './common';
import { sfx } from '../../lib/sound';

export default function Blackjack() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [stake, setStake] = useStake('blackjack');
  const [hint, setHint] = useState(false);
  const act = (type: string, extra: object = {}) => { sfx.deal(); ctl.act({ type, ...extra }).catch(() => undefined); };
  const prev = useRef(v.phase);
  useEffect(() => {
    if (prev.current === 'player' && v.phase === 'done' || (prev.current !== 'player' && v.phase === 'done' && v.lastResult)) {
      const r: string[] = v.lastResult ?? [];
      r.some((x) => /Win|Blackjack/.test(x)) ? sfx.win() : r.every((x) => x === 'Push') ? sfx.coin() : sfx.lose();
    }
    prev.current = v.phase;
  }, [v.phase, v.lastResult]);
  const playing = v.phase === 'player';
  useKeys({ h: () => playing && act('hit'), s: () => playing && act('stand'), d: () => playing && v.canDouble && act('double') }, [playing, v.canDouble]);
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#4a0d1c', width: '100%', maxWidth: 720, display: 'grid', gap: 22, justifyItems: 'center', minHeight: 360 }}>
        <Hand cards={v.dealer} label="Dealer" total={v.dealerTotal} />
        <div className="dim" style={{ fontSize: 12, letterSpacing: '0.1em' }}>BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON ALL 17s</div>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 28 }}>
          {v.hands.length ? v.hands.map((h: any, i: number) => (
            <div key={i} style={{ padding: 8, borderRadius: 14, outline: playing && v.active === i ? '2px solid #f0c46b' : undefined }}>
              <Hand cards={h.cards} label={`${v.hands.length > 1 ? `Hand ${i + 1} · ` : 'You · '}bet ${h.bet}`} total={`${h.soft && h.total <= 21 ? 'soft ' : ''}${h.total}${h.outcome ? ` · ${h.outcome}` : ''}`} />
            </div>
          )) : <p className="muted">Place your bet and deal.</p>}
        </div>
      </div>
      {v.lastResult && <Outcome text={v.lastResult.join(' · ')} good={v.lastResult.some((x: string) => /Win|Blackjack/.test(x)) ? true : v.lastResult.every((x: string) => x === 'Push') ? null : false} />}
      {v.reshuffled && <span className="chip">Shoe reshuffled</span>}
      {playing ? (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button className="btn btn-lg" onClick={() => act('hit')} disabled={ctl.busy}>Hit (H)</button>
          <button className="btn btn-lg" onClick={() => act('stand')} disabled={ctl.busy}>Stand (S)</button>
          <button className="btn btn-lg" onClick={() => act('double')} disabled={!v.canDouble || ctl.busy}>Double (D)</button>
          <button className="btn btn-lg" onClick={() => act('split')} disabled={!v.canSplit || ctl.busy}>Split</button>
          <button className={`btn ${hint ? 'btn-cool' : 'btn-ghost'}`} onClick={() => setHint(!hint)}>{hint && v.hint ? `Strategy: ${v.hint.toUpperCase()}` : 'Show strategy hint'}</button>
        </div>
      ) : (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <StakeInput value={stake} onChange={setStake} />
          <button className="btn btn-gold btn-lg" onClick={() => act('deal', { amount: stake })} disabled={ctl.busy}>Deal</button>
        </div>
      )}
      <Net net={v.net} />
      <p className="dim" style={{ fontSize: 12 }}>Shoe: {v.shoeLeft} cards left of 312. Outcomes come from a server-side cryptographic shuffle.</p>
    </>
  );
}
