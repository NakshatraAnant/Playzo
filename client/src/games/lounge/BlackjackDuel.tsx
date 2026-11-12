import { useEffect, useRef } from 'react';
import { useCtl } from '../runtime';
import { Hand, Net, Outcome, StakeInput, useStake } from './common';
import { sfx } from '../../lib/sound';

export default function BlackjackDuel() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [stake, setStake] = useStake('duel');
  const act = (type: string, extra: object = {}) => { sfx.deal(); ctl.act({ type, ...extra }).catch(() => undefined); };
  const prev = useRef(v.outcome);
  useEffect(() => { if (v.outcome && v.outcome !== prev.current) /Win|busts|Natural/.test(v.outcome) ? sfx.win() : /push/i.test(v.outcome) ? sfx.neutral() : sfx.lose(); prev.current = v.outcome; }, [v.outcome]);
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#06343a', width: '100%', maxWidth: 720, display: 'grid', gap: 18, justifyItems: 'center', minHeight: 330 }}>
        <Hand cards={v.rival} label="Rival (hits below 17)" total={v.rivalTotal} />
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, color: '#ff9a3c' }}>VS</div>
        <Hand cards={v.you} label={`You${v.bet ? ` · bet ${v.bet}` : ''}`} total={v.you.length ? v.youTotal : null} />
      </div>
      <Outcome text={v.outcome} good={v.outcome ? (/Win|busts|Natural/.test(v.outcome) ? true : /push/i.test(v.outcome) ? null : false) : null} />
      {v.phase === 'player' ? (
        <div className="row"><button className="btn btn-lg" onClick={() => act('hit')} disabled={ctl.busy}>Hit</button><button className="btn btn-lg" onClick={() => act('stand')} disabled={ctl.busy}>Stand</button></div>
      ) : (
        <div className="row wrap" style={{ justifyContent: 'center' }}><StakeInput value={stake} onChange={setStake} /><button className="btn btn-gold btn-lg" onClick={() => act('deal', { amount: stake })} disabled={ctl.busy}>Deal duel</button></div>
      )}
      <Net net={v.net} />
    </>
  );
}
