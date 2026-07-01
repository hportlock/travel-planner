import type { Knex } from 'knex';

/**
 * Rewrite stored `gmap_url` values from the undocumented
 * `https://www.google.com/maps/place/?q=place_id:<ID>` form (resolves on
 * desktop web but not in the mobile Google Maps app) to the documented Maps
 * URLs API form:
 *   https://www.google.com/maps/search/?api=1&query=<encoded>&query_place_id=<ID>
 * using the row's name (events) or address/name (lodging) as the required
 * `query` parameter.
 *
 * The rewrite logic mirrors shared/src/maps.ts normalizeGmapUrl(); it is
 * inlined here because migrations must stay self-contained (dev runs them via
 * ts-node without building shared, and migrations are immutable snapshots).
 */

const BROKEN_PLACE_ID_URL = /^https:\/\/(?:www\.)?google\.com\/maps\/place\/\?q=place_id:([A-Za-z0-9_-]+)\/?$/;

function rewrite(url: string, fallbackQuery: string): string | null {
  const m = url.match(BROKEN_PLACE_ID_URL);
  const query = fallbackQuery.trim();
  if (!m || !query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${m[1]}`;
}

export async function up(knex: Knex): Promise<void> {
  const ts = new Date().toISOString();

  const events = await knex('events')
    .select('id', 'name', 'gmap_url')
    .where('gmap_url', 'like', '%/maps/place/?q=place_id:%');
  for (const row of events) {
    const fixed = rewrite(row.gmap_url, row.name ?? '');
    if (fixed) await knex('events').where({ id: row.id }).update({ gmap_url: fixed, updated_at: ts });
  }

  const lodging = await knex('lodging')
    .select('id', 'name', 'address', 'gmap_url')
    .where('gmap_url', 'like', '%/maps/place/?q=place_id:%');
  for (const row of lodging) {
    const fixed = rewrite(row.gmap_url, row.address || row.name || '');
    if (fixed) await knex('lodging').where({ id: row.id }).update({ gmap_url: fixed, updated_at: ts });
  }
}

/**
 * Best-effort reverse: any URL carrying `query_place_id` goes back to the old
 * place_id form. Pre-existing correct seed URLs use `query=` only, so they
 * are untouched; rows written after this migration that happen to carry
 * `query_place_id` are also reverted, which is acceptable rollback semantics.
 */
export async function down(knex: Knex): Promise<void> {
  const ts = new Date().toISOString();
  const PLACE_ID_PARAM = /[?&]query_place_id=([A-Za-z0-9_-]+)/;

  for (const table of ['events', 'lodging']) {
    const rows = await knex(table)
      .select('id', 'gmap_url')
      .where('gmap_url', 'like', '%/maps/search/?api=1%query_place_id=%');
    for (const row of rows) {
      const m = row.gmap_url.match(PLACE_ID_PARAM);
      if (m) {
        await knex(table)
          .where({ id: row.id })
          .update({ gmap_url: `https://www.google.com/maps/place/?q=place_id:${m[1]}`, updated_at: ts });
      }
    }
  }
}
