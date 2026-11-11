import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { Avatar, Chip, Empty, ErrorBox, GameTile, Modal, useTitle, Coins } from '../components/ui';
import { Icon } from '../components/Icon';
import { BY_ID } from '@shared/catalogue';
import { sfx } from '../lib/sound';

export function Me() {
  useTitle('Your profile');
  const { me } = useStore();
  const { data, error, reload } = useAsync(() => (me ? api.get('/api/me/progress') : Promise.resolve(null)), [me?.id]);
  if (!me) return <Empty icon="user" title="Not signed in"><Link className="btn btn-primary" to="/login" style={{ marginTop: 12 }}>Sign in</Link></Empty>;
  if (error) return <ErrorBox message={error} retry={reload} />;
  const lvlPct = data ? ((data.xp - data.levelXp) / Math.max(1, data.nextLevelXp - data.levelXp)) * 100 : 0;
  return (
    <div className="stack-lg">
      <section className="panel row wrap" style={{ gap: 20, background: 'linear-gradient(120deg, rgba(255,61,139,.14), rgba(139,92,255,.12))' }}>
        <Avatar id={me.avatar} frame={me.frame} size={92} name={me.displayName} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 'var(--fs-2xl)' }}>{me.displayName}</h1>
          <div className="row wrap" style={{ gap: 6, marginTop: 6 }}><Chip tone="on" icon="star">Level {me.level}</Chip>{me.premium && <Chip tone="gold" icon="crown">PLAYZO Plus</Chip>}{data?.streak ? <Chip tone="warn" icon="flame">{data.streak}-day streak</Chip> : null}<Coins n={me.balances.ZO} /></div>
          <div className="timebar" style={{ marginTop: 12, maxWidth: 360 }}><i style={{ width: `${lvlPct}%` }} /></div>
          <span className="dim" style={{ fontSize: 12 }}>{data ? `${data.xp - data.levelXp} / ${data.nextLevelXp - data.levelXp} XP to level ${me.level + 1}` : ''}</span>
        </div>
        <div className="col"><Link className="btn" to="/shop"><Icon name="bag" />Customise</Link><Link className="btn btn-ghost" to="/settings"><Icon name="gear" />Settings</Link></div>
      </section>
      {me.isGuest && <div className="panel row"><Icon name="info" /><span style={{ flex: 1 }}>You're playing as a guest. Create an account to protect your progress and unlock friends.</span><Link className="btn btn-primary" to="/register">Save progress</Link></div>}
      {data && (
        <>
          <section>
            <h2 style={{ fontSize: 'var(--fs-xl)', marginBottom: 12 }}>Achievements <span className="dim" style={{ fontSize: 14 }}>{data.achievements.filter((a: any) => a.unlockedAt).length}/{data.achievements.length}</span></h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {data.achievements.map((a: any) => (
                <div key={a.id} className="panel panel-tight" style={{ opacity: a.unlockedAt ? 1 : 0.45, textAlign: 'center' }} title={a.desc}>
                  <div className="center" style={{ width: 46, height: 46, borderRadius: 14, margin: '0 auto 8px', background: a.unlockedAt ? 'var(--grad-zo)' : 'var(--surface-2)' }}><Icon name={a.icon} /></div>
                  <b style={{ fontSize: 13 }}>{a.title}</b><div className="dim" style={{ fontSize: 11 }}>{a.desc}</div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-title"><Icon name="grid" /><h3>Game mastery</h3></div>
            {data.stats.length ? <div className="table-wrap"><table className="data"><thead><tr><th>Game</th><th>Plays</th><th>Wins</th><th>Best</th><th>Mastery</th></tr></thead><tbody>{data.stats.map((s: any) => <tr key={s.game_id}><td><Link to={`/games/${s.game_id}`}>{BY_ID[s.game_id]?.title}</Link></td><td>{s.plays}</td><td>{s.wins}</td><td className="mono">{s.best_score.toLocaleString()}</td><td>{Math.min(10, Math.floor(s.mastery_xp / 50) + 1)}/10</td></tr>)}</tbody></table></div> : <p className="dim">Play a game to start your stats.</p>}
          </section>
          <section className="row wrap" style={{ alignItems: 'stretch', gap: 16 }}>
            <div className="panel" style={{ flex: '1 1 320px' }}>
              <div className="panel-title"><Icon name="clock" /><h3>Recent games</h3></div>
              {data.games.slice(0, 12).map((g: any) => <div key={g.id} className="row" style={{ gap: 8, fontSize: 14, padding: '3px 0' }}><span style={{ flex: 1 }}>{BY_ID[g.game_id]?.title}</span><span className="dim">{g.context}</span><Chip tone={g.status === 'completed' ? 'ok' : g.status === 'rejected' ? 'bad' : undefined}>{g.status === 'completed' ? g.score?.toLocaleString() : g.status}</Chip></div>)}
            </div>
            <div className="panel" style={{ flex: '1 1 320px' }}>
              <div className="panel-title"><Icon name="swords" /><h3>Match history</h3></div>
              {data.matches.length ? data.matches.map((m: any) => <div key={m.id} className="row" style={{ gap: 8, fontSize: 14, padding: '3px 0' }}><span style={{ flex: 1 }}>{BY_ID[m.game_id]?.title}</span><span className="dim">{m.format}</span><Chip tone={m.outcome === 'win' ? 'ok' : m.outcome === 'loss' ? 'bad' : undefined}>{m.outcome}</Chip></div>) : <p className="dim">No multiplayer matches yet. <Link to="/rooms" style={{ color: 'var(--zo-cyan)' }}>Find a room</Link></p>}
            </div>
          </section>
          <section className="panel">
            <div className="panel-title"><Icon name="coins" /><h3>ZO coin history</h3></div>
            <p className="dim" style={{ fontSize: 13, marginBottom: 8 }}>ZO coins are earned by playing and spent on cosmetics. They have no cash value and can't be bought, transferred or redeemed.</p>
            {data.ledger.map((l: any) => <div key={l.id} className="row mono" style={{ fontSize: 13, gap: 8, padding: '2px 0' }}><span style={{ flex: 1 }} className="muted">{l.source}</span><span style={{ color: l.amount > 0 ? 'var(--ok)' : 'var(--bad)' }}>{l.amount > 0 ? '+' : ''}{l.amount}</span><span className="dim">{new Date(l.created_at).toLocaleDateString()}</span></div>)}
          </section>
        </>
      )}
    </div>
  );
}

export function PublicProfile() {
  const { id = '' } = useParams();
  const { me, toast } = useStore();
  const { data, error } = useAsync(() => api.get(`/api/users/${id}`), [id]);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState('cheating');
  useTitle(data?.profile?.name ?? 'Player');
  if (error) return <ErrorBox message={error} />;
  if (!data) return <div className="spinner" />;
  const p = data.profile;
  const add = async () => { try { const r = await api.post('/api/friends/request', { userId: p.id }); toast(r.status === 'accepted' ? 'You are now friends!' : 'Friend request sent', 'ok'); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="panel row wrap" style={{ gap: 18 }}>
        <Avatar id={p.avatar} frame={p.frame} size={80} name={p.name} />
        <div style={{ flex: 1 }}><h1 style={{ fontSize: 'var(--fs-2xl)' }}>{p.name}</h1><Chip tone="on">Level {p.level}</Chip>{p.friend && <Chip tone="ok">Friend</Chip>}</div>
        {me && me.id !== p.id && !me.isGuest && (
          <div className="col">
            {!p.friend && <button className="btn btn-primary" onClick={add}><Icon name="plus" />Add friend</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setReport(true)}>Report</button>
            <button className="btn btn-ghost btn-sm" onClick={async () => { if (confirm('Block this player? They will not be able to join your rooms or send requests.')) { await api.post('/api/block', { userId: p.id }); toast('Player blocked', 'ok'); } }}>Block</button>
          </div>
        )}
      </div>
      {p.private ? <Empty icon="lock" title="This profile is private" /> : (
        <>
          <div className="grid-kpi"><div className="panel kpi"><b>{p.totals.plays}</b><span>Games</span></div><div className="panel kpi"><b>{p.totals.wins}</b><span>Wins</span></div><div className="panel kpi"><b>{p.achievements.length}</b><span>Achievements</span></div><div className="panel kpi"><b>{p.streak}</b><span>Day streak</span></div></div>
          <div className="panel">{p.stats.map((s: any) => <div key={s.game_id} className="row" style={{ fontSize: 14, padding: '3px 0' }}><span style={{ flex: 1 }}>{BY_ID[s.game_id]?.title}</span><span className="mono">best {s.best_score.toLocaleString()}</span></div>)}</div>
        </>
      )}
      <Modal open={report} onClose={() => setReport(false)} title="Report player">
        <div className="col">
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">{[['cheating', 'Cheating'], ['offensive_name', 'Offensive name'], ['harassment', 'Harassment'], ['impersonation', 'Impersonation'], ['underage', 'May be under age for their account'], ['other', 'Other']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="btn btn-primary" onClick={async () => { try { await api.post('/api/report', { userId: p.id, reason }); toast('Report sent to our safety team', 'ok'); setReport(false); } catch (e: any) { toast(e.message, 'bad'); } }}>Send report</button>
        </div>
      </Modal>
    </div>
  );
}

export function Friends() {
  useTitle('Friends');
  const { me, toast } = useStore();
  const { data, reload } = useAsync(() => (me ? api.get('/api/friends') : Promise.resolve(null)), [me?.id]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  if (!me) return <Empty icon="heart" title="Sign in to add friends"><Link className="btn btn-primary" to="/login" style={{ marginTop: 12 }}>Sign in</Link></Empty>;
  if (me.isGuest) return <Empty icon="heart" title="Create an account to add friends">Guests can still join rooms with a code. <Link className="btn btn-primary" to="/register" style={{ marginTop: 12 }}>Create account</Link></Empty>;
  const search = async () => { try { const r = await api.get(`/api/users/search?q=${encodeURIComponent(q)}`); setResults(r.users); } catch (e: any) { toast(e.message, 'bad'); } };
  const respond = async (userId: string, accept: boolean) => { await api.post('/api/friends/respond', { userId, accept }); sfx.select(); reload(); };
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)' }}>Friends</h1>
      {!me.social.canSendFriendRequests && <div className="panel row"><Icon name="shield" /><span className="muted">Friends unlock after a parent or guardian approves this account.</span></div>}
      {me.social.canSearchUsers && (
        <div className="panel">
          <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}><div className="search" style={{ flex: 1 }}><Icon name="search" /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by username" minLength={2} aria-label="Find players" /></div><button className="btn">Search</button></form>
          {results.map((u) => <div key={u.id} className="row" style={{ marginTop: 10, gap: 10 }}><Avatar id={u.avatar} size={30} name={u.name} /><Link to={`/u/${u.id}`} style={{ flex: 1 }}>{u.name} <span className="dim">Lv {u.level}</span></Link>{u.friend ? <Chip tone="ok">Friend</Chip> : <button className="btn btn-sm btn-primary" onClick={async () => { try { await api.post('/api/friends/request', { userId: u.id }); toast('Request sent', 'ok'); reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>Add</button>}</div>)}
        </div>
      )}
      {data?.incoming?.length > 0 && <div className="panel"><div className="panel-title"><h3>Requests</h3></div>{data.incoming.map((u: any) => <div key={u.id} className="row" style={{ gap: 10, padding: '4px 0' }}><Avatar id={u.avatar} size={30} name={u.name} /><span style={{ flex: 1 }}>{u.name}</span><button className="btn btn-sm btn-primary" onClick={() => respond(u.id, true)}>Accept</button><button className="btn btn-sm" onClick={() => respond(u.id, false)}>Decline</button></div>)}</div>}
      <div className="panel">
        <div className="panel-title"><Icon name="heart" /><h3>Your friends ({data?.friends?.length ?? 0})</h3></div>
        {data?.friends?.length ? data.friends.map((u: any) => <div key={u.id} className="row" style={{ gap: 10, padding: '4px 0' }}><Avatar id={u.avatar} size={32} name={u.name} /><Link to={`/u/${u.id}`} style={{ flex: 1 }}>{u.name} <span className="dim">Lv {u.level}</span></Link><button className="btn btn-sm btn-ghost" onClick={async () => { if (confirm(`Remove ${u.name}?`)) { await api.post('/api/friends/remove', { userId: u.id }); reload(); } }}>Remove</button></div>) : <p className="dim">No friends yet.</p>}
        {data?.outgoing?.length > 0 && <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>Pending: {data.outgoing.map((u: any) => u.name).join(', ')}</p>}
      </div>
      {data?.activity?.length > 0 && <div className="panel"><div className="panel-title"><h3>Recent friend activity</h3></div>{data.activity.map((a: any, i: number) => <div key={i} className="row" style={{ gap: 8, fontSize: 14, padding: '3px 0' }}><Avatar id={a.avatar} size={24} name={a.display_name} /><span><b>{a.display_name}</b> scored {a.score?.toLocaleString()} in {BY_ID[a.game_id]?.title}</span></div>)}</div>}
      {data?.blocked?.length > 0 && <div className="panel"><div className="panel-title"><h3>Blocked</h3></div>{data.blocked.map((u: any) => <div key={u.id} className="row" style={{ gap: 10 }}><span style={{ flex: 1 }}>{u.name}</span><button className="btn btn-sm" onClick={async () => { await api.post('/api/unblock', { userId: u.id }); reload(); }}>Unblock</button></div>)}</div>}
    </div>
  );
}

export function Missions() {
  useTitle('Missions');
  const { me, toast, refresh } = useStore();
  const { data, reload } = useAsync(() => (me ? api.get('/api/missions') : Promise.resolve(null)), [me?.id]);
  if (!me) return <Empty icon="target" title="Play a game to start missions"><Link className="btn btn-primary" to="/games" style={{ marginTop: 12 }}>Find a game</Link></Empty>;
  const claim = async (id: string) => { try { const r = await api.post(`/api/missions/${id}/claim`); toast(`+${r.zo} ZO`, 'reward'); sfx.coin(); reload(); refresh(); } catch (e: any) { toast(e.message, 'bad'); } };
  const List = ({ items }: { items: any[] }) => (
    <div className="col">{items.map((m) => (
      <div key={m.id} className="panel panel-tight row" style={{ gap: 12 }}>
        <div className="center" style={{ width: 42, height: 42, borderRadius: 12, background: m.claimed ? 'rgba(61,220,151,.2)' : 'var(--surface-2)', flex: 'none' }}><Icon name={m.claimed ? 'check' : 'target'} /></div>
        <div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{m.title}</b><div className="timebar" style={{ height: 6, marginTop: 6 }}><i style={{ width: `${(m.progress / m.target) * 100}%` }} /></div></div>
        {m.claimed ? <Chip tone="ok">Claimed</Chip> : m.progress >= m.target ? <button className="btn btn-sm btn-primary" onClick={() => claim(m.id)}>Claim {m.zo} ZO</button> : <span className="mono dim">{m.progress}/{m.target} · {m.zo} ZO</span>}
      </div>
    ))}</div>
  );
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)' }}>Missions</h1>
      <p className="muted">Fresh daily missions every day at 00:00 UTC and weekly missions every Monday. Rewards are optional cosmetic currency, so play at your own pace.</p>
      {data && <><h3>Daily</h3><List items={data.daily} /><h3 style={{ marginTop: 16 }}>Weekly · {data.week}</h3><List items={data.weekly} /></>}
      <Link to="/me" className="btn btn-ghost">See achievements →</Link>
    </div>
  );
}

export function Shop() {
  useTitle('Shop');
  const { me, setMe, toast, refresh } = useStore();
  const { data, reload } = useAsync(() => api.get('/api/shop'), [me?.id]);
  const [plan, setPlan] = useState<any>(null);
  const [ack, setAck] = useState(false);
  if (!data) return <div className="spinner" />;
  const buy = async (id: string) => { try { await api.post('/api/shop/buy', { itemId: id }); sfx.coin(); toast('Unlocked!', 'reward'); reload(); refresh(); } catch (e: any) { toast(e.message, 'bad'); } };
  const equip = async (id: string) => { try { const r = await api.post('/api/shop/equip', { itemId: id }); setMe(r.user); sfx.select(); reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  const kinds: [string, string][] = [['avatar', 'Avatars'], ['frame', 'Frames'], ['theme', 'Themes']];
  return (
    <div className="stack-lg">
      <div className="row wrap"><h1 style={{ fontSize: 'var(--fs-2xl)', flex: 1 }}>Shop</h1>{me && <Coins n={data.zo} />}</div>
      <p className="muted">Cosmetics only. Nothing here changes scores, odds or gameplay. ZO coins are earned by playing and cannot be bought.</p>
      {kinds.map(([k, label]) => (
        <section key={k}>
          <h2 style={{ fontSize: 'var(--fs-xl)', marginBottom: 12 }}>{label}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {data.items.filter((i: any) => i.kind === k).map((i: any) => (
              <div key={i.id} className="panel panel-tight col" style={{ alignItems: 'center', textAlign: 'center', borderColor: i.equipped ? 'var(--zo-magenta)' : undefined }}>
                {k === 'avatar' ? <Avatar id={i.id} size={64} /> : k === 'frame' ? <Avatar id={me?.avatar ?? 'orb-1'} frame={i.id} size={64} /> : <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${i.colors[0]}, ${i.colors[1]})` }} />}
                <b style={{ fontSize: 13 }}>{i.name}</b>
                {i.equipped ? <Chip tone="on">Equipped</Chip> : i.owned ? <button className="btn btn-sm" onClick={() => equip(i.id)} disabled={!me}>Equip</button>
                  : i.plusOnly ? <Chip tone="gold">Plus members</Chip> : <button className="btn btn-sm btn-primary" disabled={!me || data.zo < i.priceZo} onClick={() => buy(i.id)}>{i.priceZo} ZO</button>}
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="panel" style={{ background: 'linear-gradient(120deg, rgba(255,207,51,.12), rgba(255,61,139,.1))' }}>
        <div className="panel-title"><Icon name="crown" /><h3>PLAYZO Plus</h3>{me?.premium && <Chip tone="gold">Active until {new Date(me.premiumUntil!).toLocaleDateString()}</Chip>}</div>
        <div className="row wrap" style={{ gap: 12, alignItems: 'stretch' }}>
          {data.plans.map((p: any) => (
            <div key={p.id} className="panel panel-tight" style={{ flex: '1 1 220px' }}>
              <b>{p.name}</b><div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, margin: '6px 0' }}>₹{p.priceInr}</div>
              <ul className="muted" style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>{p.perks.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <button className="btn btn-gold btn-block" style={{ marginTop: 10 }} disabled={!me?.social.canPurchase || !data.payments.devMock} onClick={() => { setPlan(p); setAck(false); }}>Subscribe</button>
            </div>
          ))}
        </div>
        <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>{data.payments.note}{me && !me.social.canPurchase ? ' Purchases are limited to adult account holders.' : ''}</p>
        {me?.premium && <button className="btn btn-ghost btn-sm" onClick={async () => { await api.post('/api/shop/cancel'); refresh(); toast('Membership cancelled'); }}>Cancel membership</button>}
      </section>
      <Modal open={!!plan} onClose={() => setPlan(null)} title="Test checkout">
        <div className="lounge-banner dev" style={{ marginBottom: 12 }}><Icon name="info" />TEST MODE: no payment is taken and no money moves. Real payments are disabled pending approvals.</div>
        <p>{plan?.name} · ₹{plan?.priceInr}</p>
        <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I understand this is a development test transaction.</label>
        <button className="btn btn-gold btn-block" style={{ marginTop: 14 }} disabled={!ack} onClick={async () => { try { await api.post('/api/shop/checkout', { planId: plan.id, acknowledgeTest: true }); toast('Test membership activated', 'reward'); setPlan(null); refresh(); reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>Complete test checkout</button>
      </Modal>
      {!me && <p><Link to="/login" className="btn btn-primary">Sign in to unlock cosmetics</Link></p>}
      <section><h2 style={{ fontSize: 'var(--fs-xl)', marginBottom: 12 }}>Earn more ZO</h2><div className="rail-x">{['logic-lock', 'word-duel', 'chess-blitz', 'rhythm-rush'].map((id) => <GameTile key={id} g={{ ...BY_ID[id] } as any} />)}</div></section>
    </div>
  );
}
