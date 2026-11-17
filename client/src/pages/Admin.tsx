import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { Chip, Empty, Modal, useTitle } from '../components/ui';
import { Icon } from '../components/Icon';
import { Rooms, Content, Legal, Emails, System, Errors, FairPlay } from './AdminExtra';
import { SupportAdmin } from './AdminSupport';
import { Analytics } from './AdminAnalytics';

const TABS = ['Overview', 'Analytics', 'Users', 'Support', 'Reports', 'Fair play', 'Games', 'Rooms', 'Content', 'Economy', 'Legal', 'Emails', 'Ads', 'System', 'Errors', 'Compliance', 'Audit'] as const;

export default function Admin() {
  useTitle('Admin');
  const { me } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  if (!me || (me.role !== 'admin' && me.role !== 'support')) return <Empty icon="lock" title="Not permitted">Staff accounts only.</Empty>;
  return (
    <div className="stack">
      <div className="row wrap"><h1 style={{ fontSize: 'var(--fs-2xl)', flex: 1 }}>Admin</h1><Chip tone="on">{me.role}</Chip></div>
      <div className="seg" style={{ flexWrap: 'wrap' }}>{TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Overview' && <Overview />}
      {tab === 'Analytics' && <Analytics />}
      {tab === 'Users' && <Users />}
      {tab === 'Support' && <SupportAdmin />}
      {tab === 'Fair play' && <FairPlay />}
      {tab === 'Reports' && <Reports />}
      {tab === 'Games' && <Games />}
      {tab === 'Rooms' && <Rooms />}
      {tab === 'Content' && <Content />}
      {tab === 'Economy' && <Economy />}
      {tab === 'Legal' && <Legal />}
      {tab === 'Emails' && <Emails />}
      {tab === 'System' && <System />}
      {tab === 'Errors' && <Errors />}
      {tab === 'Ads' && <Ads />}
      {tab === 'Compliance' && <Compliance />}
      {tab === 'Audit' && <Audit />}
    </div>
  );
}

function Overview() {
  const { data } = useAsync(() => api.get('/api/admin/overview'), []);
  if (!data) return <div className="spinner" />;
  const r = (x: any) => (x.rate === null ? 'n/a' : `${Math.round(x.rate * 100)}% (${x.kept}/${x.cohort})`);
  const maxU = Math.max(1, ...data.daily.map((d: any) => d.users));
  return (
    <>
      <div className="grid-kpi">
        {[['DAU', data.dau], ['WAU', data.wau], ['MAU', data.mau], ['Users', data.users], ['Guests', data.guests], ['Sessions (30d)', data.sessions.n], ['Completed', data.sessions.done ?? 0], ['Avg session', data.sessions.avg ? `${Math.round(data.sessions.avg)}s` : 'n/a'], ['Matches (30d)', data.multiplayer], ['Live rooms', data.liveRooms], ['Rejected runs', data.rejected], ['Client errors (7d)', data.errors]].map(([k, v]) => <div key={k as string} className="panel panel-tight kpi"><b className="mono">{v as any}</b><span>{k}</span></div>)}
      </div>
      <div className="row wrap" style={{ alignItems: 'stretch', gap: 16 }}>
        <div className="panel" style={{ flex: '2 1 380px' }}>
          <div className="panel-title"><h3>Daily active users (14d)</h3></div>
          <svg viewBox={`0 0 ${Math.max(1, data.daily.length) * 30} 120`} style={{ width: '100%', height: 140 }} role="img" aria-label="Daily active users chart">
            {data.daily.map((d: any, i: number) => <g key={d.day}><rect x={i * 30 + 4} y={110 - (d.users / maxU) * 100} width={22} height={(d.users / maxU) * 100} rx={4} fill="#ff3d8b" /><title>{`${d.day}: ${d.users} users`}</title></g>)}
          </svg>
          {!data.daily.length && <p className="dim">No activity recorded yet.</p>}
        </div>
        <div className="panel" style={{ flex: '1 1 260px' }}>
          <div className="panel-title"><h3>Retention</h3></div>
          <p>D1: <b>{r(data.retention.d1)}</b></p><p>D7: <b>{r(data.retention.d7)}</b></p>
          <div className="divider" />
          <div className="panel-title"><h3>Popular (30d)</h3></div>
          {data.popular.map((p: any) => <div key={p.game_id} className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}>{p.game_id}</span><b className="mono">{p.plays}</b></div>)}
          <div className="divider" />
          <div className="panel-title"><h3>Acquisition</h3></div>
          {data.acquisition.length ? data.acquisition.map((a: any) => <div key={a.source} className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}>{a.source}</span><b>{a.n}</b></div>) : <p className="dim" style={{ fontSize: 13 }}>No utm_source traffic yet.</p>}
        </div>
      </div>
      <div className="panel"><p className="muted" style={{ fontSize: 13 }}>Economy: {data.ledger.txs} ledger entries · {data.ledger.zoIssued} ZO issued · {data.ledger.chipsGranted} Fun Chips granted (free, non-redeemable). Revenue: no live payment provider (dev-mock only).</p></div>
    </>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const { data, reload } = useAsync(() => api.get(`/api/admin/users?q=${encodeURIComponent(q)}`), [q]);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <input className="input" placeholder="Search username, email or id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
      <div className="table-wrap"><table className="data"><thead><tr><th>User</th><th>Email</th><th>Band</th><th>Role</th><th>Status</th><th>Lvl</th><th>Joined</th></tr></thead><tbody>
        {data?.users?.map((u: any) => <tr key={u.id} onClick={() => setSel(u.id)} style={{ cursor: 'pointer' }}><td>{u.username}{u.is_guest ? ' (guest)' : ''}</td><td>{u.email ?? '-'}</td><td>{u.age_band}{u.adult_verified_at ? ' ✓' : ''}</td><td>{u.role}</td><td><Chip tone={u.status === 'active' ? 'ok' : 'bad'}>{u.status}</Chip></td><td>{u.level}</td><td>{u.created_at.slice(0, 10)}</td></tr>)}
      </tbody></table></div>
      {sel && <UserDetail id={sel} onClose={() => { setSel(null); reload(); }} />}
    </>
  );
}

function UserDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast, me } = useStore();
  const { data, reload } = useAsync(() => api.get(`/api/admin/users/${id}`), [id]);
  const [adj, setAdj] = useState({ amount: 0, reason: '' });
  const act = async (url: string, body: object) => { try { await api.post(url, body); toast('Done', 'ok'); reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <Modal open onClose={onClose} title={data?.user?.username ?? 'User'} wide>
      {!data ? <div className="spinner" /> : (
        <div className="stack">
          <p className="muted" style={{ fontSize: 13 }}>{data.user.id} · {data.user.email ?? 'no email'} · DOB {data.user.dob ?? '-'} · band {data.user.age_band} · adult verification {data.user.adult_verify_method ?? 'none'} · parental consent {data.user.parental_consent_at ? 'yes' : 'no'}{data.age ? ` · age ${data.age.years} (${data.age.source}) · Lounge-eligible by age: ${data.age.loungeEligible ? 'yes' : 'no'}` : ''}</p>
          <p>ZO {data.balances.ZO} · Fun Chips {data.balances.CHIPS}</p>
          <div className="row wrap">
            {data.user.status === 'active' ? <button className="btn btn-danger" onClick={() => act(`/api/admin/users/${id}/status`, { status: 'suspended', reason: 'admin action' })}>Suspend</button> : <button className="btn" onClick={() => act(`/api/admin/users/${id}/status`, { status: 'active' })}>Reactivate</button>}
            {me?.role === 'admin' && <select className="input" style={{ maxWidth: 160 }} value={data.user.role} onChange={(e) => act(`/api/admin/users/${id}/role`, { role: e.target.value })} aria-label="Role"><option>user</option><option>tester</option><option>support</option><option>admin</option></select>}
            <button className="btn" onClick={() => act(`/api/admin/users/${id}/revoke-sessions`, {})}>Sign out everywhere</button>
          </div>
          {me?.role === 'admin' && (
            <div className="row wrap"><input className="input" type="number" style={{ maxWidth: 120 }} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: Number(e.target.value) })} aria-label="ZO amount" /><input className="input" placeholder="Reason (required, audited)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} style={{ flex: 1 }} aria-label="Reason" /><button className="btn" onClick={() => act(`/api/admin/users/${id}/adjust`, adj)}>Adjust ZO</button></div>
          )}
          <h4>Sessions</h4>
          <div className="table-wrap"><table className="data"><tbody>{data.sessions.map((s: any) => <tr key={s.id}><td>{s.game_id}</td><td>{s.status}</td><td>{s.score ?? ''}</td><td>{s.reject_reason ?? ''}</td><td>{s.started_at.slice(0, 16)}</td></tr>)}</tbody></table></div>
          <h4>Ledger</h4>
          <div className="table-wrap"><table className="data"><tbody>{data.ledger.slice(0, 40).map((l: any) => <tr key={l.id}><td>{l.currency}</td><td className="mono">{l.amount}</td><td>{l.type}</td><td>{l.source}</td><td>{l.created_at.slice(0, 16)}</td></tr>)}</tbody></table></div>
          {data.reports.length > 0 && <><h4>Reports against user</h4>{data.reports.map((r: any) => <p key={r.id} className="muted">{r.reason}: {r.details ?? ''} ({r.status})</p>)}</>}
        </div>
      )}
    </Modal>
  );
}

