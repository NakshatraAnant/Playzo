import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config';
import { db } from './db';
import { HttpError } from './http';
import { authRoutes } from './auth';
import { sessionRoutes, reapSessions } from './sessions';
import { socialRoutes } from './social';
import { roomRoutes } from './rooms';
import { contentRoutes } from './content';
import { shopRoutes } from './shop';
import { adminRoutes } from './admin';
import { notifyRoutes } from './notify';
import { rewardRoutes } from './rewards';
import { retryDueEmails, emailStatus } from './email';
import { startAutoBackups, latestBackup } from './backup';
import { seoRoutes } from './seo';
import { seed } from './seed';
import { ENGINES } from './games/registry';
import { dictionarySize } from './data/words';

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  db();
  seed();
  const app = Fastify({ logger: opts.logger ? { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] } : false, bodyLimit: 2 * 1024 * 1024, trustProxy: false });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  // Security headers on every response.
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (config.production) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    return payload;
  });

  // CSRF defence: state-changing API calls must carry a custom header (forces a CORS preflight cross-site; no CORS is enabled).
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-playzo'] !== '1') {
      return reply.code(403).send({ error: 'Missing request header', code: 'CSRF' });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, code: err.code, ...err.extra });
    if ((err as any).validation || (err as any).statusCode === 400) return reply.code(400).send({ error: 'Bad request', code: 'BAD_REQUEST' });
    if ((err as any).statusCode === 413) return reply.code(413).send({ error: 'Request too large', code: 'TOO_LARGE' });
    req.log?.error?.(err);
    console.error('[api] unhandled', err);
    return reply.code(500).send({ error: 'Something went wrong on our side', code: 'INTERNAL' });
  });

  app.get('/api/health', async () => ({
    ok: true, service: 'playzo-api', time: new Date().toISOString(),
    db: !!db().get('SELECT 1 AS ok'), migrations: db().all('SELECT name FROM schema_migrations').map((r: any) => r.name),
    engines: Object.keys(ENGINES).length, dictionary: dictionarySize(), devMode: config.devMode, production: config.production,
    uptimeSec: Math.round(process.uptime()), lastBackup: latestBackup() ? new Date(latestBackup()!.at).toISOString() : null, email: emailStatus().provider, emailConfigured: emailStatus().configured, loungeEnabled: config.loungeEnabled,
  }));

  await app.register(authRoutes);
  await app.register(sessionRoutes);
  await app.register(socialRoutes);
  await app.register(roomRoutes);
  await app.register(contentRoutes);
  await app.register(shopRoutes);
  await app.register(adminRoutes);
  await app.register(notifyRoutes);
  await app.register(rewardRoutes);

  app.all('/api/*', async (_req, reply) => reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' }));

  // Production: serve the built SPA + prerendered SEO pages.
  const dist = path.resolve('dist');
  // Production, or the optimised local mode (`npm run local`), serves the built app from this process.
  const serveDist = (config.production || config.serveDist) && fs.existsSync(path.join(dist, 'index.html'));
  // Built sites ship static sitemap.xml/robots.txt (scripts/prerender-seo.ts); otherwise serve them dynamically.
  if (!serveDist) await app.register(seoRoutes);
  if (serveDist) {
    await app.register(fastifyStatic, {
      root: dist, wildcard: false, preCompressed: true, cacheControl: false,
      setHeaders: (res, file) => {
        // Hashed build assets never change: cache for a year. Pages and the service worker: always revalidate.
        res.header('Cache-Control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const urlPath = req.url.split('?')[0];
      // Missing files are real 404s; only page routes fall back to the app shell.
      if (urlPath.startsWith('/assets/') || /\.[a-z0-9]{2,5}$/i.test(urlPath)) return reply.code(404).type('text/plain').send('Not found');
      const p = path.join(dist, urlPath, 'index.html');
      const file = p.startsWith(dist) && fs.existsSync(p) ? p : path.join(dist, 'index.html');
      return reply.header('Cache-Control', 'no-cache').type('text/html').send(fs.readFileSync(file));
    });
  }

  setInterval(() => { try { reapSessions(); } catch (e) { console.error('[reaper]', e); } }, 10 * 60_000).unref();
  setInterval(() => { try { retryDueEmails(); } catch (e) { console.error('[email]', e); } }, 30_000).unref();
  startAutoBackups();
  return app;
}
