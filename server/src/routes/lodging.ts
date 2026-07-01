import { Router } from 'express';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { lodgingCreate, lodgingUpdate, normalizeGmapUrl } from '@travel-plan/shared';
import { asyncHandler, notFound } from '../services/http';
import { requireOwner, tripIdFromParam } from '../middleware/requireOwner';
import { tripIdOfLodging } from '../services/access';
import { mapLodging } from '../services/mappers';

export function lodgingRouter(): Router {
  const r = Router();

  // GET /api/trips/:tripId/lodging
  r.get(
    '/trips/:tripId/lodging',
    requireOwner(tripIdFromParam('tripId')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const rows = await db('lodging').where({ trip_id: req.params.tripId }).orderBy('name');
      res.json(rows.map(mapLodging));
    }),
  );

  // POST /api/trips/:tripId/lodging
  r.post(
    '/trips/:tripId/lodging',
    requireOwner(tripIdFromParam('tripId')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const input = lodgingCreate.parse(req.body);
      const id = randomUUID();
      const ts = new Date().toISOString();
      await db('lodging').insert({
        id,
        trip_id: req.params.tripId,
        name: input.name,
        address: input.address,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        gmap_url: normalizeGmapUrl(input.gmap_url, input.address || input.name),
        check_in: input.check_in ?? null,
        check_out: input.check_out ?? null,
        cost: input.cost,
        notes: input.notes,
        is_home_base: input.is_home_base,
        created_at: ts,
        updated_at: ts,
      });
      const row = await db('lodging').where({ id }).first();
      res.status(201).json(mapLodging(row));
    }),
  );

  // PATCH /api/lodging/:id
  r.patch(
    '/lodging/:id',
    requireOwner((req, db) => tripIdOfLodging(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const patch = lodgingUpdate.parse(req.body);
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of [
        'name', 'address', 'lat', 'lng', 'gmap_url', 'check_in', 'check_out', 'cost', 'notes', 'is_home_base',
      ] as const) {
        if (patch[k] !== undefined) upd[k] = patch[k];
      }
      if (patch.gmap_url) {
        let query = patch.address || patch.name || '';
        if (!query) {
          const existing = await db('lodging').where({ id: req.params.id }).first();
          query = existing?.address || existing?.name || '';
        }
        upd.gmap_url = normalizeGmapUrl(patch.gmap_url, query);
      }
      await db('lodging').where({ id: req.params.id }).update(upd);
      const row = await db('lodging').where({ id: req.params.id }).first();
      if (!row) throw notFound();
      res.json(mapLodging(row));
    }),
  );

  // DELETE /api/lodging/:id
  r.delete(
    '/lodging/:id',
    requireOwner((req, db) => tripIdOfLodging(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      await db('lodging').where({ id: req.params.id }).del();
      res.json({ ok: true });
    }),
  );

  return r;
}
