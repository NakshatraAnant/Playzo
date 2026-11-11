import { useEffect, useRef, useState } from 'react';
import { useCtl } from '../runtime';
import { Net, Outcome, StakeInput, useStake } from './common';
import { serverNow } from '../../lib/api';
import { sfx } from '../../lib/sound';

export default function CrashFlight() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const [stake, setStake] = useStake('crash', 100);
  const [auto, setAuto] = useState<string>('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const flying = v.phase === 'flying';
  const multAt = (ms: number) => Math.floor(Math.exp(v.growth * Math.max(0, ms)) * 100) / 100;
  // Poll the server while flying so stalls / auto-banks resolve on server time.
  useEffect(() => {
    if (!flying) return;
    const id = setInterval(() => ctl.act({ type: 'tick' }).then((r) => { if (r?.view?.phase === 'done') r.view.bankedAt ? sfx.win() : sfx.lose(); }).catch(() => undefined), 400);
    return () => clearInterval(id);
  }, [flying, ctl]);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = canvas.current; if (!c) return;
      const g = c.getContext('2d')!;
      const W = c.width, H = c.height;
      g.clearRect(0, 0, W, H);
      const elapsed = flying ? serverNow() - v.start : v.reveal ? Math.log(Math.max(1, v.bankedAt ?? v.reveal.point)) / v.growth : 0;
      const m = flying ? multAt(elapsed) : v.reveal ? (v.bankedAt ?? v.reveal.point) : 1;
      const maxT = Math.max(8000, elapsed * 1.2), maxM = Math.max(2, m * 1.25);
      g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
      for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, (H / 5) * i); g.lineTo(W, (H / 5) * i); g.stroke(); }
      if (elapsed > 0) {
        g.beginPath();
        let lx = 0, ly = H;
        for (let t = 0; t <= elapsed; t += Math.max(30, elapsed / 120)) {
          const mm = Math.exp(v.growth * t);
          lx = (t / maxT) * W; ly = H - ((mm - 1) / (maxM - 1)) * (H - 30);
          t === 0 ? g.moveTo(lx, ly) : g.lineTo(lx, ly);
        }
        const grad = g.createLinearGradient(0, H, W, 0); grad.addColorStop(0, '#ff7a3d'); grad.addColorStop(1, '#ff3d8b');
        g.strokeStyle = grad; g.lineWidth = 5; g.stroke();
        g.save(); g.translate(lx, ly); g.rotate(-0.6); g.fillStyle = '#fff';
        g.beginPath(); g.moveTo(14, 0); g.lineTo(-12, -8); g.lineTo(-6, 0); g.lineTo(-12, 8); g.closePath(); g.fill(); g.restore();
      }
      g.font = '900 54px Unbounded, sans-serif'; g.textAlign = 'center';
      g.fillStyle = !flying && v.reveal && !v.bankedAt ? '#ff4d6d' : '#fff';
      g.fillText(flying && serverNow() < v.start ? `T-${((v.start - serverNow()) / 1000).toFixed(1)}` : `${m.toFixed(2)}×`, W / 2, H / 2);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const takeoff = () => { sfx.whoosh(); ctl.act({ type: 'takeoff', amount: stake, auto: auto ? Number(auto) : null }).catch(() => undefined); };
  const bank = () => ctl.act({ type: 'bank' }).then((r) => { r.view.bankedAt ? sfx.win() : sfx.lose(); }).catch(() => undefined);
  return (
    <>
      <div style={{ width: '100%', maxWidth: 720, borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(180deg, #0b1440, #03040f)', border: '1px solid rgba(255,122,61,.3)' }}>
        <canvas ref={canvas} width={720} height={340} style={{ width: '100%', display: 'block' }} role="img" aria-label="Flight multiplier chart" />
      </div>
      {v.phase === 'done' && v.reveal && <Outcome text={v.bankedAt ? `Banked at ${v.bankedAt.toFixed(2)}× · +${v.won.toLocaleString()} · stall was ${v.reveal.point.toFixed(2)}×` : `Stalled at ${v.reveal.point.toFixed(2)}×`} good={!!v.bankedAt} />}
      {flying ? (
        <button className="btn btn-gold btn-lg" style={{ minWidth: 240, fontSize: 20 }} onClick={bank} disabled={serverNow() < v.start}>Bank now</button>
      ) : (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <StakeInput value={stake} onChange={setStake} />
          <input className="input mono" style={{ width: 130, minHeight: 40 }} placeholder="Auto-bank ×" value={auto} onChange={(e) => setAuto(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Auto-bank multiplier (optional)" />
          <button className="btn btn-gold btn-lg" onClick={takeoff} disabled={ctl.busy}>Take off</button>
        </div>
      )}
      <div className="panel panel-tight mono" style={{ width: '100%', maxWidth: 720, fontSize: 11, wordBreak: 'break-all' }}>
        <div><b>Commitment</b> (SHA-256 of stall point + salt, fixed at take-off): {v.commit || '-'}</div>
        {v.reveal && <div style={{ marginTop: 4 }}><b>Reveal</b>: {v.reveal.point.toFixed(2)} · salt {v.reveal.salt}</div>}
      </div>
      <div className="row wrap" style={{ gap: 4 }}>{v.history.slice(0, 16).map((h: any, i: number) => <span key={i} className={`chip mono ${h.banked ? 'ok' : ''}`}>{h.point.toFixed(2)}×</span>)}</div>
      <Net net={v.net} />
      <p className="dim" style={{ fontSize: 12, textAlign: 'center', maxWidth: 560 }}>P(stall ≥ m) = 0.98 ÷ m. Banking uses the server clock, so the multiplier on screen may differ from the banked value by network latency.</p>
    </>
  );
}
