import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GameHost, RoomGame, RoomCtx } from '../games/runtime';
import { BY_ID } from '@shared/catalogue';
import type { Difficulty } from '@shared/engine';
import { api } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { Avatar, Chip, ErrorBox, useTitle, Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { GameCover } from '../art/covers';
import { sfx, stinger } from '../lib/sound';
import { music } from '../lib/music';

export function Play() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const meta = BY_ID[id];
  useTitle(meta ? `Playing ${meta.title}` : 'Play');
  if (!meta || meta.env !== 'family') return <ErrorBox message="Game not found" />;
  const diff = (['easy', 'normal', 'hard'].includes(sp.get('difficulty') ?? '') ? sp.get('difficulty') : 'normal') as Difficulty;
  const context = (sp.get('context') ?? 'solo') as any;
  return <GameHost key={`${id}-${diff}-${context}-${sp.get('ref')}`} gameId={id} difficulty={diff} context={context} refId={sp.get('ref') ?? undefined} resume={sp.get('resume') ?? undefined} />;
}

export function Challenge() {
  const { id = '' } = useParams();
  const { me, ensureSession } = useStore();
  const nav = useNavigate();
  const { data, error } = useAsync(() => api.get(`/api/challenges/${id}`), [id, me?.id]);
  useTitle('Friend challenge');
  if (error) return <ErrorBox message={error} />;
  if (!data) return <div className="spinner" />;
  const c = data.challenge;
  const meta = BY_ID[c.gameId];
  const mineDone = c.mine ? c.fromScore !== null : c.toScore !== null;
  const share = async () => {
    const url = location.href;
    if (navigator.share) await navigator.share({ title: 'PLAYZO challenge', text: `Beat my ${meta.title} run on PLAYZO!`, url }).catch(() => undefined);
    else await navigator.clipboard?.writeText(url);
  };
  return (
    <div className="stack" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ borderRadius: 24, overflow: 'hidden', aspectRatio: '16/9', position: 'relative' }}><GameCover id={c.gameId} /><div className="center" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent, rgba(7,4,15,.85))', alignItems: 'end', padding: 20 }}><h2>{meta.title} challenge</h2></div></div>
      <div className="panel">
        <p><b>{c.fromName}</b> challenged {c.mine ? 'a friend' : 'you'} to the exact same {meta.title} puzzle ({c.difficulty}).</p>
        <div className="row" style={{ marginTop: 12, gap: 24, justifyContent: 'center' }}>
          <div className="kpi" style={{ alignItems: 'center' }}><b className="mono">{c.fromScore ?? '…'}</b><span>{c.fromName}</span></div>
          <span className="grad-text" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24 }}>VS</span>
          <div className="kpi" style={{ alignItems: 'center' }}><b className="mono">{c.toScore ?? '…'}</b><span>{c.mine ? 'Rival' : 'You'}</span></div>
        </div>
        {c.status === 'completed' && <p style={{ textAlign: 'center', marginTop: 12 }}><Chip tone="on" icon="trophy">{c.fromScore === c.toScore ? 'A perfect tie!' : `${c.fromScore > c.toScore ? c.fromName : c.mine ? 'Your rival' : 'You'} won`}</Chip></p>}
        <div className="row wrap" style={{ marginTop: 16, justifyContent: 'center' }}>
          {!mineDone && c.status === 'open' && <button className="btn btn-primary btn-lg" onClick={async () => { await ensureSession(); nav(`/play/${c.gameId}?context=challenge&ref=${c.id}`); }}><Icon name="play" />{c.mine ? 'Set your score' : 'Accept challenge'}</button>}
          {c.mine && <button className="btn btn-lg" onClick={share}><Icon name="share" />Share link</button>}
        </div>
        <p className="dim" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>Expires {new Date(c.expiresAt).toLocaleDateString()}. Both runs are verified by the server.</p>
      </div>
    </div>
  );
}

