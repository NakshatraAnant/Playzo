// Waits until the PLAYZO API answers /api/health, so the web dev server never proxies to a
// server that is still starting (which showed up as 502 errors on first load).
const port = Number(process.env.PLAYZO_API_PORT ?? 5758);
const deadline = Date.now() + 90_000;
for (;;) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) { console.log(`[wait-api] API ready on :${port}`); process.exit(0); }
  } catch { /* not up yet */ }
  if (Date.now() > deadline) { console.error('[wait-api] API did not start within 90 s'); process.exit(1); }
  await new Promise((r) => setTimeout(r, 400));
}
