import type { FastifyInstance } from 'fastify';
import { FAMILY } from '../shared/catalogue';
import { config } from './config';

export const slug = (id: string) => id;

export function sitemapXml(base = config.publicUrl): string {
  const urls = ['/', '/games', '/daily', '/leaderboards', '/legal/fair-play', '/legal/privacy', '/legal/terms', ...FAMILY.map((g) => `/games/${slug(g.id)}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u}</loc><changefreq>weekly</changefreq></url>`).join('\n')}\n</urlset>\n`;
}
/** The Lounge (21+) is excluded from crawling and from the sitemap. */
export const robotsTxt = (base = config.publicUrl) => `User-agent: *\nAllow: /\nDisallow: /lounge\nDisallow: /admin\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`;

export async function seoRoutes(app: FastifyInstance) {
  app.get('/sitemap.xml', async (_req, reply) => reply.type('application/xml').send(sitemapXml()));
  app.get('/robots.txt', async (_req, reply) => reply.type('text/plain').send(robotsTxt()));
}
