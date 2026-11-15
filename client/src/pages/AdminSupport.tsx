/** Admin → Support: triage queue, conversation, reply, status changes. All writes are audited server-side. */
import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { Chip, Empty, Modal } from '../components/ui';
import { Icon } from '../components/Icon';

const STATUSES = ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'];

export function SupportAdmin() {
  const [filter, setFilter] = useState('active');
  const { data, reload } = useAsync(() => api.get(`/api/admin/support?status=${filter}`), [filter]);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <div className="spinner" />;
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="seg">{['active', ...STATUSES, 'all'].map((s) => <button key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>{s.replace('_', ' ')}</button>)}</div>
        <span className="dim" style={{ fontSize: 13 }}>{data.counts.map((c: any) => `${c.status.replace('_', ' ')}: ${c.n}`).join(' · ') || 'No tickets yet'}</span>
      </div>
      {data.tickets.length ? (
        <div className="table-wrap"><table className="data"><thead><tr><th>Updated</th><th>Subject</th><th>Topic</th><th>From</th><th>Priority</th><th>Status</th><th>Msgs</th></tr></thead><tbody>
          {data.tickets.map((t: any) => <tr key={t.id} onClick={() => setOpen(t.id)} style={{ cursor: 'pointer' }}><td>{t.updated_at.slice(0, 16)}</td><td>{t.subject}</td><td>{t.kind}</td><td>{t.username ?? 'deleted user'}</td><td>{t.priority === 'high' ? <Chip tone="bad">high</Chip> : t.priority}</td><td>{t.status.replace('_', ' ')}</td><td>{t.messages}</td></tr>)}
        </tbody></table></div>
      ) : <Empty icon="mail" title="Queue is clear">No tickets in this view.</Empty>}
      {open && <TicketModal id={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function TicketModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useStore();
  const { data, reload } = useAsync(() => api.get(`/api/admin/support/${id}`), [id]);
  const [msg, setMsg] = useState('');
  const send = async (body: object) => { try { await api.post(`/api/admin/support/${id}`, body); setMsg(''); toast('Saved', 'ok'); reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <Modal open onClose={onClose} title={data?.ticket?.subject ?? 'Ticket'} wide>
      {!data ? <div className="spinner" /> : (
        <div className="stack">
          <p className="dim" style={{ fontSize: 13 }}>{data.ticket.kind} · from {data.ticket.username ?? 'deleted user'} · opened {data.ticket.created_at.slice(0, 16)} · status {data.ticket.status.replace('_', ' ')}</p>
          {data.messages.map((m: any) => <div key={m.id} className={`panel ticket-msg ${m.staff ? 'staff' : ''}`}><b>{m.author}</b> <span className="dim" style={{ fontSize: 12 }}>{m.created_at.slice(0, 16)}</span><p style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{m.body}</p></div>)}
          <textarea className="input" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Reply to the player (they are notified)" aria-label="Reply" />
          <div className="row wrap">
            <button className="btn btn-primary" disabled={!msg.trim()} onClick={() => send({ message: msg })}><Icon name="mail" size={14} />Send reply</button>
            {STATUSES.map((s) => <button key={s} className="btn btn-sm" disabled={data.ticket.status === s} onClick={() => send({ status: s })}>{s.replace('_', ' ')}</button>)}
          </div>
        </div>
      )}
    </Modal>
  );
}
