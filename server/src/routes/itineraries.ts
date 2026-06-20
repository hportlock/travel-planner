import { Router } from 'express';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import {
  itineraryCreate,
  itineraryUpdate,
  dayCreate,
  dayUpdate,
  dayItemCreate,
  dayItemUpdate,
  reorderBody,
} from '@travel-plan/shared';
import { asyncHandler, notFound, badRequest } from '../services/http';
import { requireOwner, tripIdFromParam } from '../middleware/requireOwner';
import { tripIdOfItinerary, tripIdOfDay, tripIdOfDayItem } from '../services/access';
import { mapItinerary, mapDay, mapDayItem } from '../services/mappers';

/** Ensure exactly one itinerary is active for a trip, preferring `keepId`. */
async function activateOnly(trx: Knex, tripId: string, keepId: string): Promise<void> {
  await trx('itineraries').where({ trip_id: tripId }).update({ is_active: false });
  await trx('itineraries').where({ id: keepId }).update({ is_active: true });
}

export function itinerariesRouter(): Router {
  const r = Router();

  // GET /api/trips/:tripId/itineraries
  r.get(
    '/trips/:tripId/itineraries',
    requireOwner(tripIdFromParam('tripId')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const rows = await db('itineraries').where({ trip_id: req.params.tripId }).orderBy('position');
      res.json(rows.map(mapItinerary));
    }),
  );

  // POST /api/trips/:tripId/itineraries
  r.post(
    '/trips/:tripId/itineraries',
    requireOwner(tripIdFromParam('tripId')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const tripId = req.params.tripId;
      const input = itineraryCreate.parse(req.body);
      const dup = await db('itineraries').where({ trip_id: tripId, slug: input.slug }).first();
      if (dup) throw badRequest('An itinerary with that slug already exists');
      const id = randomUUID();
      const ts = new Date().toISOString();
      let position = input.position;
      if (position === undefined) {
        const max = await db('itineraries').where({ trip_id: tripId }).max('position as m').first();
        position = (max?.m ?? -1) + 1;
      }
      await db.transaction(async (trx) => {
        await trx('itineraries').insert({
          id,
          trip_id: tripId,
          slug: input.slug,
          name: input.name,
          vibe: input.vibe,
          position,
          is_active: !!input.is_active,
          created_at: ts,
          updated_at: ts,
        });
        if (input.is_active) await activateOnly(trx, tripId, id);
      });
      const row = await db('itineraries').where({ id }).first();
      res.status(201).json(mapItinerary(row));
    }),
  );

  // PATCH /api/itineraries/:id
  r.patch(
    '/itineraries/:id',
    requireOwner((req, db) => tripIdOfItinerary(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const patch = itineraryUpdate.parse(req.body);
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ['slug', 'name', 'vibe', 'position'] as const) {
        if (patch[k] !== undefined) upd[k] = patch[k];
      }
      await db('itineraries').where({ id: req.params.id }).update(upd);
      // is_active changes go through /activate to preserve the invariant.
      const row = await db('itineraries').where({ id: req.params.id }).first();
      if (!row) throw notFound();
      res.json(mapItinerary(row));
    }),
  );

  // POST /api/itineraries/:id/activate
  r.post(
    '/itineraries/:id/activate',
    requireOwner((req, db) => tripIdOfItinerary(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const it = await db('itineraries').where({ id: req.params.id }).first();
      if (!it) throw notFound();
      await db.transaction((trx) => activateOnly(trx, it.trip_id, it.id));
      const row = await db('itineraries').where({ id: req.params.id }).first();
      res.json(mapItinerary(row));
    }),
  );

  // POST /api/itineraries/:id/duplicate
  r.post(
    '/itineraries/:id/duplicate',
    requireOwner((req, db) => tripIdOfItinerary(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const src = await db('itineraries').where({ id: req.params.id }).first();
      if (!src) throw notFound();
      const ts = new Date().toISOString();
      const newId = randomUUID();
      const newName = (req.body?.name as string) || `${src.name} (copy)`;
      let newSlug = (req.body?.slug as string) || `${src.slug}-copy`;
      // ensure slug uniqueness
      let n = 1;
      // eslint-disable-next-line no-await-in-loop
      while (await db('itineraries').where({ trip_id: src.trip_id, slug: newSlug }).first()) {
        newSlug = `${src.slug}-copy-${++n}`;
      }
      const maxPos = await db('itineraries').where({ trip_id: src.trip_id }).max('position as m').first();
      await db.transaction(async (trx) => {
        await trx('itineraries').insert({
          id: newId,
          trip_id: src.trip_id,
          slug: newSlug,
          name: newName,
          vibe: src.vibe,
          position: (maxPos?.m ?? -1) + 1,
          is_active: false,
          created_at: ts,
          updated_at: ts,
        });
        const days = await trx('days').where({ itinerary_id: src.id }).orderBy('position');
        for (const d of days) {
          const newDayId = randomUUID();
          await trx('days').insert({
            ...d,
            id: newDayId,
            itinerary_id: newId,
            created_at: ts,
            updated_at: ts,
          });
          const items = await trx('day_items').where({ day_id: d.id }).orderBy('position');
          for (const item of items) {
            await trx('day_items').insert({
              ...item,
              id: randomUUID(),
              day_id: newDayId,
              created_at: ts,
              updated_at: ts,
            });
          }
        }
      });
      const row = await db('itineraries').where({ id: newId }).first();
      res.status(201).json(mapItinerary(row));
    }),
  );

  // DELETE /api/itineraries/:id — keep at least one; reassign active if needed.
  r.delete(
    '/itineraries/:id',
    requireOwner((req, db) => tripIdOfItinerary(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const it = await db('itineraries').where({ id: req.params.id }).first();
      if (!it) throw notFound();
      const count = await db('itineraries').where({ trip_id: it.trip_id }).count('* as c').first();
      if (Number(count?.c ?? 0) <= 1) throw badRequest('Cannot delete the only itinerary');
      await db.transaction(async (trx) => {
        await trx('itineraries').where({ id: it.id }).del();
        if (it.is_active) {
          const next = await trx('itineraries').where({ trip_id: it.trip_id }).orderBy('position').first();
          if (next) await trx('itineraries').where({ id: next.id }).update({ is_active: true });
        }
      });
      res.json({ ok: true });
    }),
  );

  /* ---------------- Days ---------------- */

  // GET /api/itineraries/:id/days
  r.get(
    '/itineraries/:id/days',
    requireOwner((req, db) => tripIdOfItinerary(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const rows = await db('days').where({ itinerary_id: req.params.id }).orderBy('position');
      res.json(rows.map(mapDay));
    }),
  );

  // POST /api/itineraries/:id/days
  r.post(
    '/itineraries/:id/days',
    requireOwner((req, db) => tripIdOfItinerary(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const input = dayCreate.parse(req.body);
      const id = randomUUID();
      const ts = new Date().toISOString();
      let position = input.position;
      if (position === undefined) {
        const max = await db('days').where({ itinerary_id: req.params.id }).max('position as m').first();
        position = (max?.m ?? -1) + 1;
      }
      await db('days').insert({
        id,
        itinerary_id: req.params.id,
        position,
        dow: input.dow,
        date_label: input.date_label,
        date: input.date ?? null,
        flag: input.flag,
        flag_color: input.flag_color,
        drive: input.drive,
        note: input.note,
        created_at: ts,
        updated_at: ts,
      });
      const row = await db('days').where({ id }).first();
      res.status(201).json(mapDay(row));
    }),
  );

  // PATCH /api/days/:id
  r.patch(
    '/days/:id',
    requireOwner((req, db) => tripIdOfDay(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const patch = dayUpdate.parse(req.body);
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ['position', 'dow', 'date_label', 'date', 'flag', 'flag_color', 'drive', 'note'] as const) {
        if (patch[k] !== undefined) upd[k] = patch[k];
      }
      await db('days').where({ id: req.params.id }).update(upd);
      const row = await db('days').where({ id: req.params.id }).first();
      if (!row) throw notFound();
      res.json(mapDay(row));
    }),
  );

  // DELETE /api/days/:id
  r.delete(
    '/days/:id',
    requireOwner((req, db) => tripIdOfDay(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      await db('days').where({ id: req.params.id }).del();
      res.json({ ok: true });
    }),
  );

  /* ---------------- Day items ---------------- */

  // GET /api/days/:id/items
  r.get(
    '/days/:id/items',
    requireOwner((req, db) => tripIdOfDay(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const rows = await db('day_items').where({ day_id: req.params.id });
      res.json(rows.map(mapDayItem));
    }),
  );

  // POST /api/days/:id/items
  r.post(
    '/days/:id/items',
    requireOwner((req, db) => tripIdOfDay(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const input = dayItemCreate.parse(req.body);
      // event must belong to the same trip
      const tripId = await tripIdOfDay(db, req.params.id);
      const ev = await db('events').where({ id: input.event_id }).first('trip_id');
      if (!ev || ev.trip_id !== tripId) throw badRequest('event_id must belong to the same trip');
      const id = randomUUID();
      const ts = new Date().toISOString();
      let position = input.position;
      if (position === undefined) {
        const max = await db('day_items').where({ day_id: req.params.id }).max('position as m').first();
        position = (max?.m ?? -1) + 1;
      }
      await db('day_items').insert({
        id,
        day_id: req.params.id,
        event_id: input.event_id,
        position,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        time_of_day: input.time_of_day ?? null,
        note: input.note,
        created_at: ts,
        updated_at: ts,
      });
      const row = await db('day_items').where({ id }).first();
      res.status(201).json(mapDayItem(row));
    }),
  );

  // PATCH /api/day-items/:id
  r.patch(
    '/day-items/:id',
    requireOwner((req, db) => tripIdOfDayItem(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const patch = dayItemUpdate.parse(req.body);
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ['event_id', 'position', 'start_time', 'end_time', 'time_of_day', 'note'] as const) {
        if (patch[k] !== undefined) upd[k] = patch[k];
      }
      await db('day_items').where({ id: req.params.id }).update(upd);
      const row = await db('day_items').where({ id: req.params.id }).first();
      if (!row) throw notFound();
      res.json(mapDayItem(row));
    }),
  );

  // DELETE /api/day-items/:id
  r.delete(
    '/day-items/:id',
    requireOwner((req, db) => tripIdOfDayItem(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      await db('day_items').where({ id: req.params.id }).del();
      res.json({ ok: true });
    }),
  );

  // POST /api/days/:id/reorder — body { itemIds: [...] } sets position by index.
  r.post(
    '/days/:id/reorder',
    requireOwner((req, db) => tripIdOfDay(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const { itemIds } = reorderBody.parse(req.body);
      const existing = await db('day_items').where({ day_id: req.params.id }).select('id');
      const existingIds = new Set(existing.map((x: any) => x.id));
      if (itemIds.length !== existingIds.size || !itemIds.every((id) => existingIds.has(id))) {
        throw badRequest('itemIds must be exactly the current items of this day');
      }
      const ts = new Date().toISOString();
      await db.transaction(async (trx) => {
        for (let i = 0; i < itemIds.length; i++) {
          await trx('day_items').where({ id: itemIds[i] }).update({ position: i, updated_at: ts });
        }
      });
      const rows = await db('day_items').where({ day_id: req.params.id }).orderBy('position');
      res.json(rows.map(mapDayItem));
    }),
  );

  return r;
}
