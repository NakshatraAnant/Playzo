/** Admin-controlled availability of missions and shop cosmetics (definitions live in code; availability in the DB). */
import { db } from './db';

export type ContentKind = 'mission' | 'cosmetic';
export function disabledSet(kind: ContentKind): Set<string> {
  return new Set(db().all<{ item_id: string }>('SELECT item_id FROM content_flags WHERE kind = ? AND enabled = 0', kind).map((r) => r.item_id));
}
export const isEnabled = (kind: ContentKind, id: string) => !db().get('SELECT 1 FROM content_flags WHERE kind = ? AND item_id = ? AND enabled = 0', kind, id);
export function setEnabled(kind: ContentKind, id: string, enabled: boolean, by: string) {
  db().run(
    `INSERT INTO content_flags (kind, item_id, enabled, updated_by, updated_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(kind, item_id) DO UPDATE SET enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    kind, id, enabled ? 1 : 0, by,
  );
}
