/** Help centre: open a ticket, follow its status, reply; track reports you filed. */
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { Chip, Empty, ErrorBox, useTitle } from '../components/ui';
import { Icon } from '../components/Icon';

const KINDS: [string, string][] = [['help', 'I need help'], ['bug', 'Something is broken'], ['account', 'My account'], ['complaint', 'Make a complaint'], ['safety', 'Safety concern'], ['feedback', 'Feedback or idea']];
const tone = (s: string) => (s === 'resolved' || s === 'closed' ? 'ok' : s === 'awaiting_user' ? 'warn' : 'on');
const label = (s: string) => ({ open: 'Open', in_progress: 'In progress', awaiting_user: 'Waiting for you', resolved: 'Resolved', closed: 'Closed', actioned: 'Action taken', dismissed: 'Reviewed, no action' } as Record<string, string>)[s] ?? s;

export function Support() {
  useTitle('Help & support');
  const { me, ensureSession, toast } = useStore();
  const nav = useNavigate();
  const { data, reload, error } = useAsync(() => (me ? api.get('/api/support') : Promise.resolve({ tickets: [], reports: [] })), [me?.id]);
  const [f, setF] = useState({ kind: 'help', subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await ensureSession(); const r = await api.post('/api/support', f); toast('Request sent. We will reply here.', 'ok'); nav(`/support/${r.id}`); }
    catch (x: any) { toast(x.message, 'bad'); } finally { setBusy(false); reload(); }
  };
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)' }}>Help & support</h1>
      <p className="muted">Ask a question, report a problem or make a complaint. Replies appear here and in your notifications. For quick answers see <Link to="/legal/support" style={{ color: 'var(--zo-cyan)' }}>Help & contact</Link> and <Link to="/legal/fair-play" style={{ color: 'var(--zo-cyan)' }}>Fair play</Link>.</p>
      <form className="panel col" onSubmit={submit} aria-label="New support request">
        <div className="panel-title"><Icon name="mail" /><h3>New request</h3></div>
        <div className="field"><label htmlFor="sk">Topic</label><select id="sk" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="ss">Subject</label><input id="ss" className="input" value={f.subject} maxLength={120} onChange={(e) => setF({ ...f, subject: e.target.value })} required minLength={4} /></div>
        <div className="field"><label htmlFor="sm">Message</label><textarea id="sm" className="input" rows={5} value={f.message} maxLength={4000} onChange={(e) => setF({ ...f, message: e.target.value })} required minLength={10} /><span className="hint">Don't include passwords or payment details. {f.kind === 'safety' && 'Safety reports are handled first.'}</span></div>
        <button className="btn btn-primary" disabled={busy}>Send request</button>
      </form>
      {error && <ErrorBox message={error} retry={reload} />}
      {me && (
        <div className="panel">
          <div className="panel-title"><Icon name="info" /><h3>Your requests</h3></div>
          {data?.tickets?.length ? data.tickets.map((t: any) => (
            <Link key={t.id} to={`/support/${t.id}`} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <b style={{ flex: 1, minWidth: 0 }}>{t.subject}</b><span className="dim" style={{ fontSize: 12 }}>{t.updated_at.slice(0, 10)}</span><Chip tone={tone(t.status) as any}>{label(t.status)}</Chip>
            </Link>
          )) : <p className="dim">No requests yet.</p>}
        </div>
      )}
      {me && data?.reports?.length > 0 && (
        <div className="panel">
          <div className="panel-title"><Icon name="shield" /><h3>Reports you filed</h3></div>
          {data.reports.map((r: any) => <div key={r.id} className="row" style={{ gap: 10, padding: '6px 0' }}><span style={{ flex: 1 }}>{r.target} · {r.reason}</span><span className="dim" style={{ fontSize: 12 }}>{r.created_at.slice(0, 10)}</span><Chip tone={r.status === 'open' ? 'on' : 'ok'}>{label(r.status)}</Chip></div>)}
        </div>
      )}
    </div>
  );
}

export function SupportTicket() {
  const { id = '' } = useParams();
  const { toast } = useStore();
  const { data, reload, error } = useAsync(() => api.get(`/api/support/${id}`), [id]);
  const [msg, setMsg] = useState('');
  useTitle(data?.ticket?.subject ?? 'Support request');
  if (error) return <Empty icon="info" title="Request not found"><Link className="btn" to="/support">Back to help</Link></Empty>;
  if (!data) return <div className="spinner" />;
  const t = data.ticket;
  const reply = async (e: FormEvent) => { e.preventDefault(); try { await api.post(`/api/support/${id}/reply`, { message: msg }); setMsg(''); reload(); } catch (x: any) { toast(x.message, 'bad'); } };
  const close = async () => { await api.post(`/api/support/${id}/close`); toast('Request closed', 'ok'); reload(); };
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <Link to="/support" className="btn btn-ghost btn-sm" style={{ width: 'fit-content' }}><Icon name="back" size={14} />All requests</Link>
      <div className="row wrap"><h1 style={{ fontSize: 'var(--fs-xl)', flex: 1 }}>{t.subject}</h1><Chip tone={tone(t.status) as any}>{label(t.status)}</Chip></div>
      <div className="col" style={{ gap: 10 }}>
        {data.messages.map((m: any) => (
          <div key={m.id} className={`panel ticket-msg ${m.staff ? 'staff' : ''}`}>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}><b>{m.author}</b>{m.staff ? <Chip tone="on">Staff</Chip> : null}<span className="spacer" /><span className="dim" style={{ fontSize: 12 }}>{new Date(m.created_at).toLocaleString()}</span></div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
          </div>
        ))}
      </div>
      {t.status !== 'closed' ? (
        <form className="col" onSubmit={reply}>
          <label className="sr-only" htmlFor="rp">Reply</label>
          <textarea id="rp" className="input" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Add a reply" required />
          <div className="row"><button className="btn btn-primary" disabled={!msg.trim()}>Send reply</button><button type="button" className="btn btn-ghost" onClick={close}>Close request</button></div>
        </form>
      ) : <p className="dim">This request is closed.</p>}
    </div>
  );
}
