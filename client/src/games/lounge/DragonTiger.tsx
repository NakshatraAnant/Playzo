import { useState } from 'react';
import { useCtl } from '../runtime';
import { Card, Net, Outcome, ChipPicker } from './common';
import { sfx } from '../../lib/sound';

export default function DragonTiger() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [chip, setChip] = useState(100);
  const [bets, setBets] = useState<Record<string, number>>({});
  const L = v.last;
  const deal = async () => {
    sfx.deal();
    try { const r = await ctl.act({ type: 'deal', bets }); const w = r.view.last.winner; bets[w] ? sfx.win() : w === 'tie' && (bets.dragon || bets.tiger) ? sfx.coin() : sfx.lose(); } catch { /* toast */ }
  };
  const spot = (k: string, label: string, sub: string, col: string) => (
    <button onClick={() => { setBets({ ...bets, [k]: Math.min(5000, (bets[k] ?? 0) + chip) }); sfx.deal(); }} style={{ minHeight: 90, borderRadius: 16, border: `2px solid ${col}`, background: `color-mix(in srgb, ${col} 22%, transparent)`, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
      {label}<div style={{ fontSize: 11, opacity: 0.75, fontFamily: 'var(--font-body)' }}>{sub}</div>{bets[k] ? <div className="chip gold mono" style={{ marginTop: 6 }}>{bets[k]}</div> : null}
    </button>
  );
  return (
    <>
      <div className="felt" style={{ ['--felt' as any]: '#2a0a24', width: '100%', maxWidth: 720, display: 'grid', gap: 16 }}>
        <div className="row" style={{ justifyContent: 'space-around' }}>
          <div className="col" style={{ alignItems: 'center' }}><b style={{ color: '#a98bff', fontFamily: 'var(--font-display)' }}>DRAGON</b>{L ? <Card key={`d${v.history.length}`} c={L.dragon} /> : <div className="playing-card back" />}</div>
          <div className="col" style={{ alignItems: 'center' }}><b style={{ color: '#ff9a3c', fontFamily: 'var(--font-display)' }}>TIGER</b>{L ? <Card key={`t${v.history.length}`} c={L.tiger} i={1} /> : <div className="playing-card back" />}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 1fr', gap: 10 }}>
          {spot('dragon', 'DRAGON', '1:1 · half back on tie', '#7c5cff')}{spot('tie', 'TIE', '8:1', '#0d8a4f')}{spot('tiger', 'TIGER', '1:1 · half back on tie', '#ff7a3d')}
        </div>
        <div className="row wrap" style={{ gap: 4 }}>{v.history.slice(0, 30).map((h: any, i: number) => <span key={i} className="center" style={{ width: 22, height: 22, borderRadius: 11, fontSize: 10, fontWeight: 900, background: h.winner === 'dragon' ? '#7c5cff' : h.winner === 'tiger' ? '#ff7a3d' : '#0d8a4f' }}>{h.winner[0].toUpperCase()}</span>)}</div>
      </div>
      {L && <Outcome text={`${L.winner.toUpperCase()}${L.winner === 'tie' ? '' : ' wins'}`} good={bets[L.winner] ? true : null} />}
      <ChipPicker value={chip} onChange={setChip} />
      <div className="row"><button className="btn" onClick={() => setBets({})}>Clear</button><button className="btn btn-gold btn-lg" onClick={deal} disabled={ctl.busy || !Object.values(bets).some(Boolean)}>Deal</button></div>
      <Net net={v.net} />
      <p className="dim" style={{ fontSize: 12 }}>Aces are low, Kings high. Eight-deck shoe shuffled by the server.</p>
    </>
  );
}
