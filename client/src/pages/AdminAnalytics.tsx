/** Admin → Analytics: first-party product metrics with simple accessible charts and a date-range filter. */
import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/store';
import { BY_ID } from '@shared/catalogue';

const fmt = (v: number | null | undefined, suffix = '') => (v === null || v === undefined ? '–' : `${v.toLocaleString()}${suffix}`);

function LineChart({ label, days, series, color }: { label: string; days: string[]; series: number[]; color: string }) {
  const W = 320, H = 110, pad = 6;
  const max = Math.max(1, ...series);
  const pts = series.map((v, i) => [pad + (i * (W - pad * 2)) / Math.max(1, series.length - 1), H - pad - (v / max) * (H - pad * 2)]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const total = series.reduce((a, b) => a + b, 0);
  return (
    <figure className="panel chart" style={{ margin: 0 }}>
      <figcaption className="row" style={{ gap: 8 }}><b style={{ flex: 1 }}>{label}</b><span className="dim mono" style={{ fontSize: 12 }}>total {total.toLocaleString()} · max {max.toLocaleString()}/day</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${series.join(', ')} per day from ${days[0]} to ${days[days.length - 1]}`} style={{ width: '100%', height: 'auto' }}>
        <path d={`${path} L${pts[pts.length - 1][0]},${H - pad} L${pts[0][0]},${H - pad} Z`} fill={color} opacity={0.15} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={series[i] ? 2.2 : 0}><title>{`${days[i]}: ${series[i]}`}</title></circle>)}
      </svg>
      <div className="row dim" style={{ fontSize: 11, justifyContent: 'space-between' }}><span>{days[0]}</span><span>{days[days.length - 1]}</span></div>
    </figure>
  );
}

function Kpi({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return <div className="panel kpi"><span className="dim">{k}</span><b>{v}</b>{sub && <span className="dim" style={{ fontSize: 11 }}>{sub}</span>}</div>;
}

export function Analytics() {
  const [days, setDays] = useState(14);
  const { data, loading } = useAsync(() => api.get(`/api/admin/analytics?days=${days}`), [days]);
  if (!data) return <div className="spinner" />;
  const k = data.kpis;
  return (
    <div className="stack" style={{ opacity: loading ? 0.6 : 1 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="seg" aria-label="Date range">{[7, 14, 30, 90].map((n) => <button key={n} className={days === n ? 'on' : ''} onClick={() => setDays(n)} aria-pressed={days === n}>{n} days</button>)}</div>
        <span className="dim" style={{ fontSize: 13 }}>From {data.from} · first-party data only, no third-party trackers</span>
      </div>
      <div className="kpi-grid">
        <Kpi k="Daily active (today)" v={fmt(k.dau)} />
        <Kpi k="Weekly active" v={fmt(k.wau)} />
        <Kpi k="Homepage visits" v={fmt(k.homeVisits)} />
        <Kpi k="Game starts" v={fmt(k.gameStarts)} sub={`${fmt(k.completionRate, '%')} completed`} />
        <Kpi k="Guest → registered" v={fmt(k.guestToRegistration.rate, '%')} sub={`${k.guestToRegistration.upgraded}/${k.guestToRegistration.guests} guests`} />
        <Kpi k="First-game completion" v={fmt(k.firstGameCompletion.rate, '%')} sub={`${k.firstGameCompletion.completed}/${k.firstGameCompletion.players} new players`} />
        <Kpi k="D1 retention" v={fmt(k.d1.rate, '%')} sub={`cohort ${k.d1.cohort}`} />
        <Kpi k="D7 retention" v={fmt(k.d7.rate, '%')} sub={`cohort ${k.d7.cohort}`} />
        <Kpi k="Sessions per player" v={fmt(k.sessionsPerUser)} />
        <Kpi k="Games per session" v={fmt(k.gamesPerSession)} />
        <Kpi k="Rooms created" v={fmt(k.roomsCreated)} sub={`${fmt(k.invitationAcceptance.rate, '%')} started a match`} />
        <Kpi k="Challenge completion" v={fmt(k.challengeCompletion.rate, '%')} sub={`${k.challengeCompletion.completed}/${k.challengeCompletion.created}`} />
        <Kpi k="Game load (p50 / p95)" v={k.gameLoadMs.p50 === null ? '–' : `${k.gameLoadMs.p50} / ${k.gameLoadMs.p95} ms`} sub={`${k.gameLoadMs.samples} samples`} />
        <Kpi k="Crash-free sessions" v={fmt(k.crashFreeSessions.rate, '%')} sub={`${k.crashFreeSessions.withErrors} with errors`} />
        <Kpi k="Support requests" v={fmt(k.supportRequests)} />
      </div>
      <div className="chart-grid">
        <LineChart label="Active players" days={data.dayList} series={data.series.active} color="#7c4dff" />
        <LineChart label="Homepage visits" days={data.dayList} series={data.series.home} color="#00c2ff" />
        <LineChart label="Game starts" days={data.dayList} series={data.series.starts} color="#ff3d8b" />
        <LineChart label="Game completions" days={data.dayList} series={data.series.completions} color="#2ed573" />
        <LineChart label="Registrations" days={data.dayList} series={data.series.registrations} color="#ffb020" />
        <LineChart label="Rooms created" days={data.dayList} series={data.series.rooms} color="#a78bfa" />
      </div>
      <div className="panel">
        <div className="panel-title"><h3>Most played games</h3></div>
        {data.topGames.length ? (
          <div className="col" style={{ gap: 6 }}>
            {data.topGames.map((g: any) => {
              const max = data.topGames[0].starts;
              return <div key={g.game_id} className="row" style={{ gap: 10, fontSize: 13 }}><span style={{ width: 150, flex: 'none' }}>{BY_ID[g.game_id]?.title ?? g.game_id}</span><span className="bar"><i style={{ width: `${(g.starts / max) * 100}%` }} /></span><span className="mono dim">{g.starts} · {g.completed} done</span></div>;
            })}
          </div>
        ) : <p className="dim">No games played in this range yet.</p>}
      </div>
      <details className="dim" style={{ fontSize: 12 }}><summary>Metric definitions</summary><ul>{Object.entries(data.definitions).map(([key, v]) => <li key={key}><b>{key}</b>: {String(v)}</li>)}</ul></details>
    </div>
  );
}
