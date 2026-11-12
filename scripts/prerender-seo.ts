/**
 * Post-build SEO: writes a static HTML shell per public game page (unique title, description,
 * canonical URL, Open Graph/Twitter tags, JSON-LD VideoGame data and an SVG share image),
 * plus sitemap.xml and robots.txt. The Lounge is never prerendered or listed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FAMILY } from '../shared/catalogue';
import { sitemapXml, robotsTxt } from '../server/seo';

const base = process.env.PLAYZO_PUBLIC_URL ?? 'http://localhost:5757';
const dist = path.resolve('dist');
const shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

fs.mkdirSync(path.join(dist, 'og'), { recursive: true });
const og = (title: string, sub: string, a: string, b: string, accent: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="z" x1="0" x2="1"><stop offset="0" stop-color="#ff3d8b"/><stop offset=".5" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ffb02e"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="1000" cy="160" r="260" fill="${accent}" opacity=".18"/><text x="80" y="140" font-family="Arial Black,Arial" font-size="56" font-weight="900" fill="#fff">PLAYZ<tspan fill="url(#z)">O</tspan></text><text x="80" y="330" font-family="Arial Black,Arial" font-size="84" font-weight="900" fill="#fff">${esc(title)}</text><text x="80" y="410" font-family="Arial" font-size="36" fill="#e8e0ff">${esc(sub)}</text><text x="80" y="560" font-family="Arial" font-size="30" font-weight="700" fill="${accent}">Aaja PLAYZO pe khelte hain!</text></svg>`;
fs.writeFileSync(path.join(dist, 'og', 'playzo.svg'), og('25 original games', 'Puzzles, words, strategy and party games', '#1c1140', '#07040f', '#ff3d8b'));

function page(url: string, title: string, desc: string, image: string, jsonld?: object) {
  let h = shell.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`).replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}" />`);
  h = h.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`).replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(desc)}" />`).replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${base}${image}" />`);
  h = h.replace('</head>', `<link rel="canonical" href="${base}${url}" /><meta property="og:url" content="${base}${url}" /><meta property="og:type" content="website" />${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}</head>`);
  const file = path.join(dist, url, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, h);
}

for (const g of FAMILY) {
  fs.writeFileSync(path.join(dist, 'og', `${g.id}.svg`), og(g.title, g.tagline.slice(0, 60), g.theme.bg[0], g.theme.bg[1], g.theme.accent));
  page(`/games/${g.id}`, `${g.title}: play free on PLAYZO`, `${g.tagline} ${g.description}`.slice(0, 300), `/og/${g.id}.svg`, {
    '@context': 'https://schema.org', '@type': 'VideoGame', name: g.title, description: g.description, genre: g.category, url: `${base}/games/${g.id}`,
    gamePlatform: 'Web browser', applicationCategory: 'Game', operatingSystem: 'Any', contentRating: g.age, publisher: { '@type': 'Organization', name: 'PLAYZO' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' }, playMode: g.formats.some((f) => ['versus', 'teams', 'group', 'race'].includes(f)) ? 'MultiPlayer' : 'SinglePlayer',
  });
}
page('/games', 'Discover 25 original games · PLAYZO', 'Browse PLAYZO puzzles, word games, strategy duels and party games. Free to play, no real-money anything.', '/og/playzo.svg');
page('/daily', 'Daily Puzzle · PLAYZO', 'One shared puzzle for everyone, every day. Compare your score on the daily board.', '/og/playzo.svg');
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemapXml(base));
fs.writeFileSync(path.join(dist, 'robots.txt'), robotsTxt(base));
console.log(`[seo] prerendered ${FAMILY.length + 2} pages, ${FAMILY.length + 1} OG images, sitemap.xml, robots.txt`);

/* Pre-compress text assets (Brotli + gzip) so the server can send them without runtime CPU cost. */
import zlib from 'node:zlib';
let packed = 0;
const walk = (d: string) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(js|css|html|svg|xml|txt|webmanifest|json)$/.test(f)) continue;
    const buf = fs.readFileSync(p);
    if (buf.length < 1024) continue;
    fs.writeFileSync(`${p}.br`, zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
    fs.writeFileSync(`${p}.gz`, zlib.gzipSync(buf, { level: 9 }));
    packed++;
  }
};
walk(dist);
console.log(`[seo] pre-compressed ${packed} assets (br + gz)`);
