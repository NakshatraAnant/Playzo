/**
 * Behavioural fair-play scoring for replay-verified runs. Replay verification proves a run is
 * possible and humanly timed; these signals look for scripted play inside that envelope:
 *  - metronomic input (very low variation between inputs over many inputs),
 *  - sustained inputs faster than deliberate human reaction,
 *  - the same interval repeated to the millisecond far more often than human jitter allows.
 * A flagged run keeps its XP, but its leaderboard entry is held until staff clear or remove it.
 * Thresholds are deliberately conservative: false positives only delay a leaderboard entry.
 */
import type { FastifyInstance } from 'fastify';
import { db, nowIso } from './db';
import { requireRole, HttpError, audit, oneOf } from './http';
import { notify } from './notify';

export const FLAG_THRESHOLD = 60;
export interface BotSignals { inputs: number; cv: number | null; fastShare: number; repeatShare: number; score: number }

export function botScore(actions: { t: number; end?: unknown; a?: unknown }[]): BotSignals {
  const ts = actions.filter((a) => !a.end && a.a !== 'end' && typeof a.t === 'number').map((a) => a.t);
  const dts = ts.slice(1).map((t, i) => t - ts[i]).filter((d) => d >= 0);
  const out: BotSignals = { inputs: ts.length, cv: null, fastShare: 0, repeatShare: 0, score: 0 };
  if (dts.length < 15) return out; // too few inputs to judge
  const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
  const sd = Math.sqrt(dts.reduce((a, b) => a + (b - mean) ** 2, 0) / dts.length);
  out.cv = mean > 0 ? sd / mean : 0;
  out.fastShare = dts.filter((d) => d < 90).length / dts.length;
  const freq = new Map<number, number>();
  for (const d of dts) freq.set(d, (freq.get(d) ?? 0) + 1);
  out.repeatShare = Math.max(...freq.values()) / dts.length;
  if (out.cv < 0.05) out.score += 45; else if (out.cv < 0.1) out.score += 20;
  if (out.fastShare > 0.4) out.score += 35; else if (out.fastShare > 0.2) out.score += 15;
  if (out.repeatShare > 0.5) out.score += 40; else if (out.repeatShare > 0.3) out.score += 15;
  out.score = Math.min(100, out.score);
  return out;
}

/** Called after a replay run is verified and recorded. */
export function reviewRun(sessionId: string, actions: any[]) {
  const s = botScore(actions);
  db().run('UPDATE game_sessions SET bot_score = ? WHERE id = ?', s.score, sessionId);
  if (s.score >= FLAG_THRESHOLD) {
    db().run("UPDATE game_sessions SET review_status = 'flagged', review_note = ? WHERE id = ?", JSON.stringify(s), sessionId);
    db().run('UPDATE scores SET held = 1 WHERE session_id = ?', sessionId);
  }
  return s;
}

export async function fairPlayRoutes(app: FastifyInstance) {
  app.get('/api/admin/reviews', async (req) => {
    requireRole(req, ['admin', 'support']);
    const status = String((req.query as any).status ?? 'flagged');
    return {
      runs: db().all(
        `SELECT s.id, s.game_id, s.score, s.bot_score, s.review_status, s.review_note, s.started_at, u.username, u.id AS user_id
         FROM game_sessions s JOIN users u ON u.id = s.user_id WHERE s.review_status = ? ORDER BY s.started_at DESC LIMIT 100`, oneOf(status, ['flagged', 'cleared', 'removed'] as const, 'Status'),
      ),
      threshold: FLAG_THRESHOLD,
    };
  });
  app.post('/api/admin/reviews/:id', async (req) => {
    const staff = requireRole(req, ['admin', 'support']);
    const id = (req.params as any).id;
    const decision = oneOf((req.body as any)?.decision, ['clear', 'remove'] as const, 'Decision');
    const row = db().get<{ user_id: string; game_id: string; review_status: string }>('SELECT user_id, game_id, review_status FROM game_sessions WHERE id = ?', id);
    if (!row || row.review_status !== 'flagged') throw new HttpError(404, 'No flagged run with that id', 'NOT_FOUND');
    db().tx(() => {
      if (decision === 'clear') db().run('UPDATE scores SET held = 0 WHERE session_id = ?', id);
      else db().run('DELETE FROM scores WHERE session_id = ?', id);
      db().run('UPDATE game_sessions SET review_status = ?, review_note = COALESCE(review_note, \'\') || ? WHERE id = ?', decision === 'clear' ? 'cleared' : 'removed', ` | ${decision} by staff ${nowIso()}`, id);
    });
    audit(staff.id, `admin.run_${decision}`, id, { game: row.game_id });
    if (decision === 'clear') notify(row.user_id, 'system', 'Your score is back on the leaderboard', 'A routine fair-play check on your run is complete.', `/leaderboards?game=${row.game_id}`);
    return { ok: true };
  });
}
