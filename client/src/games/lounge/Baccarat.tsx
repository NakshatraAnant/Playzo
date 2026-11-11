import { useState } from 'react';
import { useCtl } from '../runtime';
import { Hand, Net, Outcome, ChipPicker } from './common';
import { sfx } from '../../lib/sound';

const SPOTS = [{ k: 'player', label: 'PLAYER', pays: '1:1', col: '#1f5fbf' }, { k: 'tie', label: 'TIE', pays: '8:1', col: '#0d8a4f' }, { k: 'banker', label: 'BANKER', pays: '0.95:1', col: '#bf1f3a' }] as const;

export default function Baccarat() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [chip, setChip] = useState(100);
  const [bets, setBets] = useState<Record<string, number>>({});
  const deal = async () => {
    if (!Object.values(bets).some(Boolean)) return;
    sfx.deal();
    try {
      const r = await ctl.act({ type: 'deal', bets });
      const w = r.view.last.winner;
      bets[w] ? sfx.win() : sfx.lose();
    } catch { /* toast */ }
  };
  const L = v.last;
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#06402e', width: '100%', maxWidth: 760, display: 'grid', gap: 18 }}>
        <div className="row wrap" style={{ justifyContent: 'space-around', minHeight: 140 }}>
          <Hand cards={L?.player ?? []} label="Player" total={L ? L.pt : null} />
          <Hand cards={L?.banker ?? []} label="Banker" total={L ? L.bt : null} />
        </div>
        {L && <div className="panel panel-tight" style={{ background: 'rgba(0,0,0,.25)', fontSize: 13 }}><b style={{ color: '#e7c873' }}>Tableau</b>{L.notes.map((n: string, i: number) => <div key={i} className="muted">{n}</div>)}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 1fr', gap: 10 }}>
          {SPOTS.map((s) => (
            <button key={s.k} onClick={() => { setBets({ ...bets, [s.k]: Math.min(5000, (bets[s.k] ?? 0) + chip) }); sfx.deal(); }}
              style={{ minHeight: 96, borderRadius: 18, border: `2px solid ${s.col}`, background: `color-mix(in srgb, ${s.col} 25%, transparent)`, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
              {s.label}<div style={{ fontSize: 12, opacity: 0.75, fontFamily: 'var(--font-body)' }}>pays {s.pays}</div>
              {bets[s.k] ? <div className="chip gold mono" style={{ marginTop: 6 }}>{bets[s.k]}</div> : null}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 4 }} aria-label="Bead road (recent winners)">
          {v.history.slice(0, 30).map((h: any, i: number) => <span key={i} className="center" style={{ width: 22, height: 22, borderRadius: 11, fontSize: 10, fontWeight: 900, background: h.winner === 'player' ? '#1f5fbf' : h.winner === 'banker' ? '#bf1f3a' : '#0d8a4f' }}>{h.winner[0].toUpperCase()}</span>)}
        </div>
      </div>
      {L && <Outcome text={`${L.winner.toUpperCase()} wins ${L.pt}-${L.bt}`} good={bets[L.winner] ? true : null} />}
      <ChipPicker value={chip} onChange={setChip} />
      <div className="row">
        <button className="btn" onClick={() => setBets({})}>Clear bets</button>
        <button className="btn btn-gold btn-lg" onClick={deal} disabled={ctl.busy || !Object.values(bets).some(Boolean)}>Deal</button>
      </div>
      <Net net={v.net} />
    </>
  );
}
