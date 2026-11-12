import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, trackEvent } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { GameTile, TileSkeletons, ErrorBox, Chip, Avatar, Empty, useTitle, SectionHead } from '../components/ui';
import { Icon } from '../components/Icon';
import { GameCover } from '../art/covers';
import { BY_ID, FAMILY } from '@shared/catalogue';
import { sfx } from '../lib/sound';
import { Tutorial } from '../games/runtime';
import { SeasonBoard } from './Engage';

const CATS = ['All', 'Brain & Logic', 'Word & Knowledge', 'Strategy', 'Reaction & Party'];
const FORMAT_LABEL: Record<string, string> = { solo: 'Solo', ai: 'vs Computer', versus: 'Live 1v1', teams: '2v2 Teams', group: 'Group room', race: 'Live race', async: 'Friend challenge', daily: 'Daily puzzle' };

export function Discover() {
  useTitle('Discover games', 'Browse all 25 original PLAYZO games: puzzles, word games, strategy and party games.');
  const { me } = useStore();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/games?env=family'), [me?.id]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [filter, setFilter] = useState<'all' | 'multi' | 'fav' | 'quick' | 'new'>('all');
  const list = useMemo(() => {
    let g = (data?.games ?? []) as any[];
    if (cat !== 'All') g = g.filter((x) => x.category === cat);
    if (filter === 'multi') g = g.filter((x) => x.multiplayer);
    if (filter === 'fav') g = g.filter((x) => x.me?.favourite);
    if (filter === 'quick') g = g.filter((x) => /second|1 min|^1-/.test(x.session));
    if (filter === 'new') g = g.filter((x) => !x.me?.plays);
    const s = q.trim().toLowerCase();
    if (s) g = g.filter((x) => `${x.title} ${x.tagline} ${x.category} ${x.tags.join(' ')}`.toLowerCase().includes(s));
    return g;
  }, [data, q, cat, filter]);
  return (
    <div className="stack">
      <h1 style={{ fontSize: 'var(--fs-2xl)' }}>Discover</h1>
      <div className="search"><Icon name="search" /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q && trackEvent('search', { q: q.slice(0, 40) })} placeholder="Search 25 games" aria-label="Search games" /></div>
      <div className="row wrap" role="tablist" aria-label="Categories">{CATS.map((c) => <button key={c} role="tab" aria-selected={cat === c} className={`chip ${cat === c ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => { setCat(c); sfx.tap(); }}>{c}</button>)}</div>
      <div className="seg" aria-label="Filter">
        {([['all', 'All'], ['multi', 'Multiplayer'], ['quick', 'Quick'], ['new', 'Not played'], ...(me ? [['fav', 'Favourites']] : [])] as [string, string][]).map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k as any)}>{l}</button>)}
      </div>
      {error && <ErrorBox message={error} retry={reload} />}
      {loading && !data ? <TileSkeletons n={10} /> : list.length ? <div className="grid-games">{list.map((g) => <GameTile key={g.id} g={g} showFav={!!me} />)}</div> : <Empty icon="search" title="No games match">Try another search or category.</Empty>}
    </div>
  );
}

export function GameDetail() {
  const { id = '' } = useParams();
  const { me } = useStore();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/games/${id}`), [id, me?.id]);
  const meta = BY_ID[id];
  useTitle(meta?.title ?? 'Game', meta ? `${meta.title}: ${meta.tagline} ${meta.description}` : undefined);
  const [diff, setDiff] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [tut, setTut] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useStore();
  if (error) return <ErrorBox message={error} retry={reload} />;
  if (loading || !data) return <div className="center" style={{ minHeight: '40vh' }}><div className="spinner" /></div>;
  const g = data.game;
  const supportsRoom = g.formats.some((f: string) => ['versus', 'teams', 'group', 'race'].includes(f));
  const room = async (teams = false) => {
    setCreating(true);
    try {
      if (!me) throw new Error('Sign in or play as a guest first');
      const r = await api.post('/api/rooms', { gameId: g.id, difficulty: diff, teams });
      nav(`/room/${r.code}`);
    } catch (e: any) { toast(e.message, 'bad'); } finally { setCreating(false); }
  };
  return (
    <div className="stack-lg">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div style={{ position: 'relative', minHeight: 300 }}><GameCover id={g.id} className="cover" /><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 60%, rgba(13,8,32,.9))' }} /></div>
          <div className="col" style={{ padding: 24, gap: 12 }}>
            <div className="row wrap" style={{ gap: 6 }}><Chip>{g.category}</Chip><Chip tone="ok">Ages {g.age}</Chip><Chip icon="clock">{g.session}</Chip>{g.multiplayer && <Chip tone="on" icon="users">Multiplayer</Chip>}</div>
            <h1 style={{ fontSize: 'var(--fs-2xl)' }}>{g.title}</h1>
            <p style={{ fontWeight: 700, color: g.theme.accent }}>{g.tagline}</p>
            <p className="muted">{g.description}</p>
            {g.me?.plays > 0 && <p className="dim" style={{ fontSize: 13 }}>You've played {g.me.plays} time{g.me.plays > 1 ? 's' : ''} · best {g.me.best.toLocaleString()}</p>}
            {!g.live && <Chip tone="warn">This game is in maintenance right now</Chip>}
            <div className="seg" aria-label="Difficulty">{(['easy', 'normal', 'hard'] as const).map((d) => <button key={d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)} style={{ textTransform: 'capitalize' }}>{d}</button>)}</div>
            <div className="row wrap">
              <Link className="btn btn-primary btn-lg" to={`/play/${g.id}?difficulty=${diff}`} onClick={() => sfx.select()}><Icon name="play" />{g.formats.includes('ai') ? 'Play vs computer' : 'Play solo'}</Link>
              {supportsRoom && <button className="btn btn-lg" onClick={() => room(false)} disabled={creating}><Icon name="users" />Create room</button>}
              {g.formats.includes('teams') && <button className="btn btn-lg" onClick={() => room(true)} disabled={creating}>2v2 teams</button>}
              <button className="btn btn-ghost" onClick={() => setTut(true)}><Icon name="info" />How to play</button>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>{g.formats.map((f: string) => <span key={f} className="chip">{FORMAT_LABEL[f]}</span>)}</div>
          </div>
        </div>
      </motion.section>
      <section className="row wrap" style={{ alignItems: 'stretch', gap: 16 }}>
        <div className="panel" style={{ flex: '2 1 360px' }}>
          <div className="panel-title"><Icon name="info" /><h3>Rules</h3></div>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }} className="muted">{g.rules.map((r: string) => <li key={r}>{r}</li>)}</ul>
          <div className="divider" />
          <p style={{ fontSize: 14 }}><b>Why it's different:</b> <span className="muted">{g.usp}</span></p>
          <p style={{ fontSize: 14, marginTop: 6 }}><b>Scoring:</b> <span className="muted">{g.scoring}</span></p>
          <p style={{ fontSize: 14, marginTop: 6 }}><b>Accessibility:</b> <span className="muted">{g.a11y.join(' · ')}</span></p>
          <p style={{ fontSize: 14, marginTop: 6 }}><b>Fair play:</b> <span className="muted">{g.mode === 'replay' ? 'You play on your device from a shared seed; the server replays your inputs to verify every score.' : 'The game state lives on the server, so hidden answers cannot be read from your device.'}</span></p>
        </div>
        <div className="panel" style={{ flex: '1 1 280px' }}>
          <div className="panel-title"><Icon name="trophy" /><h3>This week's top scores</h3></div>
          {data.leaderboard.length ? data.leaderboard.map((e: any) => (
            <div key={e.rank} className="row" style={{ gap: 10, padding: '5px 0' }}><b className="mono" style={{ width: 22 }}>{e.rank}</b><Avatar id={e.avatar} size={26} name={e.name} /><span style={{ flex: 1, fontSize: 14 }}>{e.name}{e.me ? ' (you)' : ''}</span><b className="mono">{e.score.toLocaleString()}</b></div>
          )) : <p className="dim">No scores this week yet.</p>}
          <Link to={`/leaderboards?game=${g.id}`} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>Full leaderboard →</Link>
        </div>
      </section>
      {data.related.length > 0 && <section><SectionHead title={`More ${g.category}`} /><div className="rail-x">{data.related.map((x: any) => <GameTile key={x.id} g={x} />)}</div></section>}
      <Tutorial meta={meta} open={tut} onClose={() => setTut(false)} />
    </div>
  );
}

