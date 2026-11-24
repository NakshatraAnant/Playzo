/** Dev: wait until the API answers /api/health before starting Vite, so the first page load never 502s. */
import http from 'node:http';

const port = Number(process.env.PLAYZO_API_PORT ?? 5758);
// Plain http with no keep-alive: exiting right after fetch() can abort Node on Windows (libuv assertion).
const ok = () => new Promise((res) => {
  const req = http.get({ host: '127.0.0.1', port, path: '/api/health', agent: false, timeout: 2000 }, (r) => { r.resume(); r.on('end', () => res(r.statusCode === 200)); });
  req.on('error', () => res(false));
  req.on('timeout', () => { req.destroy(); res(false); });
});
let ready = false;
for (let i = 0; i < 240; i++) {
  if ((ready = await ok())) { console.log(`[wait-api] API ready on :${port}`); break; }
  await new Promise((r) => setTimeout(r, 250));
}
if (!ready) { console.error('[wait-api] API did not start in time'); process.exitCode = 1; }
