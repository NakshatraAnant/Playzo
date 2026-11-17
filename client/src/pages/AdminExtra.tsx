/** Admin tabs: live rooms, content flags, legal review records, email delivery log, system health. */
import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { Chip, Empty, Modal } from '../components/ui';
import { Icon } from '../components/Icon';

export function Rooms() {
  const { toast } = useStore();
  const { data, reload } = useAsync(() => api.get('/api/admin/rooms'), []);
  const close = async (code: string) => {
    const reason = prompt(`Close room ${code}? Reason (audited):`);
    if (!reason) return;
    try { await api.post(`/api/admin/rooms/${code}/close`, { reason }); toast('Room closed', 'ok'); reload(); } catch (e: any) { toast(e.message, 'bad'); }
  };
  if (!data) return <div className="spinner" />;
  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: 14 }}>{data.live.length} live room(s) in memory · {data.persisted} persisted (they survive restarts) <button className="btn btn-sm btn-ghost" onClick={reload}><Icon name="refresh" size={14} />Refresh</button></p>
      {data.live.length ? (
        <div className="table-wrap"><table className="data"><thead><tr><th>Code</th><th>Game</th><th>Format</th><th>Status</th><th>Audience</th><th>Players</th><th>Connected</th><th>Created</th><th></th></tr></thead><tbody>
          {data.live.map((r: any) => <tr key={r.code}><td className="mono">{r.code}</td><td>{r.gameId}</td><td>{r.format}</td><td>{r.status}</td><td>{r.adult ? '18+' : 'under-18 / unknown'}</td><td>{r.players}</td><td>{r.connected}</td><td>{r.createdAt.slice(0, 16)}</td><td><button className="btn btn-sm btn-danger" onClick={() => close(r.code)}>Close</button></td></tr>)}
        </tbody></table></div>
      ) : <Empty icon="users" title="No live rooms">Rooms appear here while players are in them.</Empty>}
      <h3>Recent matches</h3>
      {data.matches.length ? <div className="table-wrap"><table className="data"><thead><tr><th>When</th><th>Game</th><th>Format</th><th>Room</th><th>Players</th></tr></thead><tbody>{data.matches.map((m: any) => <tr key={m.id}><td>{m.created_at.slice(0, 16)}</td><td>{m.game_id}</td><td>{m.format}</td><td className="mono">{m.room_code}</td><td>{m.players}</td></tr>)}</tbody></table></div> : <p className="dim">No matches yet.</p>}
    </div>
  );
}

