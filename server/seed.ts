/**
 * Seeds configuration data only: ad placements (disabled sponsor slots + house promos) and an
 * optional bootstrap admin from env. It never creates fake players, scores or activity.
 */
import { db } from './db';
import { config } from './config';
import { hashPasswordSync } from './auth';
import { newId } from './secureRng';

export function seed() {
  const placements = [
    { id: 'house-challenge', slot: 'home_banner', env: 'family_teen_adult', sponsor: null, label: 'Challenge a friend to any game - send a link!', enabled: 1 },
    { id: 'house-daily', slot: 'results_native', env: 'family_teen_adult', sponsor: null, label: 'New Daily Puzzle every day at midnight UTC', enabled: 1 },
    { id: 'sponsor-family', slot: 'home_banner', env: 'family_teen_adult', sponsor: 'Unsold', label: 'Sponsored placement (no campaign booked)', enabled: 0 },
    { id: 'sponsor-adult', slot: 'results_native', env: 'adult', sponsor: 'Unsold', label: 'Adult-audience sponsored placement (no campaign booked)', enabled: 0 },
  ];
  for (const p of placements) {
    db().run('INSERT OR IGNORE INTO ad_placements (id, slot, env, sponsor, label, enabled) VALUES (?, ?, ?, ?, ?, ?)', p.id, p.slot, p.env, p.sponsor, p.label, p.enabled);
  }
  if (config.adminEmail && config.adminPassword) {
    const ex = db().get<{ id: string }>('SELECT id FROM users WHERE email = ?', config.adminEmail.toLowerCase());
    if (!ex) {
      const id = newId('u_');
      db().run("INSERT INTO users (id, email, username, display_name, password_hash, dob, age_band, role, email_verified_at, avatar) VALUES (?, ?, 'playzo_admin', 'PLAYZO Admin', ?, '1990-01-01', 'adult', 'admin', ?, 'orb-12')",
        id, config.adminEmail.toLowerCase(), hashPasswordSync(config.adminPassword), new Date().toISOString());
      console.log(`[seed] created admin ${config.adminEmail}`);
    }
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server/seed.ts')) {
  seed();
  console.log('[seed] done');
}
