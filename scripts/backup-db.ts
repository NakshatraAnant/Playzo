/** Manual backup: `npm run backup:db` (same mechanism as the automatic daily backup in server/backup.ts). */
import { backupNow } from '../server/backup';
console.log(`[backup] wrote ${backupNow()}`);