export function Content() {
  const { toast, me } = useStore();
  const { data, reload } = useAsync(() => api.get('/api/admin/content'), []);
  const [rm, setRm] = useState({ userId: '', gameId: '', reason: '' });
  const toggle = async (kind: string, id: string, enabled: boolean) => { try { await api.post(`/api/admin/content/${kind}/${id}`, { enabled }); reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  const remove = async () => { try { const r = await api.post('/api/admin/scores/remove', rm); toast(`Removed ${r.removed} score(s)`, 'ok'); } catch (e: any) { toast(e.message, 'bad'); } };
  if (!data) return <div className="spinner" />;
  const admin = me?.role === 'admin';
  return (
    <div className="stack">
      <div className="panel"><div className="panel-title"><Icon name="flag" /><h3>Missions</h3><span className="dim" style={{ fontSize: 12 }}>Season {data.season.key} · {data.season.players} players</span></div>
        <div className="table-wrap"><table className="data"><thead><tr><th>Mission</th><th>Period</th><th>Target</th><th>ZO</th><th>Active today</th><th>Enabled</th></tr></thead><tbody>
          {data.missions.map((m: any) => <tr key={m.id}><td>{m.title}</td><td>{m.period}</td><td>{m.target}</td><td>{m.zo}</td><td>{m.activeToday ? 'yes' : ''}</td><td><input type="checkbox" checked={m.enabled} disabled={!admin} onChange={(e) => toggle('mission', m.id, e.target.checked)} aria-label={`Enable ${m.title}`} /></td></tr>)}
        </tbody></table></div></div>
      <div className="panel"><div className="panel-title"><Icon name="trophy" /><h3>Achievements</h3></div>
        <div className="table-wrap"><table className="data"><thead><tr><th>Achievement</th><th>Description</th><th>ZO</th><th>Unlocked by</th></tr></thead><tbody>{data.achievements.map((a: any) => <tr key={a.id}><td>{a.title}</td><td className="muted">{a.desc}</td><td>{a.zo}</td><td>{a.unlocked}</td></tr>)}</tbody></table></div></div>
      <div className="panel"><div className="panel-title"><Icon name="bag" /><h3>Cosmetics</h3></div>
        <div className="table-wrap"><table className="data"><thead><tr><th>Item</th><th>Kind</th><th>Price</th><th>Owned by</th><th>In shop</th></tr></thead><tbody>
          {data.cosmetics.map((c: any) => <tr key={c.id}><td>{c.name}</td><td>{c.kind}</td><td>{c.plusOnly ? 'Plus' : c.priceZo === null ? '-' : `${c.priceZo} ZO`}</td><td>{c.owned}</td><td><input type="checkbox" checked={c.enabled} disabled={!admin} onChange={(e) => toggle('cosmetic', c.id, e.target.checked)} aria-label={`Show ${c.name} in shop`} /></td></tr>)}
        </tbody></table></div></div>
      {admin && (
        <div className="panel"><div className="panel-title"><Icon name="shield" /><h3>Leaderboard moderation</h3></div>
          <p className="dim" style={{ fontSize: 13, marginBottom: 8 }}>Removes a player's leaderboard scores for one game, for example after a confirmed cheating report. Audited.</p>
          <div className="row wrap"><input className="input" placeholder="User id" value={rm.userId} onChange={(e) => setRm({ ...rm, userId: e.target.value })} aria-label="User id" /><input className="input" placeholder="Game id" value={rm.gameId} onChange={(e) => setRm({ ...rm, gameId: e.target.value })} aria-label="Game id" /><input className="input" placeholder="Reason" value={rm.reason} onChange={(e) => setRm({ ...rm, reason: e.target.value })} aria-label="Reason" style={{ flex: 1, minWidth: 160 }} /><button className="btn btn-danger" onClick={remove}>Remove scores</button></div>
        </div>
      )}
    </div>
  );
}

export function Legal() {
  const { toast, me } = useStore();
  const { data, reload } = useAsync(() => api.get('/api/admin/legal'), []);
  const [form, setForm] = useState<{ id: string; scope: string; status: string; reference: string; reviewer: string; notes: string } | null>(null);
  const save = async () => {
    if (!form) return;
    try { const r = await api.post(`/api/admin/legal/${form.id}`, form); toast(`Recorded. Public gate is still: ${r.gate}`, 'ok'); setForm(null); reload(); } catch (e: any) { toast(e.message, 'bad'); }
  };
  if (!data) return <div className="spinner" />;
  return (
    <div className="stack">
      <div className="lounge-banner"><Icon name="lock" />Lounge master switch: <b>{data.loungeEnabled ? 'ON' : 'OFF'}</b> · Internal QA preview: <b>{data.adultDevPreview ? 'ON (admin/tester accounts, localhost only)' : 'OFF'}</b> · Minimum age: <b>{data.loungeMinAge}+</b> (from date of birth) · Age assurance required: <b>{data.requireAgeAssurance ? 'yes' : 'no (self-declared date of birth)'}</b></div>
      <p className="muted" style={{ fontSize: 13 }}>{data.rule}</p>
      <div className="table-wrap"><table className="data"><thead><tr><th>Game</th><th>Public gate</th><th>Config ref</th><th>India law</th><th>Google Play</th><th>App Store</th><th></th></tr></thead><tbody>
        {data.games.map((g: any) => (
          <tr key={g.id}>
            <td>{g.title}</td>
            <td><Chip tone={g.gate === 'approved' ? 'ok' : 'warn'}>{g.gate}</Chip></td>
            <td className="mono" style={{ fontSize: 11 }}>{g.configRef ?? '-'}</td>
            <td>{g.latest ? `${g.latest.status}${g.latest.reference ? ` (${g.latest.reference})` : ''}` : 'no record'}</td>
            <td>{g.platforms.google_play}</td><td>{g.platforms.app_store}</td>
            <td>{me?.role === 'admin' && <button className="btn btn-sm" onClick={() => setForm({ id: g.id, scope: 'india_law', status: 'in_review', reference: '', reviewer: '', notes: '' })}>Record review</button>}</td>
          </tr>
        ))}
      </tbody></table></div>
      {form && (
        <Modal open onClose={() => setForm(null)} title={`Legal review: ${form.id}`}>
          <div className="stack">
            <p className="dim" style={{ fontSize: 13 }}>Record only what qualified counsel or the platform has decided in writing. Recording "approved" does not open the game: server configuration must also reference the same document, and the Lounge master switch must be on.</p>
            <label className="field">Scope<select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="india_law">India law (counsel)</option><option value="state_law">State law</option><option value="google_play">Google Play</option><option value="app_store">App Store</option></select></label>
            <label className="field">Status<select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['pending', 'in_review', 'approved', 'rejected', 'blocked'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field">Written opinion or approval reference<input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
            <label className="field">Reviewer (counsel or platform)<input className="input" value={form.reviewer} onChange={(e) => setForm({ ...form, reviewer: e.target.value })} /></label>
            <label className="field">Notes<textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <button className="btn btn-primary" onClick={save}>Save record</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Emails() {
  const { toast } = useStore();
  const { data, reload } = useAsync(() => api.get('/api/admin/emails'), []);
  if (!data) return <div className="spinner" />;
  const retry = async (id: number) => { try { await api.post(`/api/admin/emails/${id}/retry`); toast('Queued', 'ok'); reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack">
      <div className={`lounge-banner ${data.delivery.configured ? '' : 'dev'}`}><Icon name="mail" />Provider: <b>{data.delivery.provider}</b> · {data.delivery.note}</div>
      <p className="muted" style={{ fontSize: 13 }}>{data.counts.map((c: any) => `${c.status}: ${c.n}`).join(' · ') || 'No messages yet'}</p>
      <div className="table-wrap"><table className="data"><thead><tr><th>When</th><th>To</th><th>Template</th><th>Status</th><th>Attempts</th><th>Error</th><th></th></tr></thead><tbody>
        {data.messages.map((m: any) => <tr key={m.id}><td>{m.created_at.slice(0, 16)}</td><td className="mono" style={{ fontSize: 12 }}>{m.to_email}</td><td>{m.template ?? m.subject}</td><td><Chip tone={m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : 'warn'}>{m.status === 'outbox_only' ? 'not delivered (outbox)' : m.status}</Chip></td><td>{m.attempts}</td><td className="dim" style={{ fontSize: 12 }}>{m.last_error ?? ''}</td><td>{m.status === 'failed' && <button className="btn btn-sm" onClick={() => retry(m.id)}>Retry</button>}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

export function System() {
  const { toast, me } = useStore();
  const { data, reload } = useAsync(() => api.get('/api/admin/system'), []);
  const backup = async () => { try { const r = await api.post('/api/admin/backup'); toast(`Backup written: ${r.file}`, 'ok'); reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  if (!data) return <div className="spinner" />;
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  const stats: [string, string | number][] = [['Uptime', `${Math.floor(data.uptimeSec / 60)} min`], ['Memory (RSS)', `${data.memoryMb.rss} MB`], ['Heap', `${data.memoryMb.heap} MB`], ['Database', kb(data.db.bytes)], ['Signed-in sessions', data.activeSessions], ['Live rooms', data.liveRooms], ['Node', data.node]];
  return (
    <div className="stack">
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {stats.map(([k, v]) => <div key={k} className="panel" style={{ padding: 14 }}><b style={{ fontSize: 20 }}>{v}</b><div className="dim" style={{ fontSize: 12 }}>{k}</div></div>)}
      </div>
      <div className="panel"><div className="panel-title"><Icon name="shield" /><h3>Configuration (read-only)</h3><button className="btn btn-sm btn-ghost" onClick={reload}><Icon name="refresh" size={14} />Refresh</button></div>
        <p className="dim" style={{ fontSize: 12, marginBottom: 8 }}>Changed only in the server's .env file. Secrets are never shown here.</p>
        <div className="table-wrap"><table className="data"><tbody>
          {Object.entries(data.config).map(([k, v]) => <tr key={k}><td>{k}</td><td className="mono" style={{ fontSize: 12 }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>)}
          <tr><td>email</td><td className="mono" style={{ fontSize: 12 }}>{data.email.provider} · {data.email.note}</td></tr>
        </tbody></table></div></div>
      <BackupsPanel />
      <div className="panel"><div className="panel-title"><h3>Database</h3></div>
        <p className="muted" style={{ fontSize: 13 }}>{data.db.path} · migrations: {data.db.migrations.map((m: any) => m.name).join(', ')}</p>
        <p className="muted" style={{ fontSize: 13 }}>Last backup: {data.backup ? `${data.backup.file} (${new Date(data.backup.at).toLocaleString()})` : 'none yet'} · automatic daily backups, newest 14 kept in data/backups</p>
        {me?.role === 'admin' && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={backup}>Back up now</button>}
        <p className="muted" style={{ fontSize: 13 }}>{Object.entries(data.db.rows).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
      </div>
    </div>
  );
}

/** Backups: list, restore test (integrity + key tables), staged restore applied at next start. */
export function BackupsPanel() {
  const { toast, me } = useStore();
  const { data, reload } = useAsync(() => (me?.role === 'admin' ? api.get('/api/admin/backups') : Promise.resolve(null)), [me?.role]);
  const [checks, setChecks] = useState<Record<string, any>>({});
  if (!data) return null;
  const verify = async (f: string) => { try { const r = await api.post(`/api/admin/backups/${encodeURIComponent(f)}/verify`); setChecks({ ...checks, [f]: r }); } catch (e: any) { toast(e.message, 'bad'); } };
  const restore = async (f: string) => {
    const c = prompt(`Restore ${f}? The current database is saved first and the restore is applied when the server restarts. Type RESTORE to confirm.`);
    if (c !== 'RESTORE') return;
    try { const r = await api.post(`/api/admin/backups/${encodeURIComponent(f)}/restore`, { confirm: 'RESTORE' }); toast(r.note, 'ok'); reload(); } catch (e: any) { toast(e.message, 'bad'); }
  };
  const cancel = async () => { await api.post('/api/admin/backups/cancel-restore'); toast('Restore cancelled', 'ok'); reload(); };
  return (
    <div className="panel">
      <div className="panel-title"><Icon name="shield" /><h3>Backups and restore</h3></div>
      {data.pending && <div className="lounge-banner dev" style={{ marginBottom: 10 }}><Icon name="info" />Restore of <b>{data.pending.file}</b> is staged and will be applied at the next server restart. <button className="btn btn-sm" onClick={cancel}>Cancel</button></div>}
      {data.backups.length ? (
        <div className="table-wrap"><table className="data"><thead><tr><th>File</th><th>Type</th><th>Size</th><th>Taken</th><th>Restore test</th><th></th></tr></thead><tbody>
          {data.backups.slice(0, 20).map((b: any) => {
            const c = checks[b.file];
            return <tr key={b.file}><td className="mono" style={{ fontSize: 11 }}>{b.file}</td><td>{b.kind}</td><td>{Math.round(b.bytes / 1024)} KB</td><td>{new Date(b.at).toLocaleString()}</td>
              <td>{c ? <Chip tone={c.ok ? 'ok' : 'bad'}>{c.ok ? `ok · ${c.users} users · ${c.migrations.length} migrations` : c.integrity}</Chip> : <button className="btn btn-sm" onClick={() => verify(b.file)}>Verify</button>}</td>
              <td><button className="btn btn-sm btn-ghost" onClick={() => restore(b.file)}>Restore…</button></td></tr>;
          })}
        </tbody></table></div>
      ) : <p className="dim">No backups yet.</p>}
    </div>
  );
}

/** Error monitoring: client crashes grouped by message and page. */
export function Errors() {
  const { data } = useAsync(() => api.get('/api/admin/errors'), []);
  if (!data) return <div className="spinner" />;
  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: 13 }}>Errors reported by players' browsers in the last 14 days: {data.perDay.map((d: any) => `${d.day.slice(5)}: ${d.n}`).join(' · ') || 'none'}</p>
      {data.grouped.length ? <div className="table-wrap"><table className="data"><thead><tr><th>Last seen</th><th>Count</th><th>Where</th><th>Message</th></tr></thead><tbody>
        {data.grouped.map((e: any, i: number) => <tr key={i}><td>{e.last.slice(0, 16)}</td><td>{e.n}</td><td className="mono" style={{ fontSize: 11 }}>{e.where_}</td><td style={{ fontSize: 12, wordBreak: 'break-word' }}>{e.message}</td></tr>)}
      </tbody></table></div> : <Empty icon="check" title="No errors reported">Nothing has crashed in players' browsers.</Empty>}
    </div>
  );
}

/** Fair play: replay runs flagged by behavioural signals; their leaderboard entries are held until reviewed. */
export function FairPlay() {
  const { toast } = useStore();
  const [status, setStatus] = useState('flagged');
  const { data, reload } = useAsync(() => api.get(`/api/admin/reviews?status=${status}`), [status]);
  if (!data) return <div className="spinner" />;
  const decide = async (id: string, decision: string) => { try { await api.post(`/api/admin/reviews/${id}`, { decision }); toast(decision === 'clear' ? 'Score restored' : 'Score removed', 'ok'); reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="seg">{['flagged', 'cleared', 'removed'].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s}</button>)}</div>
        <span className="dim" style={{ fontSize: 13 }}>Runs scoring {data.threshold}+ on scripted-play signals are held from leaderboards (XP is kept) until reviewed.</span>
      </div>
      {data.runs.length ? (
        <div className="table-wrap"><table className="data"><thead><tr><th>When</th><th>Player</th><th>Game</th><th>Score</th><th>Bot score</th><th>Signals</th><th></th></tr></thead><tbody>
          {data.runs.map((r: any) => {
            let sig: any = {};
            try { sig = JSON.parse(String(r.review_note).split(' | ')[0]); } catch { /* note only */ }
            return <tr key={r.id}><td>{r.started_at.slice(0, 16)}</td><td>{r.username}</td><td>{r.game_id}</td><td className="mono">{r.score}</td><td><Chip tone={r.bot_score >= 80 ? 'bad' : 'warn'}>{r.bot_score}</Chip></td>
              <td className="dim" style={{ fontSize: 12 }}>{sig.inputs !== undefined ? `${sig.inputs} inputs · timing variation ${sig.cv?.toFixed(3)} · fast ${(sig.fastShare * 100).toFixed(0)}% · repeated ${(sig.repeatShare * 100).toFixed(0)}%` : ''}</td>
              <td>{r.review_status === 'flagged' && <><button className="btn btn-sm" onClick={() => decide(r.id, 'clear')}>Clear</button> <button className="btn btn-sm btn-danger" onClick={() => decide(r.id, 'remove')}>Remove score</button></>}</td></tr>;
          })}
        </tbody></table></div>
      ) : <Empty icon="shield" title="Nothing to review">No runs in this state.</Empty>}
    </div>
  );
}
