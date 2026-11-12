import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { GameTile, SectionHead, Skeleton, Avatar, Chip, ErrorBox, useTitle } from '../components/ui';
import { Icon } from '../components/Icon';
import { GameCover } from '../art/covers';
import { BY_ID } from '@shared/catalogue';
import { sfx } from '../lib/sound';
import { DailyRewardCard } from './Engage';
const Hero3D = lazy(() => import('../three/Hero3D'));

export default function Home() {
  useTitle('');
  const { me, toast, refresh } = useStore();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/home'), [me?.id]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const claim = async (id: string) => {
    setClaiming(id);
    try { const r = await api.post(`/api/missions/${id}/claim`); toast(`Mission complete! +${r.zo} ZO`, 'reward'); sfx.coin(); reload(); refresh(); } catch (e: any) { toast(e.message, 'bad'); } finally { setClaiming(null); }
  };
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Late-night legend' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="stack-lg">
      <section className="hero fade-up">
        <Suspense fallback={null}><Hero3D className="hero-3d" /></Suspense>
        <Chip tone="on" icon="sparkle">{me ? `${greet}, ${me.displayName}` : '25 original games · free to play'}</Chip>
        <div className="tagline">Aaja <span className="grad-text">PLAYZO</span> pe khelte hain!</div>
        <p className="muted" style={{ maxWidth: 46 + 'ch' }}>Brain teasers, word battles, strategy duels and party chaos. Play solo, race friends live, or take on today's Daily Puzzle.</p>
        <div className="row wrap">
          <button className="btn btn-primary btn-lg" onClick={() => { sfx.select(); nav(data ? `/play/${data.daily.gameId}?context=daily` : '/games'); }}><Icon name="play" />Play the Daily Puzzle</button>
          <Link className="btn btn-lg" to="/games"><Icon name="compass" />Explore games</Link>
        </div>
      </section>

      <DailyRewardCard />
      {error && <ErrorBox message={error} retry={reload} />}
      {loading && !data && <div className="grid-games">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={220} />)}</div>}
      {data && (
        <>
          {data.continuePlaying.length > 0 && (
            <section>
              <SectionHead eyebrow="Pick up where you left off" title="Continue playing" />
              <div className="rail-x">{data.continuePlaying.map((c: any) => <GameTile key={c.sessionId} g={c.game} to={`/play/${c.game.id}?resume=${c.sessionId}`} />)}</div>
            </section>
          )}

          <section className="row wrap" style={{ alignItems: 'stretch', gap: 16 }}>
            <motion.div whileHover={{ y: -3 }} className="panel" style={{ flex: '1 1 min(320px, 100%)', minWidth: 0, display: 'grid', gridTemplateColumns: '110px 1fr', gap: 16, alignItems: 'center' }}>
              <div style={{ borderRadius: 16, overflow: 'hidden', aspectRatio: '4/5' }}><GameCover id={data.daily.gameId} /></div>
              <div className="col" style={{ gap: 8 }}>
                <span className="chip on" style={{ width: 'fit-content' }}><Icon name="calendar" size={14} />Daily Puzzle · {data.daily.day}</span>
                <h3>{data.daily.game.title}</h3>
                <p className="muted" style={{ fontSize: 14 }}>Everyone gets the same puzzle today. Compare scores on the daily board.</p>
                <div className="row">
                  <Link className={`btn ${data.daily.done ? '' : 'btn-primary'}`} to={`/play/${data.daily.gameId}?context=daily`}>{data.daily.done ? 'Play again' : 'Play now'}</Link>
                  <Link className="btn btn-ghost" to="/daily">Board</Link>
                </div>
              </div>
            </motion.div>
            {data.missions && (
              <div className="panel" style={{ flex: '1 1 min(320px, 100%)', minWidth: 0 }}>
                <div className="panel-title"><Icon name="target" /><h3>Today's missions</h3><span className="spacer" />{data.streak > 0 && <Chip tone="warn" icon="flame">{data.streak}-day streak</Chip>}</div>
                <div className="col" style={{ gap: 10 }}>
                  {data.missions.daily.map((m: any) => (
                    <div key={m.id} className="row" style={{ gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{m.title}</div>
                        <div className="timebar" style={{ height: 6, marginTop: 6 }}><i style={{ width: `${(m.progress / m.target) * 100}%` }} /></div>
                      </div>
                      {m.claimed ? <Chip tone="ok" icon="check">Done</Chip> : m.progress >= m.target ? <button className="btn btn-sm btn-primary" disabled={claiming === m.id} onClick={() => claim(m.id)}>Claim {m.zo}</button> : <span className="dim mono" style={{ fontSize: 13 }}>{m.progress}/{m.target}</span>}
                    </div>
                  ))}
                </div>
                <Link to="/missions" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>Weekly missions & achievements →</Link>
              </div>
            )}
          </section>

          <section>
            <SectionHead eyebrow="Featured this week" title="Hand-picked for you" to="/games" />
            <div className="rail-x">{data.featured.map((g: any) => <GameTile key={g.id} g={g} showFav={!!me} />)}</div>
          </section>

          <section className="row wrap" style={{ alignItems: 'stretch', gap: 16 }}>
            <div className="panel" style={{ flex: '2 1 380px', position: 'relative', overflow: 'hidden' }}>
              <div className="panel-title"><Icon name="trophy" /><h3>Spotlight event: {data.spotlight.game.title}</h3></div>
              <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>Weekly leaderboard for {data.spotlight.week}. Boards reset every Monday (UTC).</p>
              {data.spotlight.leaderboard.length ? (
                <ol className="col" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
                  {data.spotlight.leaderboard.map((e: any) => <li key={e.rank} className="row" style={{ gap: 10 }}><b className="mono" style={{ width: 22 }}>{e.rank}</b><Avatar id={e.avatar} size={28} name={e.name} /><span style={{ flex: 1 }}>{e.name}{e.me ? ' (you)' : ''}</span><b className="mono">{e.score.toLocaleString()}</b></li>)}
                </ol>
              ) : <p className="dim">No scores yet this week. Be the first on the board!</p>}
              <Link to={`/games/${data.spotlight.game.id}`} className="btn btn-primary" style={{ marginTop: 14 }}>Compete now</Link>
            </div>
            <div className="panel" style={{ flex: '1 1 280px' }}>
              <div className="panel-title"><Icon name="users" /><h3>Friends activity</h3></div>
              {!me || me.isGuest ? <p className="muted" style={{ fontSize: 14 }}>Create an account to add friends and see what they're playing.</p>
                : data.friendsActivity.length ? data.friendsActivity.map((a: any, i: number) => (
                  <div key={i} className="row" style={{ gap: 10, padding: '6px 0' }}><Avatar id={a.avatar} size={28} name={a.name} /><span style={{ fontSize: 14, flex: 1 }}><b>{a.name}</b> scored {a.score?.toLocaleString()} in {BY_ID[a.game_id]?.title}</span></div>
                )) : <p className="muted" style={{ fontSize: 14 }}>No friend activity yet. <Link to="/friends" style={{ color: 'var(--zo-cyan)' }}>Find friends</Link></p>}
            </div>
          </section>

          {data.recommended.length > 0 && (
            <section>
              <SectionHead eyebrow={me ? 'Based on what you play' : 'Start here'} title="Recommended" />
              <div className="rail-x">{data.recommended.map((g: any) => <GameTile key={g.id} g={g} showFav={!!me} />)}</div>
            </section>
          )}
          {data.collections.map((c: any) => (
            <section key={c.id}>
              <SectionHead eyebrow={c.blurb} title={c.title} />
              <div className="rail-x">{c.games.map((g: any) => <GameTile key={g.id} g={g} showFav={!!me} />)}</div>
            </section>
          ))}
          {data.recent.length > 0 && (
            <section>
              <SectionHead eyebrow="Your history" title="Recently played" to="/me" action="Your stats" />
              <div className="rail-x">{data.recent.map((g: any) => <GameTile key={g.id} g={g} />)}</div>
            </section>
          )}
          {data.lounge.entitled && (
            <Link to="/lounge" className="panel row" style={{ background: 'linear-gradient(120deg, rgba(216,180,90,.18), rgba(10,10,30,.4))', borderColor: 'rgba(216,180,90,.4)' }}>
              <Icon name="crown" /><div><b>PLAYZO Lounge (18+)</b><div className="muted" style={{ fontSize: 13 }}>Adult-only social casino simulations with free, non-redeemable Fun Chips.</div></div><span className="spacer" /><Icon name="next" />
            </Link>
          )}
        </>
      )}
      <footer className="dim" style={{ fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
        PLAYZO · Made for play, not for money: ZO coins and Fun Chips have no cash value and cannot be bought, sold, transferred or redeemed. · <Link to="/legal/fair-play">Fair play</Link> · <Link to="/legal/privacy">Privacy</Link> · <Link to="/legal/terms">Terms</Link>
      </footer>
    </div>
  );
}
