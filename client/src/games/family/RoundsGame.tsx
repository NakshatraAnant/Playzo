/** UI for the timed simultaneous-round games: Trivia Clash (quiz, lifeline, categories) and Party Chaos (micro-games). */
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCtl, Hud, TimeBar, useServerTick, useKeys, playerName } from '../runtime';
import { sfx } from '../../lib/sound';
import { Chip } from '../../components/ui';

const CAT_COL: Record<string, string> = { Science: '#3dd9ff', Space: '#8b5cff', India: '#ff9933', Nature: '#3ddc97', Sport: '#ff5a5f', Tech: '#5cc8ff', General: '#ffd23f' };

export default function RoundsGame() {
  const ctl = useCtl();
  const v = ctl.view as any;
  const now = useServerTick(v.phase === 'question' ? v.deadline : v.phase === 'reveal' ? v.revealUntil : null, v.phase !== 'done');
  const party = ctl.meta.id === 'party-chaos';
  const q = v.question;
  const answered = !!v.myAnswer;
  const lastPhase = useRef(v.phase);
  useEffect(() => {
    if (lastPhase.current !== v.phase && v.phase === 'reveal' && v.myAnswer) v.myAnswer.choice === q?.correct ? sfx.good() : sfx.bad();
    if (lastPhase.current !== v.phase && v.phase === 'question') sfx.whoosh();
    lastPhase.current = v.phase;
  }, [v.phase, v.myAnswer, q]);
  const pick = (i: number) => { if (v.phase === 'question' && !answered && now >= v.qStart && !v.removed.includes(i)) { sfx.select(); ctl.act({ type: 'answer', choice: i }).catch(() => undefined); } };
  useKeys({ '1': () => pick(0), '2': () => pick(1), '3': () => pick(2), '4': () => pick(3) }, [v.idx, v.phase, answered, now]);
  const left = v.phase === 'question' ? Math.max(0, v.deadline - now) : 0;
  const players = Object.keys(v.scores);
  const multi = players.length > 1;
  const teamScore = (t: number) => players.filter((p) => (v.teams?.[p] ?? 0) === t).reduce((s, p) => s + v.scores[p], 0);
  if (!q) return <p>Wrapping up…</p>;
  return (
    <>
      <Hud items={[['Round', `${v.idx + 1}/${v.total}`], ['Score', v.scores[ctl.me] ?? 0], ...(v.teams ? [['Team A', teamScore(0)], ['Team B', teamScore(1)]] as [string, number][] : multi ? players.filter((p) => p !== ctl.me).slice(0, 3).map((p) => [playerName(ctl, p), v.scores[p]] as [string, number]) : [])]} />
      <div className="board-wrap"><TimeBar frac={v.phase === 'question' ? left / v.limitMs : 0} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={v.idx} initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }} className="panel" style={{ width: '100%', maxWidth: 600, textAlign: 'center' }}>
          {q.tag && <Chip tone="on">{party ? q.tag : <span style={{ color: CAT_COL[q.tag] }}>{q.tag}</span>}</Chip>}
          <h3 style={{ marginTop: 12, fontSize: 'clamp(1.1rem, 1rem + 1vw, 1.5rem)', lineHeight: 1.3 }}>{now < v.qStart ? 'Get ready…' : q.prompt}</h3>
          {q.visual?.dots && now >= v.qStart && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, maxWidth: 320, margin: '16px auto 0' }}>{q.visual.dots.map((c: string, i: number) => <i key={i} style={{ aspectRatio: '1', borderRadius: '50%', background: c }} />)}</div>}
          {q.visual?.shapes && now >= v.qStart && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 340, margin: '16px auto 0', fontSize: 28 }}>{q.visual.shapes.map((s: string, i: number) => <span key={i}>{s}</span>)}</div>}
        </motion.div>
      </AnimatePresence>
      <div className="answer-grid">
        {q.options.map((o: string, i: number) => {
          const reveal = v.phase !== 'question';
          const right = reveal && q.correct === i, wrong = reveal && v.myAnswer?.choice === i && q.correct !== i;
          const removed = v.removed.includes(i);
          const who = reveal && v.revealAnswers ? Object.entries(v.revealAnswers as Record<string, any>).filter(([, a]) => a.choice === i).map(([p]) => playerName(ctl, p)) : [];
          return (
            <button key={i} className={`answer ${right ? 'right' : ''} ${wrong ? 'wrong' : ''}`} onClick={() => pick(i)} disabled={answered || removed || reveal || now < v.qStart}
              style={{ fontSize: party && q.options[0].length <= 2 ? 34 : undefined, opacity: removed ? 0.2 : v.myAnswer?.choice === i && !reveal ? 1 : undefined, outline: v.myAnswer?.choice === i && !reveal ? '2px solid var(--zo-cyan)' : undefined }}>
              <span className="k">{i + 1}</span>{o}
              {who.length > 0 && multi && <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>{who.join(', ')}</div>}
            </button>
          );
        })}
      </div>
      <div className="row">
        {v.lifelines > 0 && v.phase === 'question' && !answered && <button className="btn" onClick={() => ctl.act({ type: 'fifty' }).catch(() => undefined)}>50:50 lifeline</button>}
        {v.phase === 'reveal' && v.myAnswer && <span className="chip" aria-live="polite">{v.myAnswer.pts ? `+${v.myAnswer.pts} points` : 'No points this round'}</span>}
        {v.phase === 'reveal' && !v.myAnswer && <span className="chip warn">Time's up</span>}
        {answered && v.phase === 'question' && multi && <span className="chip pulse">Waiting for others ({v.answered.length}/{players.length})</span>}
      </div>
    </>
  );
}
