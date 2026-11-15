/**
 * Multiplayer load test (local evidence, not a production capacity claim).
 * Starts an isolated API with an in-memory database, signs up 2 x ROOMS players, opens real
 * WebSockets, and has every room play Connect Five moves concurrently. Measures the time from
 * sending a move to receiving the authoritative state broadcast.
 *   npx tsx scripts/load-test.ts [rooms=50] [movesPerPlayer=8]
 */
process.env.PLAYZO_DB_PATH = ':memory:';
process.env.PLAYZO_RATE_LIMIT_MULTIPLIER = '1000';
process.env.PLAYZO_AUTO_BACKUP = 'false';
export {};
const WS = (await import('ws')).default;
const { buildApp } = await import('../server/app');

const ROOMS = Number(process.argv[2] ?? 50), MOVES = Number(process.argv[3] ?? 8);
const app = await buildApp();
await app.listen({ port: 0, host: '127.0.0.1', backlog: 2048 });
const base = `127.0.0.1:${(app.server.address() as any).port}`;
const H = { 'content-type': 'application/json', 'x-playzo': '1' };

async function player(i: number) {
  const r = await fetch(`http://${base}/api/auth/register`, { method: 'POST', headers: H, body: JSON.stringify({ email: `lt${i}@load.local`, username: `lt${i}`, password: 'password123', dob: '1990-01-01', acceptTerms: true }) });
  if (!r.ok) throw new Error(`register ${i}: ${r.status} ${await r.text()}`);
  return r.headers.get('set-cookie')!.split(';')[0];
}
function sock(cookie: string) {
  const ws = new WS(`ws://${base}/ws`, { headers: { cookie } });
  const waiters: { pred: (m: any) => boolean; res: (m: any) => void }[] = [];
  ws.on('error', (e) => { for (const w of waiters.splice(0)) void w; console.error('ws error', String(e)); });
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); } });
  const wait = (pred: (m: any) => boolean, ms = 10000) => new Promise<any>((res, rej) => { waiters.push({ pred, res }); setTimeout(() => rej(new Error('timeout')), ms); });
  return { ws, wait, open: new Promise((r) => ws.on('open', r)), send: (m: any) => ws.send(JSON.stringify(m)) };
}

const t0 = performance.now();
// Players arrive in batches (realistic); the gameplay below then runs fully concurrently.
const cookies: string[] = [];
for (let i = 0; i < ROOMS * 2; i += 25) cookies.push(...await Promise.all(Array.from({ length: Math.min(25, ROOMS * 2 - i) }, (_, k) => player(i + k))));
const latencies: number[] = [];
let errors = 0;
const mem0 = process.memoryUsage().rss;
await Promise.all(Array.from({ length: ROOMS }, async (_, r) => {
  try {
    await new Promise((res) => setTimeout(res, r * 8)); // rooms open over ~1 s, like real players
    const ca = cookies[2 * r], cb = cookies[2 * r + 1];
    const { code } = await (await fetch(`http://${base}/api/rooms`, { method: 'POST', headers: { ...H, cookie: ca }, body: JSON.stringify({ gameId: 'connect-five' }) })).json() as any;
    const A = sock(ca), B = sock(cb);
    await Promise.all([A.open, B.open]);
    A.send({ t: 'join', code }); await A.wait((m) => m.t === 'room');
    B.send({ t: 'join', code }); await A.wait((m) => m.t === 'room' && m.room.members.length === 2);
    B.send({ t: 'ready', v: true }); await A.wait((m) => m.t === 'room' && m.room.members.every((x: any) => x.ready || x.me));
    A.send({ t: 'start' }); await A.wait((m) => m.t === 'state');
    for (let k = 0; k < MOVES; k++) {
      // Every other cell, so nobody makes five in a row and ends the game early.
      for (const [P, Q, i] of [[A, B, 13 + 2 * k], [B, A, 13 * 9 + 2 * k]] as const) {
        const s = performance.now();
        const got = Q.wait((m) => m.t === 'state' && m.view.cells[i] !== -1);
        P.send({ t: 'act', action: { type: 'place', i } });
        await got;
        latencies.push(performance.now() - s);
      }
    }
    A.ws.close(); B.ws.close();
  } catch (e) { errors++; console.error('room', r, String(e)); }
}));
const total = performance.now() - t0;
latencies.sort((a, b) => a - b);
const q = (p: number) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] * 10) / 10;
console.log(JSON.stringify({
  rooms: ROOMS, players: ROOMS * 2, movesMeasured: latencies.length, errors,
  latencyMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1) },
  wallSeconds: Math.round(total / 100) / 10, rssMbDelta: Math.round((process.memoryUsage().rss - mem0) / 1048576),
}));
await app.close();
process.exit(errors ? 1 : 0);