/* ================================== ROOMS ================================== */
export function Rooms() {
  useTitle('Play with friends');
  const { me, ensureSession, toast } = useStore();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [queueing, setQueueing] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  useEffect(() => () => ws.current?.close(), []);
  const join = async () => { await ensureSession(); if (code.trim().length === 6) nav(`/room/${code.trim().toUpperCase()}`); };
  const quick = async (gameId: string) => {
    await ensureSession();
    ws.current?.close();
    const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.current = s;
    s.onopen = () => s.send(JSON.stringify({ t: 'queue', gameId }));
    s.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'queued') setQueueing(gameId);
      if (m.t === 'matched') { sfx.fanfare(); s.close(); nav(`/room/${m.code}`); }
      if (m.t === 'error') { toast(m.message, 'bad'); setQueueing(null); s.close(); }
    };
  };
  const versus = ['chess-blitz', 'connect-five', 'hex-conquest', 'territory-wars', 'word-duel', 'memory-duel', 'trivia-clash'];
  return (
    <div className="stack-lg">
      <div><h1 style={{ fontSize: 'var(--fs-2xl)' }}>Play with friends</h1><p className="muted">Live rooms, races on the same seed, 2v2 team trivia and quick match. Chat is emotes-only to keep everyone safe.</p></div>
      <div className="panel">
        <div className="panel-title"><Icon name="link" /><h3>Join a room</h3></div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); join(); }}>
          <input className="input mono" style={{ textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: 20, maxWidth: 220 }} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, ''))} placeholder="CODE" aria-label="Room code" />
          <button className="btn btn-primary" disabled={code.length !== 6}>Join</button>
        </form>
        <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>To create a room, open any multiplayer game and tap <b>Create room</b>.</p>
      </div>
      <div className="panel">
        <div className="panel-title"><Icon name="bolt" /><h3>Quick match</h3>{queueing && <Chip tone="on">Searching for {BY_ID[queueing].title}…</Chip>}</div>
        {me && !me.social.canUsePublicMatchmaking ? <p className="muted" style={{ fontSize: 14 }}>Quick match with strangers is available to registered accounts aged 13+. You can still play with friends using room codes.</p> : (
          <div className="row wrap">{versus.map((g) => <button key={g} className="btn" onClick={() => quick(g)} disabled={!!queueing}>{BY_ID[g].title}</button>)}{queueing && <button className="btn btn-ghost" onClick={() => { ws.current?.send(JSON.stringify({ t: 'unqueue' })); ws.current?.close(); setQueueing(null); }}>Cancel</button>}</div>
        )}
      </div>
      <div className="panel">
        <div className="panel-title"><Icon name="flag" /><h3>Async challenges</h3></div>
        <ChallengeList />
      </div>
    </div>
  );
}

function ChallengeList() {
  const { me } = useStore();
  const { data } = useAsync(() => (me ? api.get('/api/challenges') : Promise.resolve({ challenges: [] })), [me?.id]);
  if (!data?.challenges?.length) return <p className="muted" style={{ fontSize: 14 }}>Finish a game and tap <b>Challenge a friend</b> to send the same puzzle to someone.</p>;
  return <div className="col">{data.challenges.map((c: any) => <Link key={c.id} to={`/challenge/${c.id}`} className="row" style={{ gap: 10 }}><b style={{ flex: 1 }}>{BY_ID[c.game_id]?.title}</b><span className="dim" style={{ fontSize: 13 }}>{c.from_name} {c.from_score ?? '…'} vs {c.to_name ?? 'open'} {c.to_score ?? '…'}</span><Chip tone={c.status === 'completed' ? 'ok' : undefined}>{c.status}</Chip></Link>)}</div>;
}

