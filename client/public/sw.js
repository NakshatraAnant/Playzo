/* PLAYZO service worker (production builds only).
 * - Hashed build assets (/assets/*), fonts and icons: cache-first (they never change once built).
 * - Page navigations: network-first, falling back to the cached app shell, then to an offline page.
 * - API and WebSocket traffic is never cached: scores, rewards and sessions always hit the server. */
const VERSION = 'playzo-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · PLAYZO</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0718;color:#f4f1ff;font-family:system-ui,sans-serif;text-align:center;padding:24px}b{color:#ffb020;font-size:28px;letter-spacing:.06em}button{margin-top:18px;padding:12px 20px;border-radius:12px;border:0;background:#7c4dff;color:#fff;font-weight:800;font-size:16px}</style></head>
<body><div><b>PLAYZO</b><p>You're offline. Games are verified by the server, so PLAYZO needs a connection to play.</p><button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && url.pathname === '/') caches.open(VERSION).then((c) => c.put('/', res.clone()));
        return res;
      }).catch(async () => (await caches.match(req)) || (await caches.match('/')) || new Response(OFFLINE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || /\.(woff2?|svg|png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