function Reports() {
  const { data, reload } = useAsync(() => api.get('/api/admin/reports'), []);
  const resolve = async (id: string, status: string) => { await api.post(`/api/admin/reports/${id}`, { status }); reload(); };
  if (!data?.reports?.length) return <Empty icon="shield" title="No reports" />;
  return <div className="table-wrap"><table className="data"><thead><tr><th>Target</th><th>Reporter</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>{data.reports.map((r: any) => <tr key={r.id}><td>{r.target_name}</td><td>{r.reporter_name}</td><td>{r.reason}{r.details ? `: ${r.details}` : ''}</td><td>{r.status}</td><td>{r.status === 'open' && <><button className="btn btn-sm" onClick={() => resolve(r.id, 'actioned')}>Actioned</button> <button className="btn btn-sm btn-ghost" onClick={() => resolve(r.id, 'dismissed')}>Dismiss</button></>}</td></tr>)}</tbody></table></div>;
}

function Games() {
  const { me } = useStore();
  const { data, reload } = useAsync(() => api.get('/api/admin/games'), []);
  const set = async (id: string, status: string) => { await api.post(`/api/admin/games/${id}`, { status }); reload(); };
  return <div className="table-wrap"><table className="data"><thead><tr><th>#</th><th>Game</th><th>Env</th><th>Status</th><th>Legal gate</th><th>Plays</th><th>Done</th><th>Rejected</th><th>Avg score</th></tr></thead><tbody>
    {data?.games?.map((g: any) => <tr key={g.id}><td>{g.n}</td><td>{g.title}</td><td>{g.env}</td><td>{me?.role === 'admin' ? <select className="input" style={{ minHeight: 32, padding: '4px 8px' }} value={g.status} onChange={(e) => set(g.id, e.target.value)} aria-label={`Status of ${g.title}`}><option>live</option><option>maintenance</option><option>hidden</option></select> : g.status}</td><td>{g.legal ? <Chip tone={g.legal.status === 'approved' ? 'ok' : g.legal.status === 'dev-preview' ? 'bad' : 'warn'}>{g.legal.status}</Chip> : '-'}</td><td>{g.plays}</td><td>{g.completed}</td><td>{g.rejected}</td><td>{g.avg_score ? Math.round(g.avg_score) : '-'}</td></tr>)}
  </tbody></table></div>;
}

function Economy() {
  const [cur, setCur] = useState('');
  const { data } = useAsync(() => api.get(`/api/admin/ledger${cur ? `?currency=${cur}` : ''}`), [cur]);
  return (
    <>
      <div className="seg">{['', 'ZO', 'CHIPS'].map((c) => <button key={c} className={cur === c ? 'on' : ''} onClick={() => setCur(c)}>{c || 'All'}</button>)}</div>
      <div className="row wrap" style={{ alignItems: 'stretch', gap: 16 }}>
        <div className="panel" style={{ flex: '1 1 300px' }}><div className="panel-title"><h3>Rejected replays</h3></div>{data?.suspicious?.rejectedRuns?.length ? data.suspicious.rejectedRuns.map((r: any) => <p key={r.id} className="muted" style={{ fontSize: 13 }}>{r.username} · {r.game_id} · {r.reject_reason}</p>) : <p className="dim">None</p>}</div>
        <div className="panel" style={{ flex: '1 1 300px' }}><div className="panel-title"><h3>Top ZO earners today</h3></div>{data?.suspicious?.topEarners?.map((r: any) => <p key={r.user_id} className="muted" style={{ fontSize: 13 }}>{r.username} · {r.zo} ZO</p>)}</div>
      </div>
      <div className="table-wrap"><table className="data"><thead><tr><th>When</th><th>User</th><th>Cur</th><th>Amount</th><th>Balance</th><th>Type</th><th>Source</th><th>Idempotency key</th></tr></thead><tbody>{data?.entries?.map((l: any) => <tr key={l.id}><td>{l.created_at.slice(0, 19)}</td><td>{l.username}</td><td>{l.currency}</td><td className="mono">{l.amount}</td><td className="mono">{l.balance_after}</td><td>{l.type}</td><td>{l.source}</td><td className="mono" style={{ fontSize: 11 }}>{l.idempotency_key}</td></tr>)}</tbody></table></div>
    </>
  );
}

