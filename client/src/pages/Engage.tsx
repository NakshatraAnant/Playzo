/** Engagement and account-security widgets: notifications, daily reward, season standings, match history, sessions. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { Avatar, Chip, Empty, useTitle } from '../components/ui';
import { Icon } from '../components/Icon';
import { BY_ID } from '@shared/catalogue';
import { sfx } from '../lib/sound';

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

/* ---------------- notification bell (top bar) ---------------- */
export function NotificationBell() {
  const { me } = useStore();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const load = () => api.get('/api/notifications').then((r) => { if (alive) setUnread(r.unread); }).catch(() => undefined);
    load();
    const id = setInterval(load, 60_000);
    const onFocus = () => load();
    addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(id); removeEventListener('focus', onFocus); };
  }, [me?.id]);
  if (!me) return null;
  return (
    <Link to="/notifications" className="btn btn-ghost icon-btn bell" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
      <Icon name="bell" />
      {unread > 0 && <span className="badge-dot" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

export function Notifications() {
  useTitle('Notifications');
  const { me } = useStore();
  const { data, reload, error } = useAsync(() => (me ? api.get('/api/notifications') : Promise.resolve(null)), [me?.id]);
  useEffect(() => { if (data?.unread) api.post('/api/notifications/read').catch(() => undefined); }, [data?.unread]);
  if (!me) return <Empty icon="bell" title="Sign in to see notifications" />;
  if (error) return <Empty icon="info" title="Could not load notifications"><button className="btn" onClick={reload}>Try again</button></Empty>;
  if (!data) return <div className="spinner" />;
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="row"><h1 style={{ fontSize: 'var(--fs-2xl)', flex: 1 }}>Notifications</h1><Link to="/settings#notifications" className="btn btn-sm btn-ghost"><Icon name="gear" size={14} />Preferences</Link></div>
      {data.notifications.length === 0 ? <Empty icon="bell" title="All caught up">Friend requests, challenges and account security notices appear here.</Empty> : (
        <div className="col" style={{ gap: 8 }}>
          {data.notifications.map((n: any) => {
            const body = (
              <div className={`panel notif ${n.read_at ? '' : 'unread'}`} style={{ padding: 14 }}>
                <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <span className="notif-icon"><Icon name={n.kind === 'security' ? 'shield' : n.kind === 'friend' ? 'heart' : n.kind === 'challenge' ? 'flag' : 'bell'} size={18} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}><b>{n.title}</b>{n.body && <p className="muted" style={{ fontSize: 14 }}>{n.body}</p>}</div>
                  <span className="dim" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{ago(n.created_at)}</span>
                </div>
              </div>
            );
            return n.link ? <Link key={n.id} to={n.link}>{body}</Link> : <div key={n.id}>{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- daily reward (home) ---------------- */
export function DailyRewardCard() {
  const { me, refresh, toast } = useStore();
  const { data, reload } = useAsync(() => (me ? api.get('/api/rewards/daily') : Promise.resolve(null)), [me?.id]);
  const [busy, setBusy] = useState(false);
  if (!me || !data) return null;
  const claim = async () => {
    setBusy(true);
    try { const r = await api.post('/api/rewards/daily'); sfx.coin?.(); toast(`+${r.amount} ZO · day ${r.streak}`, 'ok'); reload(); refresh(); }
    catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <section className="panel daily-reward" aria-label="Daily reward">
      <div className="row wrap" style={{ gap: 12 }}>
        <span className="notif-icon gold"><Icon name="gift" /></span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <b>{data.claimedToday ? 'Daily reward collected' : `Daily reward: ${data.amount} ZO`}</b>
          <p className="dim" style={{ fontSize: 13 }}>{data.claimedToday ? 'Come back tomorrow. Missing a day just restarts the count.' : `Day ${data.streak} of your check-in run. Rewards grow up to day 7.`}</p>
        </div>
        <div className="reward-days" aria-hidden="true">{data.schedule.map((z: number, i: number) => <span key={i} className={i < (data.claimedToday ? data.streak : data.streak - 1) % 7 || (data.claimedToday && data.streak >= 7) ? 'on' : ''}>{z}</span>)}</div>
        {!data.claimedToday && <button className="btn btn-gold" onClick={claim} disabled={busy} data-testid="claim-daily"><Icon name="gift" />Collect</button>}
      </div>
    </section>
  );
}

/* ---------------- monthly season board ---------------- */
export function SeasonBoard() {
  const { data, error } = useAsync(() => api.get('/api/seasons/current'), []);
  if (error) return <p className="dim">Season standings are unavailable right now.</p>;
  if (!data) return <div className="spinner" />;
  const month = new Date(`${data.season}-01T00:00:00Z`).toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const days = Math.max(0, Math.ceil((Date.parse(data.endsAt) - Date.now()) / 86400_000));
  return (
    <div className="stack">
      <div className="row wrap"><h3 style={{ flex: 1 }}>Season: {month}</h3><Chip icon="clock">{days} day{days === 1 ? '' : 's'} left</Chip>{data.me && <Chip tone="on">You: #{data.me.rank} · {data.me.points} pts</Chip>}</div>
      <p className="dim" style={{ fontSize: 13 }}>Season points are the XP you earn from family games this month. Everyone starts fresh on the 1st. Rankings are for fun: no prizes, nothing to buy.</p>
      {data.top.length === 0 ? <Empty icon="trophy" title="No standings yet">Play any family game to get on the board.</Empty> : (
        <ol className="board">
          {data.top.map((r: any) => (
            <li key={r.userId} className={r.me ? 'me' : ''}>
              <span className="rank">{r.rank}</span><Avatar id={r.avatar} size={30} name={r.name} />
              <Link to={`/u/${r.userId}`} style={{ flex: 1, fontWeight: 700 }}>{r.name}</Link>
              <span className="dim" style={{ fontSize: 12 }}>{r.games} games</span><b className="mono">{r.points.toLocaleString()}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------------- match history (profile) ---------------- */
export function MatchHistory() {
  const { me } = useStore();
  const { data } = useAsync(() => (me && !me.isGuest ? api.get('/api/me/matches') : Promise.resolve({ matches: [] })), [me?.id]);
  if (!data) return null;
  return (
    <section className="panel">
      <div className="panel-title"><Icon name="users" /><h3>Multiplayer history</h3></div>
      {data.matches.length === 0 ? <p className="dim" style={{ fontSize: 14 }}>No multiplayer matches yet. <Link to="/rooms" style={{ color: 'var(--zo-cyan)' }}>Play with friends</Link>.</p> : (
        <div className="col" style={{ gap: 6 }}>
          {data.matches.map((m: any) => (
            <div key={m.id} className="row" style={{ gap: 10, fontSize: 14 }}>
              <Chip tone={m.outcome === 'win' ? 'ok' : m.outcome === 'loss' ? 'bad' : undefined}>{m.outcome}</Chip>
              <b style={{ flex: 1 }}>{BY_ID[m.game_id]?.title ?? m.game_id}</b>
              <span className="dim">{m.format === 'teams' ? '2v2' : m.format} · {m.players}p</span>
              <span className="mono">{m.score}</span>
              <span className="dim" style={{ fontSize: 12 }}>{ago(m.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ReferralCard() {
  const { me, toast } = useStore();
  const { data } = useAsync(() => (me && !me.isGuest ? api.get('/api/me/referrals') : Promise.resolve(null)), [me?.id]);
  if (!data?.code) return null;
  const link = `${location.origin}/register?ref=${encodeURIComponent(data.code)}`;
  const share = async () => {
    const text = 'Aaja PLAYZO pe khelte hain! 50 original games, live rooms with friends.';
    if (navigator.share) await navigator.share({ title: 'PLAYZO', text, url: link }).catch(() => undefined);
    else { await navigator.clipboard?.writeText(`${text} ${link}`); toast('Invite link copied', 'ok'); }
  };
  return (
    <section className="panel">
      <div className="panel-title"><Icon name="share" /><h3>Invite friends</h3></div>
      <p className="muted" style={{ fontSize: 14 }}>{data.count ? `${data.count} friend${data.count === 1 ? '' : 's'} joined with your link.` : 'Share your link so friends can find you.'} Invites are just for fun: no coins or prizes are paid for them.</p>
      <button className="btn" style={{ marginTop: 10 }} onClick={share}><Icon name="share" />Share invite link</button>
    </section>
  );
}

/* ---------------- settings: sessions, notifications, verification ---------------- */
export function SecuritySettings() {
  const { me, toast, providers } = useStore();
  const sessions = useAsync(() => (me && !me.isGuest ? api.get('/api/auth/sessions') : Promise.resolve({ sessions: [] })), [me?.id]);
  const notif = useAsync(() => (me ? api.get('/api/notifications') : Promise.resolve(null)), [me?.id]);
  if (!me) return null;
  const revoke = async (body: object) => { try { const r = await api.post('/api/auth/sessions/revoke', body); toast(`Signed out ${r.revoked} device(s)`, 'ok'); sessions.reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  const setPref = async (b: object) => { try { await api.patch('/api/notifications/prefs', b); notif.reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  const resend = async () => { try { const r = await api.post('/api/auth/resend-verification'); toast(r.delivery.configured ? 'Verification email sent' : 'Email delivery is not configured: the link was saved to the local outbox', r.delivery.configured ? 'ok' : undefined); } catch (e: any) { toast(e.message, 'bad'); } };
  const p = notif.data?.prefs;
  return (
    <>
      {!me.isGuest && !me.emailVerified && (
        <div className="panel">
          <div className="panel-title"><Icon name="mail" /><h3>Verify your email</h3></div>
          <p className="muted" style={{ fontSize: 14 }}>A verified email lets you recover your account.{!providers.email && ' This server has no email provider yet, so links are kept in the local outbox.'}</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={resend}>Resend verification link</button>
        </div>
      )}
      {!me.isGuest && (
        <div className="panel">
          <div className="panel-title"><Icon name="shield" /><h3>Where you're signed in</h3></div>
          {sessions.data?.sessions.map((s: any) => (
            <div key={s.id} className="row" style={{ gap: 10, fontSize: 14, padding: '6px 0' }}>
              <Icon name="user" size={16} /><b style={{ flex: 1 }}>{s.device}{s.current ? ' (this device)' : ''}</b>
              <span className="dim" style={{ fontSize: 12 }}>{s.lastUsedAt ? `active ${ago(s.lastUsedAt)}` : `since ${ago(s.createdAt)}`}</span>
              {!s.current && <button className="btn btn-sm btn-ghost" onClick={() => revoke({ id: s.id })}>Sign out</button>}
            </div>
          ))}
          {(sessions.data?.sessions.length ?? 0) > 1 && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => revoke({ all: true })}>Sign out all other devices</button>}
        </div>
      )}
      {p && (
        <div className="panel" id="notifications">
          <div className="panel-title"><Icon name="bell" /><h3>Notifications</h3></div>
          <div className="col" style={{ gap: 8 }}>
            <label className="check"><input type="checkbox" checked={p.friend} onChange={(e) => setPref({ friend: e.target.checked })} />Friend requests</label>
            <label className="check"><input type="checkbox" checked={p.challenge} onChange={(e) => setPref({ challenge: e.target.checked })} />Challenges from friends</label>
            <label className="check"><input type="checkbox" checked={p.reminder} onChange={(e) => setPref({ reminder: e.target.checked })} />Break reminders while playing</label>
            {!me.isGuest && <label className="check"><input type="checkbox" checked={p.emailSecurity} onChange={(e) => setPref({ emailSecurity: e.target.checked })} />Email me about new sign-ins and password changes</label>}
            <div className="row wrap"><span className="muted" style={{ fontSize: 14 }}>Remind me to take a break after</span>
              <select className="input" style={{ maxWidth: 160 }} value={p.playReminderMin ?? ''} onChange={(e) => setPref({ playReminderMin: e.target.value ? Number(e.target.value) : null })} aria-label="Break reminder">
                <option value="">Never</option>{[30, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select></div>
            <p className="dim" style={{ fontSize: 12 }}>Security notices always appear in your inbox. PLAYZO never sends marketing push notifications.</p>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- gentle play-time reminder (family) ---------------- */
export function BreakReminder() {
  const { me, toast } = useStore();
  const { data } = useAsync(() => (me ? api.get('/api/notifications') : Promise.resolve(null)), [me?.id]);
  useEffect(() => {
    const p = data?.prefs;
    if (!p?.reminder || !p.playReminderMin) return;
    const id = setTimeout(() => toast(`You've been playing for ${p.playReminderMin} minutes. Time for a stretch?`), p.playReminderMin * 60_000);
    return () => clearTimeout(id);
  }, [data?.prefs?.reminder, data?.prefs?.playReminderMin, toast]);
  return null;
}