export function Daily() {
  useTitle('Daily Puzzle');
  const { me } = useStore();
  const { data } = useAsync(() => api.get('/api/home'), [me?.id]);
  const { data: board } = useAsync(() => (data ? api.get(`/api/leaderboard/${data.daily.gameId}?scope=daily`) : Promise.resolve(null)), [data?.daily?.gameId]);
  if (!data) return <div className="center" style={{ minHeight: '40vh' }}><div className="spinner" /></div>;
  return (
    <div className="stack">
      <h1 style={{ fontSize: 'var(--fs-2xl)' }}>Daily Puzzle</h1>
      <p className="muted">One shared puzzle for everyone, every day (resets at 00:00 UTC). Today: <b>{data.daily.game.title}</b>.</p>
      <div style={{ maxWidth: 280 }}><GameTileLink id={data.daily.gameId} to={`/play/${data.daily.gameId}?context=daily`} /></div>
      <Link className="btn btn-primary btn-lg" to={`/play/${data.daily.gameId}?context=daily`}><Icon name="play" />{data.daily.done ? 'Play again' : 'Play today\'s puzzle'}</Link>
      <div className="panel">
        <div className="panel-title"><Icon name="trophy" /><h3>Today's board</h3></div>
        {board?.entries?.length ? board.entries.map((e: any) => <div key={e.rank} className="row" style={{ gap: 10, padding: '5px 0' }}><b className="mono" style={{ width: 24 }}>{e.rank}</b><Avatar id={e.avatar} size={26} name={e.name} /><span style={{ flex: 1 }}>{e.name}{e.me ? ' (you)' : ''}</span><b className="mono">{e.score.toLocaleString()}</b></div>) : <p className="dim">No finishes yet today.</p>}
      </div>
    </div>
  );
}
const GameTileLink = ({ id, to }: { id: string; to: string }) => <GameTile g={{ ...BY_ID[id], multiplayer: false } as any} to={to} />;