function Ads() {
  const { me } = useStore();
  const { data, reload } = useAsync(() => api.get('/api/admin/ads'), []);
  const upd = async (p: any, b: object) => { await api.post(`/api/admin/ads/${p.id}`, { enabled: p.enabled, frequencyCap: p.frequency_cap_per_day, ...b }); reload(); };
  return (
    <>
      <p className="muted" style={{ fontSize: 14 }}>Contextual placements only, with no behavioural targeting. Adult placements are never served to under-18 or unknown-age accounts, and gambling advertising is never shown to minors. Plus members see none.</p>
      <div className="table-wrap"><table className="data"><thead><tr><th>Slot</th><th>Audience</th><th>Label</th><th>Sponsor</th><th>Cap/day</th><th>Impr.</th><th>Clicks</th><th>Enabled</th></tr></thead><tbody>
        {data?.placements?.map((p: any) => <tr key={p.id}><td>{p.slot}</td><td>{p.env}</td><td>{p.label}</td><td>{p.sponsor ?? 'house'}</td><td><input type="number" className="input" style={{ width: 70, minHeight: 32 }} defaultValue={p.frequency_cap_per_day} disabled={me?.role !== 'admin'} onBlur={(e) => upd(p, { frequencyCap: Number(e.target.value) })} aria-label="Frequency cap" /></td><td>{p.impressions}</td><td>{p.clicks}</td><td><input type="checkbox" checked={!!p.enabled} disabled={me?.role !== 'admin'} onChange={(e) => upd(p, { enabled: e.target.checked })} aria-label="Enabled" /></td></tr>)}
      </tbody></table></div>
    </>
  );
}

function Compliance() {
  const { data } = useAsync(() => api.get('/api/admin/compliance'), []);
  if (!data) return <div className="spinner" />;
  return (
    <>
      <div className="panel"><div className="panel-title"><Icon name="shield" /><h3>Environment</h3></div><p className="muted" style={{ fontSize: 14 }}>production={String(data.production)} · devMode={String(data.devMode)} · adultDevPreview={String(data.adultDevPreview)}</p><p className="muted" style={{ fontSize: 14 }}>Age-assurance providers: {Object.entries(data.ageAssurance).map(([k, v]: any) => `${k} (${v.production ? 'production' : 'dev only'})`).join(', ')}</p></div>
      <div className="panel"><div className="panel-title"><h3>Lounge legal gates</h3></div>{data.legalGates.map((g: any) => <div key={g.id} className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}>{g.title}</span><Chip tone={g.status === 'approved' ? 'ok' : g.status === 'dev-preview' ? 'bad' : 'warn'}>{g.status}</Chip>{g.ref && <span className="mono">{g.ref}</span>}</div>)}<p className="dim" style={{ fontSize: 12, marginTop: 8 }}>Gates can only be opened via server configuration (PLAYZO_LEGAL_APPROVALS) with a legal reference, never from this dashboard.</p></div>
      <div className="panel"><div className="panel-title"><h3>Account deletions</h3></div>{data.deletionRequests.length ? data.deletionRequests.map((d: any) => <p key={d.user_id} className="mono dim" style={{ fontSize: 12 }}>{d.user_id.slice(0, 16)}… requested {d.requested_at} completed {d.completed_at}</p>) : <p className="dim">None</p>}</div>
      <div className="panel"><div className="panel-title"><h3>Test purchases (dev-mock)</h3></div>{data.purchases.length ? data.purchases.map((p: any) => <p key={p.id} className="dim" style={{ fontSize: 12 }}>{p.username} · {p.sku} · ₹{p.amount_inr} · {p.provider} · {p.status}</p>) : <p className="dim">None</p>}</div>
      <div className="panel"><div className="panel-title"><h3>Client errors</h3></div>{data.errors.length ? data.errors.map((e: any) => <p key={e.id} className="dim" style={{ fontSize: 12 }}>{e.created_at} · {e.where_} · {e.message}</p>) : <p className="dim">None</p>}</div>
    </>
  );
}

function Audit() {
  const { data } = useAsync(() => api.get('/api/admin/audit'), []);
  return <div className="table-wrap"><table className="data"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Meta</th></tr></thead><tbody>{data?.entries?.map((e: any) => <tr key={e.id}><td>{e.created_at.slice(0, 19)}</td><td className="mono" style={{ fontSize: 11 }}>{e.actor ?? '-'}</td><td>{e.action}</td><td className="mono" style={{ fontSize: 11 }}>{e.target ?? ''}</td><td className="mono" style={{ fontSize: 11 }}>{e.meta ?? ''}</td></tr>)}</tbody></table></div>;
}
