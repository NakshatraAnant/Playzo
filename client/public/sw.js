/* PLAYZO service worker (production builds only).
 * - Pages are ALWAYS fetched from the server. If the server can't be reached we show a clear
 *   "can't reach PLAYZO" page, never an old cached copy of the app (v1 did, which looked like a
 *   broken outdated site whenever the local server was stopped).
 * - Hashed build assets (/assets/*), fonts and icons: cache-first (immutable once built).
 * - API and WebSocket traffic is never cached. */
const VERSION = 'playzo-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  // Drop every older cache, including v1's cached page shell.
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Can't reach PLAYZO</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0718;color:#f4f1ff;font-family:system-ui,sans-serif;text-align:center;padding:24px}main{max-width:460px}b{color:#ffb020;font-size:30px;letter-spacing:.06em}p{color:#cfc8ea;line-height:1.55}code{background:#1d1438;padding:3px 8px;border-radius:6px;color:#ffe7b0}button{margin-top:18px;padding:12px 22px;border-radius:12px;border:0;background:linear-gradient(135deg,#ff3d8b,#ff8a00);color:#fff;font-weight:800;font-size:16px;cursor:pointer}</style></head>
<body><main><b>PLAYZO</b><h1 style="font-size:20px">Can't reach the PLAYZO server</h1>
<p>If you're offline, reconnect and try again.</p>
<p id="local" hidden>Running PLAYZO on this computer? The server isn't running. Double-click <code>start-playzo.cmd</code> in the PLAYZO folder (or run <code>npm run serve:local</code>), then try again.</p>
<button onclick="location.reload()">Try again</button></main>
<script>if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname))document.getElementById('local').hidden=false;setInterval(function(){fetch('/api/health',{cache:'no-store'}).then(function(r){if(r.ok)location.reload()}).catch(function(){})},3000)</script></body></html>`;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => new Response(OFFLINE_HTML, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })));
    return;
  }
  if (url.pathname.startsWith('/assets/') || /\.(woff2?|svg|png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