export function Leaderboards() {
  useTitle('Leaderboards');
  const { me } = useStore();
  const params = new URLSearchParams(location.search);
  const [game, setGame] = useState(params.get('game') ?? FAMILY[0].id);
  const [scope, setScope] = useState<'week' | 'all'>('week');
  const [friends, setFriends] = useState(false);
  const [view, setView] = useState<'games' | 'season'>(params.get('view') === 'season' ? 'season' : 'games');
  const { data, loading } = useAsync(() => (view === 'games' ? api.get(`/api/leaderboard/${game}?scope=${scope}${friends ? '&friends=1' : ''}`) : Promise.resolve(null)), [game, scope, friends, view]);
  if (view === 'season') return (
    <div className="stack">
      <div className="row wrap"><h1 style={{ fontSize: 'var(--fs-2xl)', flex: 1 }}>Leaderboards</h1><div className="seg"><button onClick={() => setView('games')}>By game</button><button className="on">Season</button></div></div>
      <div className="panel"><SeasonBoard /></div>
    </div>
  );
  return (
    <div className="stack">
      <div className="row wrap"><h1 style={{ fontSize: 'var(--fs-2xl)', flex: 1 }}>Leaderboards</h1><div className="seg"><button className="on">By game</button><button onClick={() => setView('season')}>Season</button></div></div>
      <div className="row wrap">
        <select className="input" style={{ maxWidth: 280 }} value={game} onChange={(e) => setGame(e.target.value)} aria-label="Game">{FAMILY.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
        <div className="seg"><button className={scope === 'week' ? 'on' : ''} onClick={() => setScope('week')}>This week</button><button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All time</button></div>
        {me && !me.isGuest && <label className="check"><input type="checkbox" checked={friends} onChange={(e) => setFriends(e.target.checked)} />Friends only</label>}
      </div>
      <div className="panel">
        {loading ? <div className="spinner" /> : data?.entries?.length ? (
          <div className="table-wrap"><table className="data"><thead><tr><th>#</th><th>Player</th><th>Level</th><th style={{ textAlign: 'right' }}>Best</th></tr></thead>
            <tbody>{data.entries.map((e: any) => <tr key={e.rank} style={e.me ? { background: 'rgba(255,61,139,.08)' } : undefined}><td className="mono">{e.rank}</td><td><span className="row" style={{ gap: 8 }}><Avatar id={e.avatar} size={24} name={e.name} />{e.userId ? <Link to={`/u/${e.userId}`}>{e.name}</Link> : e.name}{e.me ? ' (you)' : ''}</span></td><td>{e.level}</td><td className="mono" style={{ textAlign: 'right' }}>{e.score.toLocaleString()}</td></tr>)}</tbody></table></div>
        ) : <Empty icon="trophy" title="No scores yet">Play {BY_ID[game].title} to claim the top spot.</Empty>}
      </div>
    </div>
  );
}
