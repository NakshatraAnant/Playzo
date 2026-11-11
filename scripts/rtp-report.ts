import { SLOT_CONFIGS } from '../server/games/lounge/slots';
import { exactRtp } from '../server/games/lounge/slotsCore';
for (const [id, cfg] of Object.entries(SLOT_CONFIGS)) {
  const r = exactRtp(cfg);
  console.log(id.padEnd(18), (r.total * 100).toFixed(3), 'base', (r.base * 100).toFixed(2), 'scat', (r.scatter * 100).toFixed(2), 'jp', (r.jackpot * 100).toFixed(2));
}
