import { Router } from 'express';
import type { Knex } from 'knex';
import { randomUUID, randomBytes } from 'crypto';
import { tripCreate, tripUpdate, shareCreate } from '@travel-plan/shared';
import { asyncHandler, notFound } from '../services/http';
import { requireUser } from '../middleware/requireUser';
import { requireOwner, tripIdFromParam } from '../middleware/requireOwner';
import { buildTripDetail } from '../services/tripDetail';
import { serializeJson } from '../db';
import { mapTrip } from '../services/mappers';

export function tripsRouter(): Router {
  const r = Router();

  // GET /api/trips — list own.
  r.get(
    '/',
    requireUser,
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const rows = await db('trips').where({ owner_id: req.auth!.userId }).orderBy('created_at', 'desc');
      res.json(rows.map(mapTrip));
    }),
  );

  // POST /api/trips — create + auto-create the single default active itinerary.
  r.post(
    '/',
    requireUser,
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const input = tripCreate.parse(req.body);
      const id = randomUUID();
      const ts = new Date().toISOString();

      await db.transaction(async (trx) => {
        await trx('trips').insert({
          id,
          owner_id: req.auth!.userId,
          title: input.title,
          subtitle: input.subtitle,
          destination: input.destination,
          timezone: input.timezone,
          start_date: input.start_date ?? null,
          end_date: input.end_date ?? null,
          party: input.party,
          regions: serializeJson(input.regions),
          created_at: ts,
          updated_at: ts,
        });
        await trx('itineraries').insert({
          id: randomUUID(),
          trip_id: id,
          slug: 'main',
          name: 'Itinerary',
          vibe: '',
          position: 0,
          is_active: true,
          created_at: ts,
          updated_at: ts,
        });
      });

      const detail = await buildTripDetail(db, id);
      res.status(201).json(detail);
    }),
  );

  // GET /api/trips/:id — owner full detail.
  r.get(
    '/:id',
    requireOwner(tripIdFromParam('id')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const detail = await buildTripDetail(db, req.params.id);
      if (!detail) throw notFound('Trip not found');
      res.json(detail);
    }),
  );

  // PATCH /api/trips/:id
  r.patch(
    '/:id',
    requireOwner(tripIdFromParam('id')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const patch = tripUpdate.parse(req.body);
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ['title', 'subtitle', 'destination', 'timezone', 'start_date', 'end_date', 'party'] as const) {
        if (patch[k] !== undefined) upd[k] = patch[k];
      }
      if (patch.regions !== undefined) upd.regions = serializeJson(patch.regions);
      await db('trips').where({ id: req.params.id }).update(upd);
      const detail = await buildTripDetail(db, req.params.id);
      res.json(detail);
    }),
  );

  // DELETE /api/trips/:id
  r.delete(
    '/:id',
    requireOwner(tripIdFromParam('id')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      await db('trips').where({ id: req.params.id }).del();
      res.json({ ok: true });
    }),
  );

  // POST /api/trips/:id/share — mint a read-only viewer token.
  r.post(
    '/:id/share',
    requireOwner(tripIdFromParam('id')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const { label } = shareCreate.parse(req.body ?? {});
      const token = randomBytes(32).toString('base64url');
      const ts = new Date().toISOString();
      await db('trip_access').insert({
        id: randomUUID(),
        trip_id: req.params.id,
        role: 'viewer',
        token,
        label,
        created_at: ts,
        updated_at: ts,
      });
      const base = process.env.APP_BASE_URL || 'http://localhost:5173';
      res.status(201).json({ token, url: `${base}/t/${token}`, label });
    }),
  );

  return r;
}