export function Room() {
  const { code = '' } = useParams();
  const { me, ensureSession, toast } = useStore();
  const nav = useNavigate();
  const [room, setRoom] = useState<any>(null);
  const [state, setState] = useState<{ view: any; v: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [emotes, setEmotes] = useState<string[]>([]);
  const [floating, setFloating] = useState<{ id: number; e: string; from: string }[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const [conn, setConn] = useState<'connecting' | 'open' | 'closed'>('connecting');
  useTitle(`Room ${code}`);
  useEffect(() => {
    let alive = true, retry = 0;
    let mine: WebSocket | null = null; // the socket owned by THIS effect run (never another run's)
    const connect = async () => {
      await ensureSession();
      if (!alive) return; // unmounted while waiting: never open an orphan connection
      const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      mine = s;
      ws.current = s;
      s.onopen = () => { setConn('open'); retry = 0; s.send(JSON.stringify({ t: 'join', code })); };
      s.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'hello') setEmotes(m.emotes);
        if (m.t === 'room') setRoom(m.room);
        if (m.t === 'state') setState((p) => ({ view: m.view, v: (p?.v ?? 0) + 1 }));
        if (m.t === 'emote') { const id = Date.now() + Math.random(); setFloating((f) => [...f, { id, e: m.e, from: m.from }]); setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 2200); }
        if (m.t === 'error') { if (['NOT_FOUND', 'STARTED', 'FULL', 'FORBIDDEN', 'CLOSED'].includes(m.code)) { alive = false; setErr(m.message); } else toast(m.message, 'bad'); }
      };
      s.onclose = () => { setConn('closed'); if (alive && retry < 15) { retry++; setTimeout(connect, Math.min(5000, 600 * retry)); } };
    };
    connect();
    return () => {
      alive = false;
      const s = mine as WebSocket | null;
      if (s) { if (s.readyState === 1) s.send(JSON.stringify({ t: 'leave' })); s.close(); }
      if (ws.current === s) ws.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  // Room soundtrack: calm in the waiting room, full arrangement in play, a stinger at the result.
  const status = room?.status as string | undefined;
  useEffect(() => {
    if (!room) return;
    if (status === 'lobby') music.play(room.gameId, { intensity: 0.3 });
    else if (status === 'playing') music.play(room.gameId, { intensity: 0.8 });
    else if (status === 'done') {
      music.stop(1);
      const r = room.result;
      const won = r && (room.teams ? r.teamWinner !== null && room.members.find((m: any) => m.me)?.team === r.teamWinner : r.winner === me?.id);
      stinger(won ? 'victory' : r && (r.winner || r.teamWinner !== null) ? 'defeat' : 'complete');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, room?.gameId]);
  useEffect(() => () => music.stop(0.6), []);
  const send = (m: any) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(m));
  if (err) return <ErrorBox message={err} retry={() => nav('/rooms')} />;
  if (!room || !me) return <div className="center" style={{ minHeight: '40vh' }}><div className="spinner" /><p className="dim">Connecting to room {code}…</p></div>;
  const meta = BY_ID[room.gameId];
  const meMember = room.members.find((m: any) => m.userId === me.id);
  const isHost = room.hostId === me.id;
  const ctx: RoomCtx = { code, members: room.members, turn: null, status: room.status, result: room.result, send, teams: room.teams };
  const shareCode = async () => {
    const url = `${location.origin}/room/${code}`;
    if (navigator.share) await navigator.share({ title: `Join my ${meta.title} room on PLAYZO`, text: `Room code ${code}. Aaja PLAYZO pe khelte hain!`, url }).catch(() => undefined);
    else { await navigator.clipboard?.writeText(url); toast('Invite link copied', 'ok'); }
  };
  return (
    <div className="stage">
      <div className="stage-bar">
        <Link to={`/games/${room.gameId}`} className="btn btn-ghost icon-btn" aria-label="Leave room"><Icon name="back" /></Link>
        <div><h3 style={{ fontSize: 17 }}>{meta.title}</h3><span className="dim" style={{ fontSize: 12 }}>Room <b className="mono">{code}</b> · {room.format === 'race' ? 'Race' : room.teams ? '2v2 teams' : 'Live match'} · {room.difficulty}</span></div>
        <span className="spacer" />
        {conn !== 'open' && <Chip tone="warn">Reconnecting…</Chip>}
        <button className="btn btn-sm" onClick={shareCode}><Icon name="share" size={14} />Invite</button>
      </div>
      <div className="stage-body">
        {room.status === 'lobby' && (
          <div className="panel" style={{ width: '100%', maxWidth: 560 }}>
            <div className="row" style={{ gap: 14 }}>
              <div style={{ width: 90, borderRadius: 14, overflow: 'hidden', aspectRatio: '4/5' }}><GameCover id={room.gameId} /></div>
              <div><h3>Waiting room</h3><p className="muted" style={{ fontSize: 14 }}>Share code <b className="mono" style={{ fontSize: 18, letterSpacing: '0.2em' }}>{code}</b> with friends. {room.members.length}/{room.maxPlayers} joined.</p></div>
            </div>
            <div className="divider" />
            <div className="col">
              {room.members.map((m: any) => (
                <div key={m.userId} className="row" style={{ gap: 10 }}>
                  <Avatar id={m.avatar} size={34} name={m.name} /><b style={{ flex: 1 }}>{m.name}{m.userId === room.hostId ? ' (host)' : ''}{m.me ? ' · you' : ''}</b>
                  {room.teams && <span className="chip" style={{ borderColor: m.team ? '#4dabff' : '#ff6b6b' }}>Team {m.team ? 'B' : 'A'}</span>}
                  {m.userId === room.hostId ? <Chip tone="gold">Host</Chip> : m.ready ? <Chip tone="ok" icon="check">Ready</Chip> : <Chip>Not ready</Chip>}
                </div>
              ))}
            </div>
            <div className="row wrap" style={{ marginTop: 16 }}>
              {room.teams && meMember && <button className="btn" onClick={() => send({ t: 'team', team: meMember.team ? 0 : 1 })}>Switch team</button>}
              {!isHost && meMember && <button className={`btn ${meMember.ready ? '' : 'btn-primary'}`} onClick={() => send({ t: 'ready', v: !meMember.ready })}>{meMember.ready ? 'Not ready' : "I'm ready"}</button>}
              {isHost && <button className="btn btn-primary btn-lg" onClick={() => { sfx.select(); send({ t: 'start' }); }}><Icon name="play" />Start match</button>}
            </div>
          </div>
        )}
        {room.status !== 'lobby' && room.format === 'versus' && state && (
          <RoomGame gameId={room.gameId} view={state.view} version={state.v} me={me.id} room={ctx} />
        )}
        {room.status === 'playing' && room.format === 'race' && room.race?.seed && !room.race.scores[me.id] && (
          <GameHost gameId={room.gameId} difficulty={room.difficulty} context="race" refId={code} />
        )}
        {room.format === 'race' && room.status !== 'lobby' && (
          <div className="panel" style={{ width: '100%', maxWidth: 560 }}>
            <div className="panel-title"><Icon name="trophy" /><h3>Race standings</h3></div>
            {room.members.map((m: any) => ({ m, s: room.race.scores[m.userId] })).sort((a: any, b: any) => (b.s?.score ?? -1) - (a.s?.score ?? -1)).map(({ m, s }: any, i: number) => (
              <div key={m.userId} className="row" style={{ gap: 10, padding: '4px 0' }}><b className="mono" style={{ width: 20 }}>{i + 1}</b><Avatar id={m.avatar} size={26} name={m.name} /><span style={{ flex: 1 }}>{m.name}{m.me ? ' (you)' : ''}</span>{s ? <b className="mono">{s.score.toLocaleString()}</b> : <span className="dim pulse">playing…</span>}</div>
            ))}
          </div>
        )}
        {room.status === 'done' && room.result && (
          <div className="panel results" style={{ width: '100%', maxWidth: 560 }}>
            <h2>{room.teams ? (room.result.teamWinner === null ? 'Teams tied!' : `Team ${room.result.teamWinner ? 'B' : 'A'} wins!`) : room.result.winner ? (room.result.winner === me.id ? 'You win!' : `${room.members.find((m: any) => m.userId === room.result.winner)?.name ?? 'Opponent'} wins`) : "It's a draw"}</h2>
            {room.result.summary?.reason && <p className="dim">{room.result.summary.reason}</p>}
            <div className="col" style={{ width: '100%' }}>{room.members.map((m: any) => <div key={m.userId} className="row" style={{ gap: 10 }}><Avatar id={m.avatar} size={26} name={m.name} /><span style={{ flex: 1, textAlign: 'left' }}>{m.name}</span><b className="mono">{Math.round(room.result.scores[m.userId] ?? 0).toLocaleString()}</b><Chip tone={room.result.outcomes[m.userId] === 'win' ? 'ok' : undefined}>{room.result.outcomes[m.userId]}</Chip></div>)}</div>
            <div className="row">{isHost && <button className="btn btn-primary" onClick={() => send({ t: 'rematch' })}>Rematch</button>}<Link className="btn" to="/rooms">Back to rooms</Link></div>
            <p className="dim" style={{ fontSize: 12 }}>Results saved to everyone's match history.</p>
          </div>
        )}
        {emotes.length > 0 && room.status !== 'lobby' && (
          <div className="row wrap" style={{ justifyContent: 'center' }} aria-label="Quick reactions">{emotes.map((e) => <button key={e} className="btn btn-sm" onClick={() => send({ t: 'emote', e })}>{e}</button>)}</div>
        )}
        {emotes.length > 0 && room.status === 'lobby' && <div className="row wrap" style={{ justifyContent: 'center' }}>{emotes.map((e) => <button key={e} className="btn btn-sm" onClick={() => send({ t: 'emote', e })}>{e}</button>)}</div>}
        <div style={{ position: 'fixed', right: 16, bottom: 90, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none', zIndex: 50 }}>
          {floating.map((f) => <div key={f.id} className="toast pop-in" style={{ fontSize: 18 }}>{f.e} <span className="dim" style={{ fontSize: 12 }}>{f.from}</span></div>)}
        </div>
        {!room.members.length && <Empty title="Room is empty" />}
      </div>
    </div>
  );
}
