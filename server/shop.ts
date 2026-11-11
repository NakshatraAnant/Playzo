import type { FastifyInstance } from 'fastify';
import { db, nowIso, dayKey } from './db';
import { HttpError, requireUser, currentUser, audit, User } from './http';
import { COSMETICS, COSMETIC_BY_ID, PLANS } from '../shared/cosmetics';
import { post, balance } from './economy';
import { socialPolicy } from './access';
import { config } from './config';
import { newId } from './secureRng';
import { track } from './analytics';
import { publicMe } from './auth';

const isPlus = (u: User) => !!(u.premium_until && (u.premium_until as string) > nowIso());

export async function shopRoutes(app: FastifyInstance) {
  app.get('/api/shop', async (req) => {
    const u = currentUser(req);
    const owned = u ? new Set(db().all<{ item_id: string }>('SELECT item_id FROM inventory WHERE user_id = ?', u.id).map((r) => r.item_id)) : new Set<string>();
    return {
      items: COSMETICS.map((c) => ({ ...c, owned: c.priceZo === 0 || owned.has(c.id) || (!!c.plusOnly && !!u && isPlus(u)), equipped: !!u && (u.avatar === c.id || u.frame === c.id || u.theme === c.id) })),
      plans: PLANS, payments: { enabled: false, devMock: config.devMode, note: 'Real payments are disabled until legal and commercial approval. Dev mode uses a clearly labelled test checkout.' },
      zo: u ? balance(u.id, 'ZO') : 0,
    };
  });

  app.post('/api/shop/buy', async (req) => {
    const u = requireUser(req);
    const item = COSMETIC_BY_ID[String((req.body as any)?.itemId)];
    if (!item || item.priceZo === null) throw new HttpError(400, 'This item cannot be bought with ZO', 'VALIDATION');
    if (db().get('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?', u.id, item.id) || item.priceZo === 0) return { ok: true, owned: true };
    db().tx(() => {
      post(u.id, 'ZO', -item.priceZo!, 'purchase', `cosmetic:${item.id}`, `buy:${u.id}:${item.id}`);
      db().run('INSERT INTO inventory (user_id, item_id, source) VALUES (?, ?, ?)', u.id, item.id, 'zo');
    });
    track('cosmetic_bought', u.id, { item: item.id });
    return { ok: true, zo: balance(u.id, 'ZO') };
  });

  app.post('/api/shop/equip', async (req) => {
    const u = requireUser(req);
    const item = COSMETIC_BY_ID[String((req.body as any)?.itemId)];
    if (!item) throw new HttpError(404, 'Item not found', 'NOT_FOUND');
    const owns = item.priceZo === 0 || (item.plusOnly ? isPlus(u) : !!db().get('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?', u.id, item.id));
    if (!owns) throw new HttpError(403, 'You do not own this item', 'FORBIDDEN');
    const col = item.kind === 'avatar' ? 'avatar' : item.kind === 'frame' ? 'frame' : 'theme';
    db().run(`UPDATE users SET ${col} = ? WHERE id = ?`, item.id, u.id);
    return { user: publicMe(db().get<User>('SELECT * FROM users WHERE id = ?', u.id)!) };
  });

  app.post('/api/shop/unequip', async (req) => {
    const u = requireUser(req);
    const kind = (req.body as any)?.kind;
    if (kind === 'frame') db().run('UPDATE users SET frame = NULL WHERE id = ?', u.id);
    if (kind === 'theme') db().run('UPDATE users SET theme = NULL WHERE id = ?', u.id);
    return { user: publicMe(db().get<User>('SELECT * FROM users WHERE id = ?', u.id)!) };
  });

  /** TEST-ONLY checkout. No money moves. Refused outside dev mode. Adults only. */
  app.post('/api/shop/checkout', async (req) => {
    const u = requireUser(req);
    const plan = PLANS.find((p) => p.id === (req.body as any)?.planId);
    if (!plan) throw new HttpError(404, 'Plan not found', 'NOT_FOUND');
    if (!socialPolicy(u).canPurchase) throw new HttpError(403, 'Purchases are only available to adult account holders', 'FORBIDDEN');
    if (!config.devMode) throw new HttpError(503, 'Payments are not enabled on this server', 'PAYMENTS_DISABLED');
    if ((req.body as any)?.acknowledgeTest !== true) throw new HttpError(400, 'Confirm that you understand this is a test checkout', 'VALIDATION');
    const id = newId('pay_');
    const from = isPlus(u) ? new Date(u.premium_until as string) : new Date();
    const until = new Date(from.getTime() + plan.days * 86400_000).toISOString();
    db().tx(() => {
      db().run('INSERT INTO purchases (id, user_id, sku, amount_inr, provider, status) VALUES (?, ?, ?, ?, ?, ?)', id, u.id, plan.id, plan.priceInr, 'dev-mock', 'test-completed');
      db().run('UPDATE users SET premium_until = ? WHERE id = ?', until, u.id);
    });
    audit(u.id, 'shop.dev_mock_checkout', id, { plan: plan.id });
    track('membership_test_purchase', u.id, { plan: plan.id });
    return { ok: true, test: true, purchaseId: id, premiumUntil: until };
  });

  app.post('/api/shop/cancel', async (req) => {
    const u = requireUser(req);
    db().run('UPDATE users SET premium_until = ? WHERE id = ?', nowIso(), u.id);
    audit(u.id, 'shop.membership_cancel', u.id);
    return { ok: true };
  });

  /** Contextual house/sponsor placements with frequency caps. No behavioural targeting. */
  app.get('/api/ads', async (req) => {
    const u = currentUser(req);
    const slot = String((req.query as any).slot ?? '');
    if (u && isPlus(u)) return { ad: null };
    const audienceAdult = u?.age_band === 'adult';
    const rows = db().all<any>("SELECT * FROM ad_placements WHERE slot = ? AND enabled = 1 AND (env = 'family_teen_adult' OR (env = 'adult' AND ? = 1))", slot, audienceAdult ? 1 : 0);
    for (const p of rows) {
      const key = u?.id ?? `anon:${req.ip}`;
      const seen = db().get<{ count: number }>('SELECT count FROM ad_impressions WHERE user_id = ? AND placement_id = ? AND day = ?', key, p.id, dayKey())?.count ?? 0;
      if (seen >= p.frequency_cap_per_day) continue;
      db().run('INSERT INTO ad_impressions (user_id, placement_id, day, count) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, placement_id, day) DO UPDATE SET count = count + 1', key, p.id, dayKey());
      db().run('UPDATE ad_placements SET impressions = impressions + 1 WHERE id = ?', p.id);
      return { ad: { id: p.id, label: p.label, sponsor: p.sponsor, slot: p.slot } };
    }
    return { ad: null };
  });
  app.post('/api/ads/:id/click', async (req) => {
    db().run('UPDATE ad_placements SET clicks = clicks + 1 WHERE id = ?', (req.params as any).id);
    return { ok: true };
  });
}
