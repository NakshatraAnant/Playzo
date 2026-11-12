import { createContext, lazy, ReactNode, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BY_ID, GameMeta } from '@shared/catalogue';
import { REPLAY_ENGINES } from '@shared/games';
import type { Difficulty } from '@shared/engine';
import { SeededRng } from '@shared/rng';
import { api, ApiError, serverNow } from '../lib/api';
import { useStore } from '../lib/store';
import { sfx, stinger, prefs, setPref, onPrefs } from '../lib/sound';
import { music } from '../lib/music';
import { Icon } from '../components/Icon';
import { Modal, Chip } from '../components/ui';

export interface Completion { xp: number; zo: number; level: number; leveledUp: boolean; personalBest: boolean; achievements: string[] }
export interface Ctl {
  meta: GameMeta; mode: 'server' | 'replay'; view: any; version: number; me: string; difficulty: Difficulty;
  /** Server / room action. Resolves with the server response (or null in rooms). */
  act: (action: any) => Promise<any>;
  /** Replay: apply an action locally at time t (ms since start) and log it for server verification. */
  record: (action: any, t?: number) => boolean;
  /** Replay: submit the run now (used when the local state is already over). */
  finish: () => void;
  elapsed: () => number;
  over: boolean; busy: boolean; room: RoomCtx | null; lounge: boolean;
  chips: number | null; setChips: (n: number) => void;
  sessionId: string | null; commit: string | null;
}
export interface RoomCtx { code: string; members: { userId: string; name: string; avatar: string; team: number; connected: boolean }[]; turn: string | null; status: string; result: any; send: (m: any) => void; teams: boolean }

const CtlContext = createContext<Ctl>(null as any);
export const useCtl = () => useContext(CtlContext);

const COMPONENTS: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  'mind-maze': lazy(() => import('./family/MindMaze')), 'pattern-hunter': lazy(() => import('./family/PatternHunter')), 'number-rush': lazy(() => import('./family/NumberRush')),
  'logic-lock': lazy(() => import('./family/LogicLock')), 'sequence-master': lazy(() => import('./family/SequenceMaster')), 'grid-genius': lazy(() => import('./family/GridGenius')),
  'code-breaker': lazy(() => import('./family/CodeBreaker')), 'word-duel': lazy(() => import('./family/WordDuel')), 'trivia-clash': lazy(() => import('./family/RoundsGame')),
  'emoji-decode': lazy(() => import('./family/EmojiDecode')), 'word-ladder': lazy(() => import('./family/WordLadder')), 'geo-sprint': lazy(() => import('./family/GeoSprint')),
  'fact-or-fiction': lazy(() => import('./family/FactOrFiction')), 'territory-wars': lazy(() => import('./family/TerritoryWars')), 'hex-conquest': lazy(() => import('./family/HexConquest')),
  'connect-five': lazy(() => import('./family/ConnectFive')), 'block-battle': lazy(() => import('./family/BlockBattle')), 'tower-tactics': lazy(() => import('./family/TowerTactics')),
  'chess-blitz': lazy(() => import('./family/ChessBlitz')), 'reflex-arena': lazy(() => import('./family/ReflexArena')), 'color-dash': lazy(() => import('./family/ColorDash')),
  'memory-duel': lazy(() => import('./family/MemoryDuel')), 'rhythm-rush': lazy(() => import('./family/RhythmRush')), 'obstacle-sprint': lazy(() => import('./family/ObstacleSprint')),
  'party-chaos': lazy(() => import('./family/RoundsGame')),
  'eu-roulette': lazy(() => import('./lounge/Roulette')), 'us-roulette': lazy(() => import('./lounge/Roulette')), 'fr-roulette': lazy(() => import('./lounge/Roulette')),
  blackjack: lazy(() => import('./lounge/Blackjack')), 'blackjack-duel': lazy(() => import('./lounge/BlackjackDuel')), baccarat: lazy(() => import('./lounge/Baccarat')),
  'sic-bo': lazy(() => import('./lounge/SicBo')), holdem: lazy(() => import('./lounge/Poker')), omaha: lazy(() => import('./lounge/Poker')), 'teen-patti': lazy(() => import('./lounge/TeenPatti')),
  'andar-bahar': lazy(() => import('./lounge/AndarBahar')), 'dragon-tiger': lazy(() => import('./lounge/DragonTiger')), 'three-card-poker': lazy(() => import('./lounge/ThreeCardPoker')),
  'video-poker': lazy(() => import('./lounge/VideoPoker')), 'classic-slots': lazy(() => import('./lounge/Slots')), 'adventure-slots': lazy(() => import('./lounge/Slots')),
  'vault-slots': lazy(() => import('./lounge/Slots')), 'cosmic-reels': lazy(() => import('./lounge/Slots')), 'neon-fruit': lazy(() => import('./lounge/Slots')), 'mystery-jackpot': lazy(() => import('./lounge/Slots')),
  plinko: lazy(() => import('./lounge/Plinko')), 'dice-arena': lazy(() => import('./lounge/DiceArena')), 'hi-lo': lazy(() => import('./lounge/HiLo')), mines: lazy(() => import('./lounge/Mines')), 'crash-flight': lazy(() => import('./lounge/CrashFlight')),
};

