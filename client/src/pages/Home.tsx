import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, trackEvent } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { GameTile, SectionHead, Skeleton, Avatar, Chip, ErrorBox, useTitle } from '../components/ui';
import { Icon } from '../components/Icon';
import { GameCover } from '../art/covers';
import { BY_ID } from '@shared/catalogue';
import { sfx } from '../lib/sound';
import { DailyRewardCard } from './Engage';
const Hero3D = lazy(() => import('../three/Hero3D'));

const Rail = ({ games, me }: { games: any[]; me: boolean }) => <div className="rail-x">{games.map((g: any) => <GameTile key={g.id} g={g} showFav={me} />)}</div>;

export default function Home() {
  useTitle('');
  const { me, toast, refresh, ensureSession } = useStore();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/home'), [me?.id]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const claim = async (id: string) => {
    setClaiming(id);
    try { const r = await api.post(`/api/missions/${id}/claim`); toast(`Mission complete! +${r.zo} ZO`, 'reward'); sfx.coin(); reload(); refresh(); } catch (e: any) { toast(e.message, 'bad'); } finally { setClaiming(null); }
  };
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Late-night legend' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  /** PLAY NOW: straight into a game. Continue an open game, else your top recommendation, else a quick game. */
  const playNow = async () => {
    sfx.select();
    trackEvent('cta_play_now');
    await ensureSession().catch(() => undefined);
    const c = data?.continuePlaying?.[0];
    if (c) return nav(`/play/${c.game.id}?resume=${c.sessionId}`);
    const pick = data?.recommended?.[0] ?? data?.quick?.[Math.floor(Math.random() * (data?.quick?.length || 1))];
    nav(pick ? `/play/${pick.id}` : '/games');
  };
  const cm = data?.community;
  return (
    <div className="stack-lg">
      <section className="hero fade-up" aria-labelledby="hero-title">
        <Suspense fallback={null}><Hero3D className="hero-3d" /></Suspense>
        <Chip tone="on" icon="sparkle">{me && !me.isGuest ? `${greet}, ${me.displayName}` : '25 original games · free to play · no sign-up needed'}</Chip>
        <h1 id="hero-title" className="tagline">Your place to <span className="grad-text">play</span>, compete and connect.</h1>
        <p className="muted hero-sub">Aaja PLAYZO pe khelte hain! Puzzles, word battles, strategy duels and party games. Play solo, challenge friends, or join a live room in seconds.</p>
        <div className="row wrap hero-ctas">
          <button className="btn btn-primary btn-lg" onClick={playNow} data-testid="cta-play-now"><Icon name="play" />PLAY NOW</button>
          <Link className="btn btn-lg btn-friends" to="/rooms" onClick={() => trackEvent('cta_play_friends')} data-testid="cta-play-friends"><Icon name="users" />PLAY WITH FRIENDS</Link>
          <Link className="btn btn-lg btn-ghost" to="/games" onClick={() => trackEvent('cta_explore')} data-testid="cta-explore"><Icon name="compass" />EXPLORE GAMES</Link>
        </div>
        {cm && (cm.players > 0 || cm.gamesThisWeek > 0) && (
          <div className="row wrap community" aria-label="Community this week">
            {cm.players > 0 && <span><b>{cm.players.toLocaleString()}</b> players</span>}
            {cm.gamesThisWeek > 0 && <span><b>{cm.gamesThisWeek.toLocaleString()}</b> games played this week</span>}
            {cm.matchesThisWeek > 0 && <span><b>{cm.matchesThisWeek.toLocaleString()}</b> live matches this week</span>}
          </div>
        )}
      </section>

      <DailyRewardCard />
      {error && <ErrorBox message={error} retry={reload} />}
      {loading && !data && <div className="grid-games">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={220} />)}</div>}
      {data && (
        <>
          {/* 1. Continue playing */}
          {(data.continuePlaying.length > 0 || data.recent.length > 0) && (
            <section>
              <SectionHead eyebrow="Pick up where you left off" title="Continue playing" to="/me" action="Your stats" />
              <div className="rail-x">
                {data.continuePlaying.map((c: any) => <GameTile key={c.sessionId} g={c.game} to={`/play/${c.game.id}?resume=${c.sessionId}`} />)}
                {data.recent.filter((g: any) => !data.continuePlaying.some((c: any) => c.game.id === g.id)).map((g: any) => <GameTile key={`r-${g.id}`} g={g} />)}
              </div>
            </section>
          )}

          {/* 2. Popular right now (real play counts), else clearly-labelled staff picks */}
          <section>
            {data.popular.length >= 3
              ? <><SectionHead eyebrow="Most played this week" title="Popular right now" to="/games" /><Rail games={data.popular} me={!!me} /></>
              : <><SectionHead eyebrow="Picked by the PLAYZO team" title="Start with these" to="/games" /><Rail games={data.featured} me={!!me} /></>}
          </section>

          {me && !me.isGuest && data.recommended.length > 0 && (
            <section>
              <SectionHead eyebrow={me.preferences?.length ? 'Based on the games you like' : 'Based on what you play'} title="Recommended for you" to="/settings#tastes" action="Your tastes" />
              <Rail games={data.recommended} me />
            </section>
          )}

          {/* 3. Quick games */}
          <section>
            <SectionHead eyebrow="Three minutes or less" title="Quick games" />
            <Rail games={data.quick} me={!!me} />
          </section>

          {/* 4. Play with friends */}
          <section className="panel friends-panel">
            <div className="friends-copy">
              <span className="chip on" style={{ width: 'fit-content' }}><Icon name="users" size={14} />Live multiplayer</span>
              <h2>Play with friends</h2>
              <p className="muted">Make a room, share the code or link, and play live: 1v1 duels, 2v2 trivia teams and races on the same puzzle. Chat is emoji reactions only.</p>
              <div className="row wrap">
                <Link className="btn btn-primary" to="/games/word-duel"><Icon name="plus" />Create a room</Link>
                <Link className="btn" to="/rooms"><Icon name="link" />Join with a code</Link>
                <Link className="btn btn-ghost" to="/rooms"><Icon name="bolt" />Quick match</Link>
              </div>
            </div>
            <div className="rail-x friends-rail">{data.multiplayer.slice(0, 8).map((g: any) => <GameTile key={g.id} g={g} />)}</div>
          </section>

          {/* 5. Daily challenge + missions */}
          <section className="row wrap" style={{ alignItems: 'stretch', gap: 16 }}>
            <motion.div whileHover={{ y: -3 }} className="panel" style={{ flex: '1 1 min(320px, 100%)', minWidth: 0, display: 'grid', gridTemplateColumns: 'clamp(72px, 26%, 110px) minmax(0, 1fr)', gap: 14, alignItems: 'center' }}>
              <div style={{ borderRadius: 16, overflow: 'hidden', aspectRatio: '4/5' }}><GameCover id={data.daily.gameId} /></div>
              <div className="col" style={{ gap: 8 }}>
                <span className="chip on" style={{ width: 'fit-content' }}><Icon name="calendar" size={14} />Daily challenge · {data.daily.day}</span>
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
                      <div style={{ flex: 1, minWidth: 0 }}>
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

          {data.trending.length >= 3 && (
            <section>
              <SectionHead eyebrow="Most played in the last 48 hours" title="Trending" />
              <Rail games={data.trending} me={!!me} />
            </section>
          )}

          {/* 6-11. Categories */}
          <section aria-label="Browse by category">
            <div className="cat-chips">
              {data.categories.map((c: any) => <a key={c.key} href={`#cat-${c.key}`} className="cat-chip"><Icon name={c.icon} size={16} />{c.label}</a>)}
            </div>
          </section>
          {data.categories.map((c: any) => (
            <section key={c.key} id={`cat-${c.key}`}>
              <SectionHead eyebrow={`${c.games.length} games`} title={c.label} to={`/games?tag=${c.key}`} />
              <Rail games={c.games} me={!!me} />
            </section>
          ))}

          {/* 12. Featured: weekly spotlight event */}
          <section className="row wrap" style={{ alignItems: 'stretch', gap: 16 }}>
            <div className="panel" style={{ flex: '2 1 min(380px, 100%)', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
              <div className="panel-title"><Icon name="trophy" /><h3>Featured event: {data.spotlight.game.title}</h3></div>
              <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>Weekly leaderboard for {data.spotlight.week}. Boards reset every Monday (UTC). For fun only: no prizes.</p>
              {data.spotlight.leaderboard.length ? (
                <ol className="col" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
                  {data.spotlight.leaderboard.map((e: any) => <li key={e.rank} className="row" style={{ gap: 10 }}><b className="mono" style={{ width: 22 }}>{e.rank}</b><Avatar id={e.avatar} size={28} name={e.name} /><span style={{ flex: 1 }}>{e.name}{e.me ? ' (you)' : ''}</span><b className="mono">{e.score.toLocaleString()}</b></li>)}
                </ol>
              ) : <p className="dim">No scores yet this week. Be the first on the board!</p>}
              <Link to={`/games/${data.spotlight.game.id}`} className="btn btn-primary" style={{ marginTop: 14 }}>Compete now</Link>
            </div>
            <div className="panel" style={{ flex: '1 1 min(280px, 100%)', minWidth: 0 }}>
              <div className="panel-title"><Icon name="users" /><h3>Friends activity</h3></div>
              {!me || me.isGuest ? <p className="muted" style={{ fontSize: 14 }}>Create an account to add friends and see what they're playing.</p>
                : data.friendsActivity.length ? data.friendsActivity.map((a: any, i: number) => (
                  <div key={i} className="row" style={{ gap: 10, padding: '6px 0' }}><Avatar id={a.avatar} size={28} name={a.name} /><span style={{ fontSize: 14, flex: 1 }}><b>{a.name}</b> scored {a.score?.toLocaleString()} in {BY_ID[a.game_id]?.title}</span></div>
                )) : <p className="muted" style={{ fontSize: 14 }}>No friend activity yet. <Link to="/friends" style={{ color: 'var(--zo-cyan)' }}>Find friends</Link></p>}
            </div>
          </section>
          <section>
            <SectionHead eyebrow="Featured this week" title="Featured games" to="/games" />
            <Rail games={data.featured} me={!!me} />
          </section>

          {data.lounge.visible && (
            <Link to="/lounge" className="panel row lounge-entry">
              <Icon name="crown" /><div><b>PLAYZO Lounge (21+)</b><div className="muted" style={{ fontSize: 13 }}>A separate lounge with free, non-redeemable Fun Chips.</div></div><span className="spacer" /><Icon name="next" />
            </Link>
          )}
        </>
      )}
      <footer className="dim" style={{ fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
        PLAYZO · Your place to play, compete and connect. ZO coins and Fun Chips have no cash value and cannot be bought, sold, transferred or redeemed. · <Link to="/legal/fair-play">Fair play</Link> · <Link to="/legal/privacy">Privacy</Link> · <Link to="/legal/terms">Terms</Link> · <Link to="/support">Help</Link>
      </footer>
    </div>
  );
}