/** Replay engines end a run with these actions (submitted and verified like any other input). */
const END_ACTION: Record<string, any> = { 'obstacle-sprint': { a: 'end' }, 'tower-tactics': { type: 'end' } };

/* ------------------------------------------------------------------ */
export function Tutorial({ meta, open, onClose }: { meta: GameMeta; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`How to play ${meta.title}`}>
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
        {meta.tutorial.map((s, i) => (
          <li key={i} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="center" style={{ flex: 'none', width: 30, height: 30, borderRadius: 10, background: 'var(--grad-zo)', fontWeight: 900 }}>{i + 1}</span>
            <span style={{ paddingTop: 4 }}>{s}</span>
          </li>
        ))}
      </ol>
      <div className="divider" />
      <p className="muted" style={{ fontSize: 14 }}><b>Controls:</b> {meta.controls}</p>
      <p className="muted" style={{ fontSize: 14, marginTop: 6 }}><b>Scoring:</b> {meta.scoring}</p>
      {meta.a11y.length > 0 && <p className="dim" style={{ fontSize: 13, marginTop: 6 }}>Accessibility: {meta.a11y.join(' · ')}</p>}
      <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 20 }} onClick={onClose}>Let's play</button>
    </Modal>
  );
}

function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    if (n === 0) { sfx.count(true); onDone(); return; }
    sfx.count(false);
    const t = setTimeout(() => setN(n - 1), 650);
    return () => clearTimeout(t);
  }, [n, onDone]);
  return (
    <div className="center" style={{ minHeight: 320 }}>
      <AnimatePresence mode="popLayout">
        <motion.div key={n} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          style={{ fontFamily: 'var(--font-display)', fontSize: 120, fontWeight: 900 }} className="grad-text">{n || 'GO'}</motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function Results({ meta, score, completion, verified, result, onReplay, extra }: { meta: GameMeta; score: number; completion: Completion | null; verified: string; result?: any; onReplay: () => void; extra?: ReactNode }) {
  const { me, toast } = useStore();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const won = result?.winner === 'p1' || (!!me && result?.winner === me.id);
    if (completion?.leveledUp) stinger('levelUp');
    else if (result?.winner !== undefined && result?.winner !== null) stinger(won ? 'victory' : 'defeat');
    else if (completion?.personalBest) stinger('victory');
    else stinger('complete');
    if (completion?.achievements?.length) { const t = setTimeout(() => sfx.achievement(), 900); return () => clearTimeout(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completion]);
  const challenge = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ id: string; link: string }>('/api/challenges', { gameId: meta.id, difficulty: 'normal' });
      const url = `${location.origin}${r.link}`;
      const text = `I'm on PLAYZO playing ${meta.title}. Beat my run on the exact same puzzle! Aaja PLAYZO pe khelte hain!`;
      if (navigator.share) await navigator.share({ title: 'PLAYZO challenge', text, url }).catch(() => undefined);
      else { await navigator.clipboard?.writeText(`${text} ${url}`); toast('Challenge link copied', 'ok'); }
      nav(r.link);
    } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const share = async () => {
    const text = `I scored ${score.toLocaleString()} in ${meta.title} on PLAYZO! Aaja PLAYZO pe khelte hain!`;
    const url = `${location.origin}/games/${meta.id}`;
    if (navigator.share) await navigator.share({ title: meta.title, text, url }).catch(() => undefined);
    else { await navigator.clipboard?.writeText(`${text} ${url}`); toast('Copied to clipboard', 'ok'); }
  };
  const won = result?.winner === 'p1' || result?.winner === me?.id;
  return (
    <motion.div className="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Chip tone="ok" icon="shield">{verified}</Chip>
      {result?.winner !== undefined && result?.winner !== null && <h2>{won ? 'Victory!' : 'Good game!'}</h2>}
      {result?.winner === null && meta.formats.includes('ai') && <h2>It's a draw</h2>}
      <div className="big grad-text mono">{score.toLocaleString()}</div>
      <p className="muted">points{completion?.personalBest ? ' · New personal best!' : ''}</p>
      {completion && (
        <div className="reward-row">
          <span className="reward"><Icon name="star" />+{completion.xp} XP</span>
          {completion.zo > 0 && <span className="reward"><Icon name="coins" />+{completion.zo} ZO</span>}
          {completion.leveledUp && <span className="reward pop-in" style={{ borderColor: 'var(--zo-saffron)' }}><Icon name="crown" />Level {completion.level}!</span>}
        </div>
      )}
      {completion?.achievements?.map((a) => <Chip key={a} tone="on" icon="trophy">Achievement unlocked: {a}</Chip>)}
      {extra}
      <div className="row wrap" style={{ justifyContent: 'center', marginTop: 8 }}>
        <button className="btn btn-primary btn-lg" onClick={onReplay}><Icon name="refresh" />Play again</button>
        {meta.formats.includes('async') && me && !me.isGuest && <button className="btn btn-lg" onClick={challenge} disabled={busy}><Icon name="flag" />Challenge a friend</button>}
        <button className="btn btn-lg" onClick={share}><Icon name="share" />Share</button>
      </div>
      <Link to={`/games/${meta.id}`} className="btn btn-ghost">Back to {meta.title}</Link>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
interface HostProps { gameId: string; difficulty: Difficulty; context?: 'solo' | 'daily' | 'challenge' | 'race'; refId?: string; resume?: string; onExit?: () => void; raceView?: ReactNode }

/** Solo / daily / challenge / race host for a single game session. */
export function GameHost({ gameId, difficulty, context = 'solo', refId, resume, raceView }: HostProps) {
  const meta = BY_ID[gameId];
  const { ensureSession, toast, refresh, me } = useStore();
  const [phase, setPhase] = useState<'loading' | 'tutorial' | 'countdown' | 'playing' | 'submitting' | 'done' | 'error'>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [view, setView] = useState<any>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ score: number; completion: Completion | null; result: any } | null>(null);
  const [chips, setChips] = useState<number | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const pausedAt = useRef<number | null>(null);
  const local = useRef<{ state: any; log: any[]; start: number; lastT: number } | null>(null);
  const finishing = useRef(false);
  const tutKey = `pz-tut-${gameId}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      setPhase('loading'); setDone(null); setErr(null); finishing.current = false; setPaused(false); pausedAt.current = null;
      try {
        await ensureSession();
        let s: any = null;
        if (resume && run === 0) { try { const r = await api.get(`/api/sessions/${resume}`); if (r.status === 'active' && r.mode === 'server' && r.gameId === gameId) s = r; } catch { /* start fresh */ } }
        if (!s) s = await api.post('/api/sessions', { gameId, difficulty, context, ref: refId });
        if (!alive) return;
        setSession(s);
        setChips(s.chips ?? null);
        if (s.mode === 'replay') {
          const e = REPLAY_ENGINES[gameId];
          const state = e.init({ players: ['p1'], difficulty: s.difficulty, seed: s.seed }, { rng: new SeededRng(`${s.seed}::replay`), now: 0, player: 'p1' });
          local.current = { state, log: [], start: 0, lastT: 0 };
          setView(state);
        } else setView(s.view);
        let seen = false;
        try { seen = !!localStorage.getItem(tutKey); } catch { /* ignore */ }
        if (!seen) { setTutorialOpen(true); setPhase('tutorial'); } else setPhase(s.mode === 'replay' ? 'countdown' : 'playing');
      } catch (e: any) {
        if (!alive) return;
        setErr(e.message); setPhase('error');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, difficulty, context, refId, run, resume]);

  // Lounge: always close the session (resolving any open round by published rules) when leaving.
  useEffect(() => () => { if (session?.sessionId && meta.env === 'lounge') api.post(`/api/sessions/${session.sessionId}/end`).catch(() => undefined); }, [session?.sessionId, meta.env]);

  const startPlay = useCallback(() => {
    if (local.current) local.current.start = performance.now();
    setPhase('playing');
  }, []);
  const closeTutorial = () => {
    try { localStorage.setItem(tutKey, '1'); } catch { /* ignore */ }
    setTutorialOpen(false);
    if (phase === 'tutorial') setPhase(session?.mode === 'replay' ? 'countdown' : 'playing');
  };

  const submit = useCallback(async () => {
    if (!local.current || finishing.current) return;
    finishing.current = true;
    setPhase('submitting');
    try {
      const r = await api.post(`/api/sessions/${session.sessionId}/submit`, { actions: local.current.log });
      setDone({ score: r.score, completion: r.completion, result: r.result });
      setPhase('done');
      refresh();
    } catch (e: any) { setErr(e.message); setPhase('error'); }
  }, [session, refresh]);

  const record = useCallback((action: any, t?: number) => {
    const L = local.current;
    if (!L || phase !== 'playing' || finishing.current || pausedAt.current !== null) return false;
    const e = REPLAY_ENGINES[gameId];
    const time = Math.max(L.lastT, Math.round(t ?? performance.now() - L.start));
    const a = { ...action, t: time };
    try {
      e.apply(L.state, a, { rng: new SeededRng('unused'), now: time, player: 'p1' });
    } catch (err: any) {
      if (err?.code === 'IMPLAUSIBLE') return false;
      return false;
    }
    L.log.push(a);
    L.lastT = time;
    setVersion((v) => v + 1);
    if (e.isOver(L.state)) setTimeout(submit, 350);
    return true;
  }, [gameId, phase, submit]);

  const act = useCallback(async (action: any) => {
    if (!session) return null;
    if (pausedAt.current !== null) return null;
    if (action?.type !== 'tick') setBusy(true);
    try {
      const r = await api.post(`/api/sessions/${session.sessionId}/action`, { action });
      setView(r.view);
      setVersion((v) => v + 1);
      if (typeof r.chips === 'number') setChips(r.chips);
      if (r.over) {
        setDone({ score: Math.max(0, Math.round(r.result?.scores?.p1 ?? 0)), completion: r.completion, result: r.result });
        setTimeout(() => setPhase('done'), meta.env === 'family' ? 900 : 0);
        refresh();
      }
      return r;
    } catch (e: any) {
      if (e instanceof ApiError && e.code === 'SESSION_ENDED') { setErr('This session has ended.'); setPhase('error'); }
      else if (action?.type !== 'tick') { toast(e.message, 'bad'); sfx.bad(); }
      throw e;
    } finally { if (action?.type !== 'tick') setBusy(false); }
  }, [session, toast, refresh, meta.env]);

  // Adaptive soundtrack: quiet intro while loading/tutorial/countdown, full arrangement in play, stop at results.
  useEffect(() => {
    if (phase === 'loading' || phase === 'tutorial' || phase === 'countdown') music.play(gameId, { intensity: 0.3 });
    else if (phase === 'playing') { music.play(gameId, { intensity: 0.75 }); music.setIntensity(0.75); }
    else if (phase === 'submitting') music.setIntensity(0.3);
    else music.stop(1.2);
  }, [phase, gameId, run]);
  useEffect(() => { music.setUrgency(0); }, [run]);
  useEffect(() => () => music.stop(0.6), [gameId]);

  const pause = useCallback(async () => {
    if (!session || pausedAt.current !== null || phase !== 'playing' || meta.env !== 'family' || context !== 'solo') return;
    pausedAt.current = performance.now();
    music.pause();
    setPaused(true);
    api.post(`/api/sessions/${session.sessionId}/pause`).catch(() => undefined);
  }, [session, phase, meta.env, context]);
  const resumeGame = useCallback(async () => {
    if (!session || pausedAt.current === null) return;
    try {
      const r = await api.post(`/api/sessions/${session.sessionId}/resume`);
      if (local.current) local.current.start += performance.now() - pausedAt.current;
      pausedAt.current = null;
      music.resume();
      if (r?.view) setView(r.view);
      setVersion((v) => v + 1);
      setPaused(false);
    } catch (e: any) { toast(e.message, 'bad'); }
  }, [session, toast]);
  // Auto-pause solo games when the tab is hidden (phone call, app switch).
  useEffect(() => {
    const h = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [pause]);
  useKeys({ Escape: () => (pausedAt.current === null ? pause() : resumeGame()) }, [pause, resumeGame]);

  const ctl: Ctl = useMemo(() => ({
    meta, mode: session?.mode ?? 'server', view: session?.mode === 'replay' ? local.current?.state : view, version, me: 'p1', difficulty: session?.difficulty ?? difficulty,
    act, record, finish: submit, elapsed: () => (local.current && phase === 'playing' ? (pausedAt.current ?? performance.now()) - local.current.start : 0),
    over: phase === 'done' || phase === 'submitting', busy, room: null, lounge: meta.env === 'lounge', chips, setChips, sessionId: session?.sessionId ?? null, commit: session?.commit ?? null,
  }), [meta, session, view, version, act, record, submit, phase, busy, chips, difficulty]);

  if (!meta) return <p>Unknown game.</p>;
  const Comp = COMPONENTS[gameId];
  const replay = () => { setRun((r) => r + 1); };
  const pausable = meta.env === 'family' && context === 'solo' && phase === 'playing' && !!session;
  const restart = async () => {
    setConfirmRestart(false);
    if (session?.sessionId && phase !== 'done') await api.post(`/api/sessions/${session.sessionId}/end`).catch(() => undefined);
    replay();
  };

  return (
    <div className={`stage ${meta.env === 'lounge' ? 'lounge' : ''}`}>
      <div className="stage-bar">
        <Link to={meta.env === 'lounge' ? `/lounge/${meta.id}` : `/games/${meta.id}`} className="btn btn-ghost icon-btn" aria-label="Leave game"><Icon name="back" /></Link>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.title}</h3>
          <div className="row" style={{ gap: 6 }}>
            {meta.env === 'family' && <span className="dim" style={{ fontSize: 12, textTransform: 'capitalize' }}>{context === 'solo' ? session?.difficulty ?? difficulty : context}</span>}
            {context === 'daily' && <Chip tone="on" icon="calendar">Daily</Chip>}
            {context === 'challenge' && <Chip tone="on" icon="flag">Challenge</Chip>}
            {context === 'race' && <Chip tone="on" icon="users">Race</Chip>}
          </div>
        </div>
        <span className="spacer" />
        {chips !== null && <span className="chip gold mono">{chips.toLocaleString()} chips</span>}
        {pausable && <button className="btn btn-ghost icon-btn" onClick={() => pause()} aria-label="Pause game" data-testid="pause"><Icon name="pause" /></button>}
        {session?.mode === 'replay' && phase === 'playing' && <button className="btn btn-sm btn-ghost" onClick={() => { if (confirm('Finish this run now and submit your score?')) { const end = END_ACTION[gameId] ?? { end: true }; if (!record(end)) submit(); } }} data-testid="finish-run"><Icon name="flag" size={14} />Finish</button>}
        {meta.env === 'family' && context === 'solo' && (phase === 'playing' || phase === 'done') && <button className="btn btn-ghost icon-btn" onClick={() => setConfirmRestart(true)} aria-label="Restart game" data-testid="restart"><Icon name="refresh" /></button>}
        <MusicToggle />
        <button className="btn btn-ghost icon-btn" onClick={() => setTutorialOpen(true)} aria-label="How to play"><Icon name="info" /></button>
      </div>
      <div className="stage-body">
        {phase === 'loading' && <div className="center" style={{ minHeight: 300 }}><div className="spinner" /></div>}
        {phase === 'error' && (
          <div className="empty panel" style={{ maxWidth: 480 }}>
            <Icon name="info" />
            <p style={{ marginBottom: 14 }}>{err}</p>
            <div className="row" style={{ justifyContent: 'center' }}><button className="btn btn-primary" onClick={replay}>Try again</button><Link className="btn" to="/">Home</Link></div>
          </div>
        )}
        {phase === 'countdown' && <Countdown onDone={startPlay} />}
        {(phase === 'playing' || phase === 'submitting' || phase === 'tutorial') && view && Comp && (
          <CtlContext.Provider value={ctl}>
            <Suspense fallback={<div className="spinner" />}><Comp /></Suspense>
          </CtlContext.Provider>
        )}
        {phase === 'submitting' && <div className="row muted"><div className="spinner" />Verifying your run on the server…</div>}
        {phase === 'done' && done && (
          <>
            <Results meta={meta} score={done.score} completion={done.completion} result={done.result}
              verified={session?.mode === 'replay' ? 'Score verified by server replay' : 'Server-authoritative result'} onReplay={replay} extra={raceView} />
            {me?.isGuest && <p className="dim" style={{ fontSize: 13, textAlign: 'center' }}>Playing as a guest. <Link to="/register" style={{ color: 'var(--zo-cyan)' }}>Create an account</Link> to keep your progress safe and add friends.</p>}
          </>
        )}
      </div>
      {paused && (
        <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Game paused" data-testid="pause-overlay">
          <div className="panel" style={{ maxWidth: 360, textAlign: 'center' }}>
            <Icon name="pause" size={34} />
            <h2 style={{ margin: '8px 0' }}>Paused</h2>
            <p className="muted" style={{ fontSize: 14 }}>The clock is stopped. Paused runs still earn XP and missions but don't count for leaderboards.</p>
            <div className="col" style={{ marginTop: 14 }}>
              <button className="btn btn-primary btn-lg" onClick={() => resumeGame()} autoFocus data-testid="resume"><Icon name="play" />Resume</button>
              <button className="btn" onClick={() => setConfirmRestart(true)}><Icon name="refresh" />Restart</button>
              <Link className="btn btn-ghost" to={`/games/${meta.id}`}>Quit to game page</Link>
            </div>
          </div>
        </div>
      )}
      <Modal open={confirmRestart} onClose={() => setConfirmRestart(false)} title="Restart this game?">
        <p className="muted">Your current run will end without a score and a fresh one starts.</p>
        <div className="row" style={{ marginTop: 16 }}><button className="btn btn-primary" onClick={restart} data-testid="confirm-restart">Restart</button><button className="btn btn-ghost" onClick={() => setConfirmRestart(false)}>Cancel</button></div>
      </Modal>
      <Tutorial meta={meta} open={tutorialOpen} onClose={closeTutorial} />
    </div>
  );
}

/** Live room host: the server engine runs in the room; the component plays through the same Ctl contract. */
/** In-game music on/off (remembered on this device). */
export function MusicToggle() {
  const [on, setOn] = useState(prefs.musicOn);
  useEffect(() => { const off = onPrefs(() => setOn(prefs.musicOn)); return () => { off(); }; }, []);
  return <button className="btn btn-ghost icon-btn" onClick={() => setPref('musicOn', !on)} aria-label={on ? 'Turn music off' : 'Turn music on'} aria-pressed={on} data-testid="music-toggle"><Icon name={on ? 'music' : 'music-off'} /></button>;
}

export function RoomGame({ gameId, view, version, me, room }: { gameId: string; view: any; version: number; me: string; room: RoomCtx }) {
  const meta = BY_ID[gameId];
  useEffect(() => { if (room.status === 'playing') music.play(gameId, { intensity: 0.8 }); }, [gameId, room.status]);
  const Comp = COMPONENTS[gameId];
  const ctl: Ctl = useMemo(() => ({
    meta, mode: 'server', view, version, me, difficulty: 'normal',
    act: async (action: any) => { room.send({ t: 'act', action }); return null; }, record: () => false, finish: () => undefined, elapsed: () => 0,
    over: room.status === 'done', busy: false, room, lounge: false, chips: null, setChips: () => undefined, sessionId: null, commit: null,
  }), [meta, view, version, me, room]);
  return <CtlContext.Provider value={ctl}><Suspense fallback={<div className="spinner" />}><Comp /></Suspense></CtlContext.Provider>;
}

/* ---------------- small shared helpers for game UIs ---------------- */
export function Hud({ items }: { items: [string, ReactNode][] }) {
  return <div className="hud">{items.map(([k, v]) => <div key={k} className="stat"><b>{v}</b><span>{k}</span></div>)}</div>;
}
export function TimeBar({ frac }: { frac: number }) {
  // Hurry-up: the soundtrack tightens (double-time hats, fills, slightly faster) in the last 20%.
  const hurry = frac > 0 && frac < 0.2;
  useEffect(() => { music.setUrgency(hurry ? 1 : 0); return () => music.setUrgency(0); }, [hurry]);
  return <div className="timebar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}><i style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} /></div>;
}
/** Re-render on every animation frame while active. Returns ms elapsed (replay clock). */
export function useFrame(active: boolean): number {
  const ctl = useCtl();
  const [, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => { setT((x) => x + 1); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return ctl.elapsed();
}
/** Server-timed games: request a tick when a server deadline passes. */
export function useServerTick(deadline: number | null | undefined, active: boolean) {
  const ctl = useCtl();
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      force((x) => x + 1);
      if (deadline && serverNow() > deadline + 150 && !ctl.room) ctl.act({ type: 'tick' }).catch(() => undefined);
    }, 250);
    return () => clearInterval(id);
  }, [deadline, active, ctl]);
  return serverNow();
}
export function useKeys(map: Record<string, () => void>, deps: unknown[]) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const f = map[e.key] ?? map[e.key.toLowerCase()];
      if (f) { e.preventDefault(); f(); }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
export const playerName = (ctl: Ctl, id: string | null | undefined) => {
  if (!id) return '';
  if (id === 'ai') return 'Computer';
  if (id === ctl.me) return 'You';
  return ctl.room?.members.find((m) => m.userId === id)?.name ?? 'Player';
};
